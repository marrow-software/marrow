"""Workspace CRUD endpoints."""

import os
import tempfile
from collections import defaultdict
from io import BytesIO
from operator import attrgetter
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db, get_search_backend, verify_auth
from ..models import Node, OrgRole, Space, Workspace
from ..rbac import require_workspace_role
from ..schemas import (
    NodeRead,
    NodeTreeItem,
    SearchResponse,
    SearchResultItem,
    SpaceTreeItem,
    WorkspaceRead,
    WorkspaceTree,
)
from ..search import SearchBackend
from ..storage import LocalFilesystemAdapter

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])

_MAX_BUNDLE_BYTES = 500 * 1024 * 1024  # 500 MB


def _build_node_tree(nodes: list[Node]) -> list[NodeTreeItem]:
    children_map: dict[UUID, list[Node]] = defaultdict(list)
    for node in nodes:
        if node.parent_id is not None:
            children_map[node.parent_id].append(node)

    by_position = attrgetter("position")

    def to_item(node: Node) -> NodeTreeItem:
        return NodeTreeItem(
            id=node.id,
            parent_id=node.parent_id,
            type=node.type,
            name=node.name,
            slug=node.slug,
            position=node.position,
            description=node.description,
            children=[to_item(c) for c in sorted(children_map.get(node.id, []), key=by_position)],
        )

    roots = [n for n in nodes if n.parent_id is None]
    return [to_item(n) for n in sorted(roots, key=by_position)]


@router.get("", response_model=list[WorkspaceRead])
def list_workspaces(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    """List workspaces. Session users see only workspaces in their orgs."""
    if auth.method in ("api_key", "anonymous"):
        return db.query(Workspace).order_by(Workspace.created_at).all()

    return (
        db.execute(
            select(Workspace)
            .join(OrgMembership, OrgMembership.org_id == Workspace.org_id)
            .where(OrgMembership.user_id == auth.user_id)
            .order_by(Workspace.created_at)
        )
        .scalars()
        .all()
    )


@router.post("", status_code=410)
def create_workspace_deprecated():
    """Deprecated: use POST /api/orgs/{org_id}/workspaces instead."""
    raise HTTPException(410, "This endpoint has been removed. Use POST /api/orgs/{org_id}/workspaces instead.")


@router.post("/restore", response_model=WorkspaceRead, status_code=201)
async def restore_workspace_endpoint(
    bundle: UploadFile,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    """Restore a workspace from an uploaded export bundle zip."""
    from ..restore import restore_workspace

    storage_root = os.getenv("STORAGE_PATH", "/var/lib/marrow/attachments")
    storage = LocalFilesystemAdapter(storage_root)

    # Read one byte over the limit to distinguish "at limit" from "over limit"
    data = await bundle.read(_MAX_BUNDLE_BYTES + 1)
    if len(data) > _MAX_BUNDLE_BYTES:
        raise HTTPException(status_code=413, detail="Bundle exceeds maximum allowed size (500 MB)")

    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)

    try:
        slug = restore_workspace(tmp_path, db, storage)
        db.commit()
    except ValueError as e:
        db.rollback()
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        db.rollback()
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"Failed to restore bundle: {e}")

    tmp_path.unlink(missing_ok=True)

    ws = db.query(Workspace).filter_by(slug=slug).first()
    return ws


@router.get("/{workspace_id}", response_model=WorkspaceRead)
def get_workspace(
    workspace_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_workspace_role(OrgRole.VIEWER)),
):
    ws = db.get(Workspace, workspace_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


@router.get("/{workspace_id}/tree", response_model=WorkspaceTree)
def get_workspace_tree(
    workspace_id: UUID,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(require_workspace_role(OrgRole.VIEWER)),
) -> WorkspaceTree:
    ws = db.get(Workspace, workspace_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    spaces = db.execute(select(Space).where(Space.workspace_id == workspace_id)).scalars().all()
    space_ids = [s.id for s in spaces]
    nodes_by_space: dict[UUID, list[Node]] = defaultdict(list)
    if space_ids:
        all_nodes = (
            db.execute(select(Node).where(Node.space_id.in_(space_ids), Node.deleted_at.is_(None)))
            .scalars()
            .all()
        )
        for node in all_nodes:
            nodes_by_space[node.space_id].append(node)

    return WorkspaceTree(
        id=ws.id,
        org_id=ws.org_id,
        slug=ws.slug,
        name=ws.name,
        spaces=[
            SpaceTreeItem(
                id=s.id,
                slug=s.slug,
                name=s.name,
                nodes=_build_node_tree(nodes_by_space[s.id]),
            )
            for s in spaces
        ],
    )


@router.get("/{workspace_id}/trash", response_model=list[NodeRead])
def list_workspace_trash(
    workspace_id: UUID,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(require_workspace_role(OrgRole.VIEWER)),
):
    """List top-level trashed nodes — those whose nearest non-trashed ancestor
    is the space (either a root node, or a node whose parent is still live)."""
    space_ids = [
        sid
        for (sid,) in db.execute(
            select(Space.id).where(Space.workspace_id == workspace_id)
        ).all()
    ]
    if not space_ids:
        return []

    # Trashed node is "top-level" iff parent_id is NULL or parent.deleted_at IS NULL.
    parent = Node.__table__.alias("parent")
    return (
        db.execute(
            select(Node)
            .outerjoin(parent, parent.c.id == Node.parent_id)
            .where(
                Node.space_id.in_(space_ids),
                Node.deleted_at.is_not(None),
                (Node.parent_id.is_(None)) | (parent.c.deleted_at.is_(None)),
            )
            .order_by(Node.deleted_at.desc())
        )
        .scalars()
        .all()
    )


@router.get("/{workspace_id}/search", response_model=SearchResponse)
def search_workspace(
    workspace_id: UUID,
    q: str = "",
    db: Session = Depends(get_db),
    search: SearchBackend = Depends(get_search_backend),
    auth: AuthContext = Depends(require_workspace_role(OrgRole.VIEWER)),
):
    ws = db.get(Workspace, workspace_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    results = search.search(workspace_id, q, db)
    return SearchResponse(
        query=q,
        results=[SearchResultItem(**vars(r)) for r in results],
    )


@router.get("/{workspace_id}/export/estimate")
def estimate_workspace_export(
    workspace_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_workspace_role(OrgRole.VIEWER)),
):
    """Return pre-compression byte estimates for full and slim export bundles."""
    from ..export import estimate_export_sizes

    ws = db.get(Workspace, workspace_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    storage_root = os.getenv("STORAGE_PATH", "/var/lib/marrow/attachments")
    storage = LocalFilesystemAdapter(storage_root)

    return estimate_export_sizes(slug=ws.slug, session=db, storage=storage)


@router.get("/{workspace_id}/export")
def export_workspace_endpoint(
    workspace_id: UUID,
    slim: bool = False,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_workspace_role(OrgRole.VIEWER)),
):
    """Download a workspace export bundle as a zip file."""
    from pathlib import Path

    from ..export import export_workspace

    ws = db.get(Workspace, workspace_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    storage_root = os.getenv("STORAGE_PATH", "/var/lib/marrow/attachments")
    storage = LocalFilesystemAdapter(storage_root)

    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        bundle_path = export_workspace(
            slug=ws.slug,
            session=db,
            storage=storage,
            output_path=Path(tmp),
            slim=slim,
        )
        data = bundle_path.read_bytes()

    return StreamingResponse(
        BytesIO(data),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{bundle_path.name}"'},
    )


@router.delete("/{workspace_id}", status_code=204)
def delete_workspace(
    workspace_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_workspace_role(OrgRole.OWNER)),
):
    ws = db.get(Workspace, workspace_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    db.delete(ws)
    db.commit()
