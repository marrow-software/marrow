"""Per-user starred-node endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db, verify_auth
from ..models import Node, OrgRole, Space, UserStar, Workspace
from ..rbac import require_node_role
from ..schemas import StarredNode

router = APIRouter(tags=["stars"])


def _require_user(auth: AuthContext) -> UUID:
    if auth.user_id is None:
        # API key / anonymous have no user identity to scope stars against.
        raise HTTPException(400, "Starring requires a user session")
    return auth.user_id


@router.get("/api/users/me/starred", response_model=list[StarredNode])
def list_my_starred(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    user_id = _require_user(auth)
    rows = db.execute(
        select(
            UserStar.node_id,
            UserStar.created_at,
            Node.space_id,
            Node.type,
            Node.name,
            Node.slug,
            Space.workspace_id,
        )
        .join(Node, Node.id == UserStar.node_id)
        .join(Space, Space.id == Node.space_id)
        .where(
            UserStar.user_id == user_id,
            Node.deleted_at.is_(None),
        )
        .order_by(UserStar.created_at.desc())
    ).all()
    return [
        StarredNode(
            node_id=r.node_id,
            space_id=r.space_id,
            workspace_id=r.workspace_id,
            type=r.type,
            name=r.name,
            slug=r.slug,
            starred_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/api/nodes/{node_id}/star", status_code=204)
def star_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    user_id = _require_user(auth)
    star = UserStar(user_id=user_id, node_id=node_id)
    db.add(star)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # Already starred — treat as idempotent success.
    return Response(status_code=204)


@router.delete("/api/nodes/{node_id}/star", status_code=204)
def unstar_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    user_id = _require_user(auth)
    existing = db.execute(
        select(UserStar).where(UserStar.user_id == user_id, UserStar.node_id == node_id)
    ).scalar_one_or_none()
    if existing is not None:
        db.delete(existing)
        db.commit()
    return Response(status_code=204)
