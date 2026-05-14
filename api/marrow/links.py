"""Backlinks: parse node content for references to other nodes, and
reconcile the `node_links` table on save.

Wiki-link forms recognized:
    - Markdown:  [label](/w/<workspaceId>/pages/<nodeId>)
                 [label](/nodes/<nodeId>)
                 any link whose href contains a UUID path segment
    - BlockNote JSON: link inline content with `href` matching the same patterns,
      and `mention` inline content of type "node" with `props.nodeId` (forward-compat
      for node-style @mentions; user mentions are ignored because they do not target
      a node).
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Iterable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from .models import Node, NodeLink

_UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)
_MD_LINK_RE = re.compile(r"\[(?:[^\]]*)\]\(([^)\s]+)\)")
_AT_MENTION_RE = re.compile(r"(?<!\w)@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", re.IGNORECASE)


def _href_to_uuid(href: str) -> UUID | None:
    """Return the last UUID found in href, or None."""
    matches = _UUID_RE.findall(href or "")
    if not matches:
        return None
    try:
        return UUID(matches[-1])
    except ValueError:
        return None


def _walk_blocknote(blocks: Iterable) -> Iterable[UUID]:
    for block in blocks or []:
        if not isinstance(block, dict):
            continue
        content = block.get("content")
        if isinstance(content, list):
            for item in content:
                if not isinstance(item, dict):
                    continue
                itype = item.get("type")
                if itype == "link":
                    target = _href_to_uuid(item.get("href", ""))
                    if target is not None:
                        yield target
                elif itype == "mention":
                    # Future-compat: node mentions carry props.nodeId.
                    # User mentions (props.userId) are intentionally ignored.
                    props = item.get("props") or {}
                    node_id = props.get("nodeId")
                    if isinstance(node_id, str):
                        try:
                            yield UUID(node_id)
                        except ValueError:
                            pass
        children = block.get("children")
        if isinstance(children, list):
            yield from _walk_blocknote(children)


def extract_link_targets(content: str | None, content_format: str | None) -> set[UUID]:
    """Return the set of node UUIDs that *content* references."""
    if not content:
        return set()

    targets: set[UUID] = set()
    if content_format == "json":
        try:
            blocks = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            blocks = None
        if isinstance(blocks, list):
            targets.update(_walk_blocknote(blocks))
        # Fall through: also scan the raw JSON for UUIDs in case the structure
        # surprises us. _walk_blocknote already gave us the canonical hits;
        # the regex pass below catches markdown-style hrefs accidentally
        # stored as plain text.

    # Markdown links and bare @uuid mentions.
    for href in _MD_LINK_RE.findall(content):
        target = _href_to_uuid(href)
        if target is not None:
            targets.add(target)
    for m in _AT_MENTION_RE.findall(content):
        try:
            targets.add(UUID(m))
        except ValueError:
            pass

    return targets


def reconcile_node_links(
    db: Session,
    source_node_id: UUID,
    content: str | None,
    content_format: str | None,
) -> None:
    """Replace the set of outbound links from *source_node_id* with those parsed
    from *content*. Self-links and links to missing/trashed nodes are dropped.
    """
    parsed = extract_link_targets(content, content_format)
    parsed.discard(source_node_id)

    if parsed:
        existing_targets = {
            row[0]
            for row in db.execute(
                select(Node.id).where(
                    Node.id.in_(parsed), Node.deleted_at.is_(None)
                )
            ).all()
        }
    else:
        existing_targets = set()

    current = {
        row[0]
        for row in db.execute(
            select(NodeLink.target_node_id).where(
                NodeLink.source_node_id == source_node_id
            )
        ).all()
    }

    to_add = existing_targets - current
    to_remove = current - existing_targets

    if to_remove:
        db.query(NodeLink).filter(
            NodeLink.source_node_id == source_node_id,
            NodeLink.target_node_id.in_(to_remove),
        ).delete(synchronize_session=False)

    for target in to_add:
        stmt = (
            pg_insert(NodeLink)
            .values(source_node_id=source_node_id, target_node_id=target)
            .on_conflict_do_nothing(index_elements=["source_node_id", "target_node_id"])
        )
        db.execute(stmt)
