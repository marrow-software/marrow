"""Node view CRUD endpoints.

Views are configurable presentations (table, board, list) over the descendant
page nodes of a folder. Sort/filter/group-by lives in the JSONB `config` blob.
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db, verify_auth
from ..models import Node, NodeView, OrgRole, Space, Workspace
from ..rbac import _check_membership, require_node_role
from ..schemas import NodeViewCreate, NodeViewRead, NodeViewUpdate

router = APIRouter(tags=["node_views"])


def _view_or_404(view_id: UUID, db: Session) -> NodeView:
    view = db.get(NodeView, view_id)
    if view is None:
        raise HTTPException(404, "View not found")
    return view


def _require_view_role(min_role: OrgRole):
    """Resolve view → folder → space → workspace → org and check role."""

    def _dep(
        view_id: UUID,
        db: Session = Depends(get_db),
        auth: AuthContext = Depends(verify_auth),
    ) -> AuthContext:
        view = _view_or_404(view_id, db)
        node = db.get(Node, view.folder_node_id)
        if node is None:
            raise HTTPException(404, "Folder not found")
        space = db.get(Space, node.space_id)
        workspace = db.get(Workspace, space.workspace_id)
        _check_membership(db, workspace.org_id, auth, min_role)
        return auth

    return _dep


@router.get("/api/nodes/{node_id}/views", response_model=list[NodeViewRead])
def list_views(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    return (
        db.execute(
            select(NodeView)
            .where(NodeView.folder_node_id == node_id)
            .order_by(NodeView.position, NodeView.created_at)
        )
        .scalars()
        .all()
    )


@router.post("/api/nodes/{node_id}/views", response_model=NodeViewRead, status_code=201)
def create_view(
    node_id: UUID,
    body: NodeViewCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    node = db.get(Node, node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Node not found")
    if node.type != "folder":
        raise HTTPException(400, "Views can only be attached to folder nodes")

    view = NodeView(
        folder_node_id=node_id,
        name=body.name,
        view_type=body.view_type,
        config=body.config or {},
        position=body.position or "a0",
    )
    db.add(view)
    db.commit()
    db.refresh(view)
    return view


@router.get("/api/views/{view_id}", response_model=NodeViewRead)
def get_view(
    view_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(_require_view_role(OrgRole.VIEWER)),
):
    return _view_or_404(view_id, db)


@router.patch("/api/views/{view_id}", response_model=NodeViewRead)
def update_view(
    view_id: UUID,
    body: NodeViewUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(_require_view_role(OrgRole.EDITOR)),
):
    view = _view_or_404(view_id, db)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(view, k, v)
    view.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(view)
    return view


@router.delete("/api/views/{view_id}", status_code=204)
def delete_view(
    view_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(_require_view_role(OrgRole.EDITOR)),
):
    view = _view_or_404(view_id, db)
    db.delete(view)
    db.commit()
