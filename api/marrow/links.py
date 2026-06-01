"""Backlink index: parse page content for links and reconcile ``node_links``.

A page links to another node in two ways:

* **Wiki-links** — a Markdown/BlockNote link whose href points at a node, e.g.
  ``/w/{workspace}/pages/{node-id}`` or the export-relative ``/pages/{node-id}``.
* **`@` mentions** — a BlockNote ``mention`` inline element. User mentions carry
  a ``userId`` (not a node) and are ignored here; a mention that carries a
  ``nodeId`` prop is treated as a link for forward-compatibility.

The set of targets parsed from a node's current content is reconciled into the
``node_links`` table on every save (add new, remove stale). Export serializes
the index into ``links.json``; restore rebuilds it.
"""

import json
import logging
import re
import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import Node, NodeLink

logger = logging.getLogger(__name__)

# A canonical UUID, optionally followed by a trailing path/query/fragment.
_UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"

# Markdown link target: [text](href)
_MD_HREF_RE = re.compile(r"\[(?:[^\]]*)\]\(([^)]+)\)")

# Pull the node id out of a /pages/{id} href (with or without a /w/{ws} prefix).
_PAGE_HREF_RE = re.compile(rf"/pages/({_UUID})(?:[/?#]|$)")


def _href_to_node_id(href: str) -> uuid.UUID | None:
    match = _PAGE_HREF_RE.search(href)
    if match is None:
        return None
    try:
        return uuid.UUID(match.group(1))
    except ValueError:
        return None


def _walk_json(value: object, targets: set[uuid.UUID]) -> None:
    """Recursively collect link/mention node targets from BlockNote JSON."""
    if isinstance(value, list):
        for item in value:
            _walk_json(item, targets)
        return
    if not isinstance(value, dict):
        return

    node_type = value.get("type")
    if node_type == "link":
        nid = _href_to_node_id(value.get("href", ""))
        if nid is not None:
            targets.add(nid)
    elif node_type == "mention":
        # User mentions carry a userId, not a node. A nodeId prop (if any
        # editor produces one) is treated as a link for forward-compat.
        node_id = value.get("props", {}).get("nodeId")
        if node_id:
            try:
                targets.add(uuid.UUID(str(node_id)))
            except ValueError:
                pass

    for child_key in ("content", "children"):
        if child_key in value:
            _walk_json(value[child_key], targets)


def extract_link_targets(content: str | None, content_format: str) -> set[uuid.UUID]:
    """Return the set of node ids *content* links to.

    Works for both Markdown (``content_format='markdown'``) and BlockNote JSON
    (``content_format='json'``) content. Never raises on malformed input.
    """
    if not content:
        return set()

    targets: set[uuid.UUID] = set()

    if content_format == "json":
        try:
            _walk_json(json.loads(content), targets)
        except (json.JSONDecodeError, TypeError):
            return set()
        return targets

    for href in _MD_HREF_RE.findall(content):
        nid = _href_to_node_id(href)
        if nid is not None:
            targets.add(nid)
    return targets


def reconcile_node_links(
    db: Session,
    source_node_id: uuid.UUID,
    content: str | None,
    content_format: str,
) -> None:
    """Make ``node_links`` for *source_node_id* match the links in *content*.

    Adds rows for new targets and deletes rows for targets no longer present.
    Self-links and links to missing or trashed nodes are dropped. The caller
    is responsible for committing the session.
    """
    targets = extract_link_targets(content, content_format)
    targets.discard(source_node_id)

    if targets:
        live = set(
            db.execute(
                select(Node.id).where(Node.id.in_(targets), Node.deleted_at.is_(None))
            ).scalars()
        )
        targets &= live

    existing = set(
        db.execute(
            select(NodeLink.target_node_id).where(NodeLink.source_node_id == source_node_id)
        ).scalars()
    )

    stale = existing - targets
    if stale:
        db.execute(
            delete(NodeLink).where(
                NodeLink.source_node_id == source_node_id,
                NodeLink.target_node_id.in_(stale),
            )
        )

    for target_id in targets - existing:
        db.add(NodeLink(source_node_id=source_node_id, target_node_id=target_id))


def serialize_node_links(db: Session, node_ids: set[uuid.UUID]) -> list[dict]:
    """Return ``node_links`` rows whose source is in *node_ids*, for export."""
    if not node_ids:
        return []
    rows = db.execute(
        select(NodeLink.source_node_id, NodeLink.target_node_id)
        .where(NodeLink.source_node_id.in_(node_ids))
        .order_by(NodeLink.source_node_id, NodeLink.target_node_id)
    ).all()
    return [{"source_node_id": str(src), "target_node_id": str(tgt)} for src, tgt in rows]


def rebuild_node_links(db: Session, links: list[dict]) -> None:
    """Recreate ``node_links`` rows from an export *links* list, on restore.

    Idempotent: deletes any existing links for all source nodes in the list
    before re-inserting, so retried restores don't hit unique-constraint errors.
    Skips entries whose endpoints are missing so a partial bundle still
    restores cleanly without FK violations. The caller is responsible for
    committing the session.
    """
    candidates: list[tuple[uuid.UUID, uuid.UUID]] = []
    for link in links:
        try:
            src = uuid.UUID(link["source_node_id"])
            tgt = uuid.UUID(link["target_node_id"])
        except (KeyError, ValueError):
            logger.warning("rebuild_node_links: skipping corrupt link entry %r", link)
            continue
        candidates.append((src, tgt))

    if not candidates:
        return

    all_ids = {nid for pair in candidates for nid in pair}
    live_ids: set[uuid.UUID] = set(
        db.execute(select(Node.id).where(Node.id.in_(all_ids), Node.deleted_at.is_(None))).scalars()
    )

    valid = [(src, tgt) for src, tgt in candidates if src in live_ids and tgt in live_ids]
    if not valid:
        return

    source_ids = list({src for src, _ in valid})
    db.execute(delete(NodeLink).where(NodeLink.source_node_id.in_(source_ids)))

    for src, tgt in valid:
        db.add(NodeLink(source_node_id=src, target_node_id=tgt))
