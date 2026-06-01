"""Node CRUD, revision, and attachment endpoints."""

import hashlib
import re
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db, get_storage, verify_auth
from ..fractional_index import after as fi_after
from ..links import reconcile_node_links
from ..models import (
    Attachment,
    Node,
    NodeLink,
    NodeWatch,
    OrgRole,
    Revision,
    Space,
    UserStar,
    Workspace,
)
from ..notifications import deliver_mention_notifications
from ..rbac import _check_membership, require_node_role, require_space_role
from ..schemas import (
    AttachmentRead,
    NodeCreate,
    NodeRead,
    NodeReadWithContent,
    NodeUpdate,
    RevisionRead,
    WatchStatus,
)
from ..watches import fan_out_watch_event

router = APIRouter(tags=["nodes"])


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _node_or_404(node_id: UUID, db: Session) -> Node:
    node = db.get(Node, node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Node not found")
    return node


def _trashed_node_or_404(node_id: UUID, db: Session) -> Node:
    """Fetch a node (possibly soft-deleted) for trash operations."""
    node = db.get(Node, node_id)
    if node is None:
        raise HTTPException(404, "Node not found")
    return node


def _authorize_node(db: Session, node: Node, auth: AuthContext, min_role: OrgRole) -> None:
    """Resolve node → org and enforce role. Works for soft-deleted nodes too."""
    space = db.get(Space, node.space_id)
    if space is None:
        raise HTTPException(404, "Space not found")
    workspace = db.get(Workspace, space.workspace_id)
    if workspace is None:
        raise HTTPException(404, "Workspace not found")
    _check_membership(db, workspace.org_id, auth, min_role)


def _with_content(node: Node) -> NodeReadWithContent:
    data = NodeReadWithContent.model_validate(node)
    if node.type == "page" and node.current_revision:
        data.content = node.current_revision.content
        data.content_format = node.current_revision.content_format  # type: ignore[assignment]
    return data


@router.post("/api/spaces/{space_id}/nodes", response_model=NodeRead, status_code=201)
def create_node(
    space_id: UUID,
    body: NodeCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_space_role(OrgRole.EDITOR)),
):
    slug = body.slug or _slugify(body.name)

    if body.position is not None:
        position = body.position
    else:
        max_pos = db.scalar(
            select(func.max(Node.position)).where(
                Node.space_id == space_id,
                Node.parent_id == body.parent_id,
                Node.deleted_at.is_(None),
            )
        )
        position = fi_after(max_pos)

    node = Node(
        space_id=space_id,
        parent_id=body.parent_id,
        type=body.type,
        name=body.name,
        slug=slug,
        position=position,
        description=body.description if body.type == "folder" else None,
    )
    db.add(node)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"Slug '{slug}' already exists in this location")

    if body.type == "page":
        content = body.content or ""
        rev = Revision(
            node_id=node.id,
            content=content,
            content_format=body.content_format,
        )
        db.add(rev)
        db.flush()
        node.current_revision_id = rev.id
        db.flush()
        reconcile_node_links(db, node.id, content, body.content_format)

        deliver_mention_notifications(
            db,
            node=node,
            new_content=content,
            content_format=body.content_format,
            previous_content=None,
            previous_format=None,
            actor_user_id=auth.user_id,
        )

    db.commit()
    db.refresh(node)
    return node


@router.get("/api/spaces/{space_id}/nodes", response_model=list[NodeRead])
def list_space_root_nodes(
    space_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_space_role(OrgRole.VIEWER)),
):
    return (
        db.execute(
            select(Node)
            .where(Node.space_id == space_id, Node.parent_id.is_(None), Node.deleted_at.is_(None))
            .order_by(Node.position, Node.created_at)
        )
        .scalars()
        .all()
    )


@router.get("/api/nodes/{node_id}", response_model=NodeReadWithContent)
def get_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    node = _node_or_404(node_id, db)
    return _with_content(node)


@router.patch("/api/nodes/{node_id}", response_model=NodeReadWithContent)
def update_node(
    node_id: UUID,
    body: NodeUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    node = _node_or_404(node_id, db)

    if body.parent_id is not None and body.parent_id != node.parent_id:
        new_parent = db.get(Node, body.parent_id)
        if new_parent is None or new_parent.deleted_at is not None:
            raise HTTPException(404, "Parent node not found")
        current_space = db.get(Space, node.space_id)
        new_parent_space = db.get(Space, new_parent.space_id)
        if current_space.workspace_id != new_parent_space.workspace_id:
            raise HTTPException(400, "Cannot move node across workspaces")
        node.parent_id = body.parent_id

    if body.name is not None:
        node.name = body.name
    if body.slug is not None:
        node.slug = body.slug
    if body.position is not None:
        # Validate that no live sibling already occupies this position.
        conflict = db.scalar(
            select(Node.id).where(
                Node.space_id == node.space_id,
                Node.parent_id == node.parent_id,
                Node.position == body.position,
                Node.deleted_at.is_(None),
                Node.id != node.id,
            )
        )
        if conflict is not None:
            raise HTTPException(422, "position already occupied by a sibling node")
        node.position = body.position
    if body.description is not None and node.type == "folder":
        node.description = body.description

    saved_revision = False
    if body.content is not None and node.type == "page":
        prev_rev = node.current_revision
        prev_content = prev_rev.content if prev_rev else None
        prev_format = prev_rev.content_format if prev_rev else None

        rev = Revision(
            node_id=node.id,
            content=body.content,
            content_format=body.content_format or "markdown",
        )
        db.add(rev)
        db.flush()
        node.current_revision_id = rev.id
        reconcile_node_links(db, node.id, body.content, body.content_format or "markdown")
        saved_revision = True

        deliver_mention_notifications(
            db,
            node=node,
            new_content=body.content,
            content_format=body.content_format or "markdown",
            previous_content=prev_content,
            previous_format=prev_format,
            actor_user_id=auth.user_id,
        )

    node.updated_at = datetime.now(timezone.utc)

    if saved_revision:
        # Notify watchers best-effort — must not block or fail the save.
        # Use a savepoint so any partial notification rows are rolled back on
        # failure rather than being committed by the db.commit() below.
        sp = db.begin_nested()
        try:
            fan_out_watch_event(db, node=node, actor_user_id=auth.user_id, event="save")
            sp.commit()
        except Exception:
            sp.rollback()

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Slug already exists in this location")

    db.refresh(node)
    return _with_content(node)


@router.delete("/api/nodes/{node_id}", status_code=204)
def delete_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.OWNER)),
):
    """Soft-delete a node and all descendants in a single transaction."""
    _node_or_404(node_id, db)
    db.execute(
        text("""
            WITH RECURSIVE subtree(id) AS (
                SELECT id FROM nodes WHERE id = :root AND deleted_at IS NULL
                UNION ALL
                SELECT n.id FROM nodes n
                JOIN subtree s ON n.parent_id = s.id
                WHERE n.deleted_at IS NULL
            )
            UPDATE nodes SET deleted_at = NOW()
            WHERE id IN (SELECT id FROM subtree)
        """),
        {"root": node_id},
    )
    db.commit()


@router.post("/api/nodes/{node_id}/restore", response_model=NodeRead)
def restore_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    """Restore a soft-deleted node and its trashed subtree.

    422 if the node's parent is itself trashed (no live ancestor to attach to)."""
    node = _trashed_node_or_404(node_id, db)
    _authorize_node(db, node, auth, OrgRole.EDITOR)

    if node.deleted_at is None:
        raise HTTPException(409, "Node is not trashed")

    if node.parent_id is not None:
        parent = db.get(Node, node.parent_id)
        if parent is None or parent.deleted_at is not None:
            raise HTTPException(
                422, "Cannot restore: parent node is missing or trashed"
            )

    db.execute(
        text("""
            WITH RECURSIVE subtree(id) AS (
                SELECT id FROM nodes WHERE id = :root AND deleted_at IS NOT NULL
                UNION ALL
                SELECT n.id FROM nodes n
                JOIN subtree s ON n.parent_id = s.id
                WHERE n.deleted_at IS NOT NULL
            )
            UPDATE nodes SET deleted_at = NULL
            WHERE id IN (SELECT id FROM subtree)
        """),
        {"root": node_id},
    )
    db.commit()
    db.refresh(node)
    return node


@router.delete("/api/nodes/{node_id}/purge", status_code=204)
def purge_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    """Hard-delete a trashed node and its subtree (owners only)."""
    node = _trashed_node_or_404(node_id, db)
    _authorize_node(db, node, auth, OrgRole.OWNER)

    if node.deleted_at is None:
        raise HTTPException(409, "Node must be trashed before it can be purged")

    db.delete(node)
    db.commit()


@router.post("/api/nodes/{node_id}/star", status_code=204)
def star_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    if auth.user_id is None:
        raise HTTPException(400, "Starring requires an authenticated user")
    _node_or_404(node_id, db)

    exists = db.execute(
        select(UserStar).where(
            UserStar.user_id == auth.user_id, UserStar.node_id == node_id
        )
    ).scalar_one_or_none()
    if exists is None:
        db.add(UserStar(user_id=auth.user_id, node_id=node_id))
        try:
            db.commit()
        except IntegrityError:
            # Concurrent star — already exists, treat as success (idempotent).
            db.rollback()


@router.delete("/api/nodes/{node_id}/star", status_code=204)
def unstar_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    if auth.user_id is None:
        raise HTTPException(400, "Starring requires an authenticated user")

    star = db.execute(
        select(UserStar).where(
            UserStar.user_id == auth.user_id, UserStar.node_id == node_id
        )
    ).scalar_one_or_none()
    if star is not None:
        db.delete(star)
        db.commit()


@router.get("/api/nodes/{node_id}/children", response_model=list[NodeRead])
def list_children(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    _node_or_404(node_id, db)
    return (
        db.execute(
            select(Node)
            .where(Node.parent_id == node_id, Node.deleted_at.is_(None))
            .order_by(Node.position, Node.created_at)
        )
        .scalars()
        .all()
    )


@router.get("/api/nodes/{node_id}/backlinks", response_model=list[NodeRead])
def list_backlinks(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    """Nodes that link to this node. Trashed source nodes are excluded."""
    _node_or_404(node_id, db)
    return (
        db.execute(
            select(Node)
            .join(NodeLink, NodeLink.source_node_id == Node.id)
            .where(NodeLink.target_node_id == node_id, Node.deleted_at.is_(None))
            .order_by(Node.name, Node.created_at)
        )
        .scalars()
        .all()
    )


@router.get("/api/nodes/{node_id}/revisions", response_model=list[RevisionRead])
def list_revisions(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    node = _node_or_404(node_id, db)
    if node.type != "page":
        raise HTTPException(400, "Only page nodes have revisions")
    return (
        db.execute(
            select(Revision).where(Revision.node_id == node_id).order_by(Revision.created_at)
        )
        .scalars()
        .all()
    )


@router.get("/api/nodes/{node_id}/revisions/{revision_id}", response_model=RevisionRead)
def get_revision(
    node_id: UUID,
    revision_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    node = _node_or_404(node_id, db)
    if node.type != "page":
        raise HTTPException(400, "Only page nodes have revisions")
    rev = db.get(Revision, revision_id)
    if rev is None or rev.node_id != node_id:
        raise HTTPException(404, "Revision not found")
    return rev


@router.post("/api/nodes/{node_id}/attachments", response_model=AttachmentRead, status_code=201)
def upload_attachment(
    node_id: UUID,
    file: UploadFile,
    db: Session = Depends(get_db),
    storage=Depends(get_storage),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    node = _node_or_404(node_id, db)
    data = file.file.read()
    file_hash = hashlib.sha256(data).hexdigest()

    attachment = Attachment(
        node_id=node.id,
        filename=file.filename or "upload",
        hash=file_hash,
        size_bytes=len(data),
    )
    db.add(attachment)
    db.flush()
    storage.write(str(attachment.id), attachment.filename, data)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.get("/api/nodes/{node_id}/attachments", response_model=list[AttachmentRead])
def list_attachments(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    _node_or_404(node_id, db)
    return (
        db.execute(
            select(Attachment).where(Attachment.node_id == node_id).order_by(Attachment.created_at)
        )
        .scalars()
        .all()
    )


@router.get("/api/nodes/{node_id}/attachments/{attachment_id}/file")
def download_attachment(
    node_id: UUID,
    attachment_id: UUID,
    db: Session = Depends(get_db),
    storage=Depends(get_storage),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    _node_or_404(node_id, db)
    attachment = db.get(Attachment, attachment_id)
    if attachment is None or attachment.node_id != node_id:
        raise HTTPException(404, "Attachment not found")
    data = storage.read(str(attachment.id), attachment.filename)
    return Response(content=data, media_type="application/octet-stream")


def _require_user(auth: AuthContext) -> UUID:
    """Watches are user-scoped — API-key/anonymous callers have no identity."""
    if auth.user_id is None:
        raise HTTPException(401, "User authentication required to watch nodes")
    return auth.user_id


@router.get("/api/nodes/{node_id}/watching", response_model=WatchStatus)
def get_watch_status(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    user_id = _require_user(auth)
    _node_or_404(node_id, db)
    watch = db.execute(
        select(NodeWatch).where(
            NodeWatch.node_id == node_id, NodeWatch.user_id == user_id
        )
    ).scalar_one_or_none()
    return WatchStatus(watching=watch is not None)


@router.post("/api/nodes/{node_id}/watch", response_model=WatchStatus, status_code=201)
def watch_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    user_id = _require_user(auth)
    _node_or_404(node_id, db)
    existing = db.execute(
        select(NodeWatch).where(
            NodeWatch.node_id == node_id, NodeWatch.user_id == user_id
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(NodeWatch(node_id=node_id, user_id=user_id))
        db.commit()
    return WatchStatus(watching=True)


@router.delete("/api/nodes/{node_id}/watch", status_code=204)
def unwatch_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    user_id = _require_user(auth)
    _node_or_404(node_id, db)
    watch = db.execute(
        select(NodeWatch).where(
            NodeWatch.node_id == node_id, NodeWatch.user_id == user_id
        )
    ).scalar_one_or_none()
    if watch is not None:
        db.delete(watch)
        db.commit()
