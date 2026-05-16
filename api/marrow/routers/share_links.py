"""View-only public sharing links for nodes (folders and pages).

Two surfaces:

* Authenticated management routes (`/api/nodes/{node_id}/share-links`,
  `/api/share-links/{link_id}`) — editors create/list, editors+ revoke.
* One unauthenticated route (`GET /shared/{token}`) that renders read-only
  content for anyone with the link. Sharing a folder shares its visible
  (non-trashed) subtree.
"""

import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db
from ..models import Node, OrgRole, ShareLink
from ..rbac import require_node_role, require_share_link_role
from ..schemas import SharedNode, ShareLinkCreate, ShareLinkRead

router = APIRouter(tags=["share-links"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.post(
    "/api/nodes/{node_id}/share-links",
    response_model=ShareLinkRead,
    status_code=201,
)
def create_share_link(
    node_id: UUID,
    body: ShareLinkCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.EDITOR)),
):
    node = db.get(Node, node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Node not found")

    link = ShareLink(
        node_id=node_id,
        token=secrets.token_urlsafe(32),
        created_by=auth.user_id,
        expires_at=body.expires_at,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.get(
    "/api/nodes/{node_id}/share-links",
    response_model=list[ShareLinkRead],
)
def list_share_links(
    node_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_node_role(OrgRole.VIEWER)),
):
    return (
        db.execute(
            select(ShareLink).where(ShareLink.node_id == node_id).order_by(ShareLink.created_at)
        )
        .scalars()
        .all()
    )


@router.delete("/api/share-links/{link_id}", status_code=204)
def revoke_share_link(
    link_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_share_link_role(OrgRole.EDITOR)),
):
    link = db.get(ShareLink, link_id)
    if link is None:
        raise HTTPException(404, "Share link not found")
    db.delete(link)
    db.commit()


# ---------------------------------------------------------------------------
# Public, unauthenticated read-only view
# ---------------------------------------------------------------------------


def _render_node(node: Node, db: Session) -> SharedNode:
    """Recursively render a node and its visible subtree for public viewing."""
    rendered = SharedNode(
        id=node.id,
        type=node.type,  # type: ignore[arg-type]
        name=node.name,
        slug=node.slug,
        description=node.description if node.type == "folder" else None,
    )

    if node.type == "page":
        if node.current_revision is not None:
            rendered.content = node.current_revision.content
            rendered.content_format = node.current_revision.content_format  # type: ignore[assignment]
        return rendered

    children = (
        db.execute(
            select(Node)
            .where(Node.parent_id == node.id, Node.deleted_at.is_(None))
            .order_by(Node.position, Node.created_at)
        )
        .scalars()
        .all()
    )
    rendered.children = [_render_node(child, db) for child in children]
    return rendered


@router.get("/shared/{token}", response_model=SharedNode)
def view_shared(token: str, db: Session = Depends(get_db)):
    """Return read-only rendered content for a share token. No auth required."""
    link = db.execute(select(ShareLink).where(ShareLink.token == token)).scalar_one_or_none()
    if link is None:
        raise HTTPException(404, "Share link not found or revoked")

    if link.expires_at is not None and link.expires_at <= _now():
        raise HTTPException(410, "Share link has expired")

    node = db.get(Node, link.node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Shared content is no longer available")

    return _render_node(node, db)
