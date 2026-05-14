"""Share link routes: management (authed) and public view (unauthed)."""

import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db, verify_auth
from ..models import Node, OrgRole, ShareLink, Space, Workspace
from ..rbac import _check_membership, require_node_role
from ..schemas import (
    SharedNodeChild,
    SharedNodeRead,
    ShareLinkCreate,
    ShareLinkRead,
)

router = APIRouter(tags=["share"])


def _generate_token() -> str:
    return secrets.token_urlsafe(24)


def _resolve_share_link_org(db: Session, link: ShareLink) -> UUID:
    node = db.get(Node, link.node_id)
    if node is None:
        raise HTTPException(404, "Node not found")
    space = db.get(Space, node.space_id)
    workspace = db.get(Workspace, space.workspace_id)
    return workspace.org_id


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
        node_id=node.id,
        token=_generate_token(),
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
            select(ShareLink)
            .where(ShareLink.node_id == node_id)
            .order_by(ShareLink.created_at.desc())
        )
        .scalars()
        .all()
    )


@router.delete("/api/share-links/{link_id}", status_code=204)
def revoke_share_link(
    link_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    link = db.get(ShareLink, link_id)
    if link is None:
        raise HTTPException(404, "Share link not found")
    org_id = _resolve_share_link_org(db, link)
    _check_membership(db, org_id, auth, OrgRole.EDITOR)

    if link.revoked_at is None:
        link.revoked_at = datetime.now(timezone.utc)
        db.commit()


@router.get("/shared/{token}", response_model=SharedNodeRead)
def get_shared_node(token: str, db: Session = Depends(get_db)):
    """Public, unauthenticated view of a shared node.

    For pages: returns rendered content. For folders: returns the visible
    (non-trashed) immediate-child index.
    """
    link = db.execute(select(ShareLink).where(ShareLink.token == token)).scalar_one_or_none()
    if link is None:
        raise HTTPException(404, "Share link not found")
    if link.revoked_at is not None:
        raise HTTPException(410, "Share link has been revoked")
    if link.expires_at is not None and link.expires_at < datetime.now(timezone.utc):
        raise HTTPException(410, "Share link has expired")

    node = db.get(Node, link.node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(404, "Shared node not found")

    response = SharedNodeRead(
        id=node.id,
        type=node.type,  # type: ignore[arg-type]
        name=node.name,
        slug=node.slug,
        description=node.description,
        expires_at=link.expires_at,
    )

    if node.type == "page" and node.current_revision is not None:
        response.content = node.current_revision.content
        response.content_format = node.current_revision.content_format  # type: ignore[assignment]
    elif node.type == "folder":
        children = (
            db.execute(
                select(Node)
                .where(Node.parent_id == node.id, Node.deleted_at.is_(None))
                .order_by(Node.position, Node.created_at)
            )
            .scalars()
            .all()
        )
        response.children = [
            SharedNodeChild(id=c.id, type=c.type, name=c.name, slug=c.slug)  # type: ignore[arg-type]
            for c in children
        ]

    return response
