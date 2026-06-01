"""Space CRUD endpoints (nested under workspaces)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db
from ..models import Organization, OrgMembership, OrgRole, Space, Workspace
from ..rbac import require_workspace_role
from ..schemas import SpaceCreate, SpaceRead

router = APIRouter(prefix="/api/workspaces/{workspace_id}/spaces", tags=["spaces"])


def _get_workspace_or_404(workspace_id: UUID, db: Session) -> Workspace:
    ws = db.get(Workspace, workspace_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


@router.get("", response_model=list[SpaceRead])
def list_spaces(
    workspace_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_workspace_role(OrgRole.VIEWER)),
):
    _get_workspace_or_404(workspace_id, db)
    return db.query(Space).filter_by(workspace_id=workspace_id).order_by(Space.created_at).all()


@router.post("", response_model=SpaceRead, status_code=201)
def create_space(
    workspace_id: UUID,
    body: SpaceCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_workspace_role(OrgRole.EDITOR)),
):
    ws = _get_workspace_or_404(workspace_id, db)

    # If the org restricts space creation to owners only, enforce that here
    if auth.user_id is not None:
        org = db.get(Organization, ws.org_id)
        if org is not None and not org.members_can_create_spaces:
            membership = db.execute(
                select(OrgMembership)
                .where(OrgMembership.org_id == ws.org_id, OrgMembership.user_id == auth.user_id)
            ).scalar_one_or_none()
            if membership is None or membership.role != OrgRole.OWNER:
                raise HTTPException(403, "Only org owners can create spaces in this workspace")

    space = Space(workspace_id=workspace_id, slug=body.slug, name=body.name)
    db.add(space)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail=f"Space slug '{body.slug}' already exists in this workspace"
        )
    db.refresh(space)
    return space


@router.get("/{space_id}", response_model=SpaceRead)
def get_space(
    workspace_id: UUID,
    space_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_workspace_role(OrgRole.VIEWER)),
):
    _get_workspace_or_404(workspace_id, db)
    space = db.get(Space, space_id)
    if space is None or space.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Space not found")
    return space


@router.delete("/{space_id}", status_code=204)
def delete_space(
    workspace_id: UUID,
    space_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_workspace_role(OrgRole.OWNER)),
):
    _get_workspace_or_404(workspace_id, db)
    space = db.get(Space, space_id)
    if space is None or space.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Space not found")
    db.delete(space)
    db.commit()
