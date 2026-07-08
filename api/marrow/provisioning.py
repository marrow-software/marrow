"""Default workspace + space provisioning for first-run personal orgs (#241)."""

import re
import uuid

from sqlalchemy.orm import Session

from .models import Space, Workspace


def _unique_workspace_slug(db: Session, base: str) -> str:
    """Generate a globally unique workspace slug, appending a suffix on collision."""
    slug = re.sub(r"[^a-z0-9-]", "-", base.lower()).strip("-")[:50] or "main"
    candidate = slug
    while db.query(Workspace).filter(Workspace.slug == candidate).first() is not None:
        suffix = uuid.uuid4().hex[:4]
        candidate = f"{slug}-{suffix}"
    return candidate


def provision_default_workspace_and_space(
    db: Session, org_id: uuid.UUID
) -> tuple[Workspace, Space]:
    """Create one default workspace and space for a newly onboarded personal org.

    Slug is derived from ``org_id`` so concurrent first-time signups cannot race
    on a shared ``main`` slug at commit time.
    """
    ws_slug = _unique_workspace_slug(db, f"main-{org_id.hex}")
    ws = Workspace(org_id=org_id, slug=ws_slug, name="Main")
    db.add(ws)
    db.flush()

    space = Space(workspace_id=ws.id, slug="main", name="Main")
    db.add(space)
    db.flush()
    return ws, space
