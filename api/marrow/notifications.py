"""Fan-out helpers for node watch notifications.

When a node is saved or commented on, every user watching the node OR any
ancestor folder receives a notification — except the user who triggered the
event. Inbox UI / delivery pipeline is owned by #103; this module just lands
rows in the ``notifications`` table.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Node, NodeWatch, Notification


def _ancestor_ids(db: Session, node: Node) -> list[uuid.UUID]:
    ids: list[uuid.UUID] = [node.id]
    current = node
    while current.parent_id is not None:
        parent = db.get(Node, current.parent_id)
        if parent is None:
            break
        ids.append(parent.id)
        current = parent
    return ids


def notify_watchers(
    db: Session,
    node: Node,
    actor_user_id: uuid.UUID | None,
    kind: str,
    payload: dict | None = None,
) -> int:
    """Create one notification per distinct watcher (excluding the actor).

    Walks the node's parent chain and unions watchers across the path, so that
    folder watches fire on any descendant page change.

    Returns the number of notifications created.
    """
    node_ids = _ancestor_ids(db, node)
    watcher_ids: set[uuid.UUID] = set(
        db.execute(
            select(NodeWatch.user_id).where(NodeWatch.node_id.in_(node_ids))
        ).scalars()
    )
    if actor_user_id is not None:
        watcher_ids.discard(actor_user_id)
    if not watcher_ids:
        return 0

    for user_id in watcher_ids:
        db.add(
            Notification(
                user_id=user_id,
                node_id=node.id,
                actor_user_id=actor_user_id,
                kind=kind,
                payload=payload,
            )
        )
    db.flush()
    return len(watcher_ids)
