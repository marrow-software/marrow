"""Per-user endpoints (starred nodes)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db, verify_auth
from ..models import Node, UserStar
from ..schemas import StarredNodeRead

router = APIRouter(tags=["users"])


@router.get("/api/users/me/starred", response_model=list[StarredNodeRead])
def list_starred(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    """List the current user's starred nodes (trashed nodes excluded)."""
    if auth.user_id is None:
        raise HTTPException(400, "Starring requires an authenticated user")

    rows = db.execute(
        select(Node, UserStar.created_at)
        .join(UserStar, UserStar.node_id == Node.id)
        .where(UserStar.user_id == auth.user_id, Node.deleted_at.is_(None))
        .order_by(UserStar.created_at.desc())
    ).all()

    return [
        StarredNodeRead(
            id=node.id,
            space_id=node.space_id,
            parent_id=node.parent_id,
            type=node.type,
            name=node.name,
            slug=node.slug,
            starred_at=starred_at,
        )
        for node, starred_at in rows
    ]
