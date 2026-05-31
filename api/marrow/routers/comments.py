"""Page-level comment endpoints.

Comments are flat threads with a single level of replies (``parent_comment_id``
self-FK). Block-level comments are out of scope, but the schema leaves room for
a future ``block_id`` column without a breaking change.

RBAC: viewer to read, editor to write/edit/resolve, owner-or-author to delete.
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db
from ..models import Comment, Node, OrgMembership, OrgRole, Space, Workspace
from ..rbac import require_comment_role, require_node_role
from ..schemas import CommentCreate, CommentRead, CommentUpdate

router = APIRouter(tags=["comments"])


def _page_node_or_404(node_id: UUID, db: Session) -> Node:
    node = db.get(Node, node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Node not found")
    if node.type != "page":
        raise HTTPException(400, "Comments are only supported on page nodes")
    return node


def _to_read(comment: Comment) -> CommentRead:
    data = CommentRead.model_validate(comment)
    data.author_name = comment.author.name if comment.author else None
    return data


@router.get("/api/nodes/{node_id}/comments", response_model=list[CommentRead])
def list_comments(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    _page_node_or_404(node_id, db)
    comments = (
        db.execute(select(Comment).where(Comment.node_id == node_id).order_by(Comment.created_at))
        .scalars()
        .all()
    )
    return [_to_read(c) for c in comments]


@router.post("/api/nodes/{node_id}/comments", response_model=CommentRead, status_code=201)
def create_comment(
    node_id: UUID,
    body: CommentCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    _page_node_or_404(node_id, db)

    if not body.body.strip():
        raise HTTPException(422, "Comment body cannot be empty")

    if body.parent_comment_id is not None:
        parent = db.get(Comment, body.parent_comment_id)
        if parent is None or parent.node_id != node_id:
            raise HTTPException(404, "Parent comment not found")
        if parent.parent_comment_id is not None:
            raise HTTPException(400, "Replies cannot be nested more than one level")

    comment = Comment(
        node_id=node_id,
        author_user_id=auth.user_id,
        parent_comment_id=body.parent_comment_id,
        body=body.body,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return _to_read(comment)


@router.patch("/api/comments/{comment_id}", response_model=CommentRead)
def update_comment(
    comment_id: UUID,
    body: CommentUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_comment_role(OrgRole.EDITOR)),
):
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(404, "Comment not found")

    if body.body is not None:
        if not body.body.strip():
            raise HTTPException(422, "Comment body cannot be empty")
        comment.body = body.body

    if body.resolved is not None:
        comment.resolved_at = datetime.now(timezone.utc) if body.resolved else None

    comment.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(comment)
    return _to_read(comment)


@router.delete("/api/comments/{comment_id}", status_code=204)
def delete_comment(
    comment_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_comment_role(OrgRole.EDITOR)),
):
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(404, "Comment not found")

    # Owner OR original author may delete. API key / anonymous auth has no
    # user_id and is treated as superuser (consistent with RBAC bypass).
    if auth.user_id is not None:
        is_author = comment.author_user_id == auth.user_id
        if not is_author and not _is_org_owner(db, comment, auth):
            raise HTTPException(403, "Only the author or an org owner can delete this comment")

    db.delete(comment)
    db.commit()


def _is_org_owner(db: Session, comment: Comment, auth: AuthContext) -> bool:
    org_id = db.execute(
        select(Workspace.org_id)
        .join(Space, Space.workspace_id == Workspace.id)
        .join(Node, Node.space_id == Space.id)
        .where(Node.id == comment.node_id)
    ).scalar_one_or_none()
    if org_id is None:
        return False
    role = db.execute(
        select(OrgMembership.role).where(
            OrgMembership.org_id == org_id,
            OrgMembership.user_id == auth.user_id,
        )
    ).scalar_one_or_none()
    return role == OrgRole.OWNER.value
