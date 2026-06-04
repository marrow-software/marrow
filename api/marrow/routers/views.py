"""CRUD endpoints for node views (table / board / list over a folder).

A view is always anchored to a *folder* node and renders that folder's
descendant page nodes. Views are pure presentation metadata — creating,
editing or deleting one never touches the underlying nodes.
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db
from ..models import Node, NodeView, OrgRole
from ..rbac import require_node_role, require_view_role
from ..schemas import NodeViewCreate, NodeViewRead, NodeViewUpdate

router = APIRouter(tags=["views"])


def _folder_or_404(node_id: UUID, db: Session) -> Node:
    node = db.get(Node, node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Node not found")
    if node.type != "folder":
        raise HTTPException(400, "Views can only be attached to folder nodes")
    return node


def _view_or_404(view_id: UUID, db: Session) -> NodeView:
    view = db.get(NodeView, view_id)
    if view is None:
        raise HTTPException(404, "View not found")
    return view


@router.post("/api/nodes/{node_id}/views", response_model=NodeViewRead, status_code=201)
def create_view(
    node_id: UUID,
    body: NodeViewCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    _folder_or_404(node_id, db)
    view = NodeView(
        folder_node_id=node_id,
        name=body.name,
        view_type=body.view_type,
        position="a0",
        config=body.config.model_dump(),
    )
    db.add(view)
    db.commit()
    db.refresh(view)
    return view


@router.get("/api/nodes/{node_id}/views", response_model=list[NodeViewRead])
def list_views(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    _folder_or_404(node_id, db)
    return (
        db.execute(
            select(NodeView)
            .where(NodeView.folder_node_id == node_id)
            .order_by(NodeView.position, NodeView.created_at)
        )
        .scalars()
        .all()
    )


@router.get("/api/views/{view_id}", response_model=NodeViewRead)
def get_view(
    view_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_view_role(OrgRole.VIEWER)),
):
    return _view_or_404(view_id, db)


@router.patch("/api/views/{view_id}", response_model=NodeViewRead)
def update_view(
    view_id: UUID,
    body: NodeViewUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_view_role(OrgRole.EDITOR)),
):
    view = _view_or_404(view_id, db)
    if body.name is not None:
        view.name = body.name
    if body.view_type is not None:
        view.view_type = body.view_type
    if body.position is not None:
        view.position = body.position
    if body.config is not None:
        view.config = body.config.model_dump()
    view.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(view)
    return view


@router.delete("/api/views/{view_id}", status_code=204)
def delete_view(
    view_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_view_role(OrgRole.EDITOR)),
):
    view = _view_or_404(view_id, db)
    db.delete(view)
    db.commit()
