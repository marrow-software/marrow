"""Per-user endpoints (starred nodes, cross-workspace recent)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db, verify_auth
from ..models import Node, UserStar
from ..schemas import MyRecentItem, StarredNodeRead
from ..search import _ANCESTOR_PATH_CTE

router = APIRouter(tags=["users"])

# Recently-edited pages across every workspace the user can access. Ordered by
# latest revision (append-only, so MAX(created_at) is a reliable recency
# signal), falling back to the node's creation time. Scoped via the
# org_memberships join so users only see pages in orgs they belong to.
_MY_RECENT_SQL = text(
    """
    SELECT
        n.id AS node_id,
        n.name,
        s.id AS space_id,
        s.name AS space_name,
        w.id AS workspace_id,
        w.name AS workspace_name,
        COALESCE(
            ("""
    + _ANCESTOR_PATH_CTE
    + """),
            ARRAY[]::text[]
        ) AS node_path,
        COALESCE(MAX(r.created_at), n.created_at) AS updated_at
    FROM nodes n
    JOIN spaces s ON s.id = n.space_id
    JOIN workspaces w ON w.id = s.workspace_id
    JOIN org_memberships m ON m.org_id = w.org_id AND m.user_id = :user_id
    LEFT JOIN revisions r ON r.node_id = n.id
    WHERE n.type = 'page'
      AND n.deleted_at IS NULL
    GROUP BY n.id, n.name, s.id, s.name, w.id, w.name, n.parent_id, n.created_at
    ORDER BY updated_at DESC
    LIMIT :limit
    """
)


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


@router.get("/api/users/me/recent", response_model=list[MyRecentItem])
def list_recent(
    limit: int = 12,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    """Recently-edited pages across every workspace the current user can access."""
    if auth.user_id is None:
        raise HTTPException(400, "Recent pages require an authenticated user")

    limit = max(1, min(limit, 50))
    rows = db.execute(_MY_RECENT_SQL, {"user_id": auth.user_id, "limit": limit}).fetchall()

    return [
        MyRecentItem(
            node_id=row.node_id,
            name=row.name,
            space_id=row.space_id,
            space_name=row.space_name,
            workspace_id=row.workspace_id,
            workspace_name=row.workspace_name,
            node_path=list(row.node_path) if row.node_path else [],
            updated_at=row.updated_at,
        )
        for row in rows
    ]
