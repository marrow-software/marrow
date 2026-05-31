"""Node-watch fan-out (#104).

A user can watch a page or a folder. When a page node changes (a new
revision is saved, or — once comments land — a new comment is posted), every
watcher of that node *or any of its ancestor folders* receives a
``watch_event`` notification through the Inbox pipeline. The acting user is
never notified about their own change.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Node, NodeWatch
from .notifications import create_notification


def _node_and_ancestor_ids(db: Session, node: Node) -> list[uuid.UUID]:
    """Return the node's id plus every ancestor folder id, root-ward.

    A folder watch fires on changes to any descendant page, so resolving the
    ancestor chain is what makes folder subscriptions work.
    """
    ids: list[uuid.UUID] = [node.id]
    parent_id = node.parent_id
    seen: set[uuid.UUID] = {node.id}
    while parent_id is not None and parent_id not in seen:
        seen.add(parent_id)
        ids.append(parent_id)
        parent_id = db.execute(
            select(Node.parent_id).where(Node.id == parent_id)
        ).scalar_one_or_none()
    return ids


def fan_out_watch_event(
    db: Session,
    *,
    node: Node,
    actor_user_id: uuid.UUID | None,
    event: str,
) -> int:
    """Notify every watcher of ``node`` or an ancestor folder.

    ``event`` is a short verb stored in the notification payload (e.g.
    ``"save"`` or ``"comment"``). The acting user is excluded. Caller owns
    the transaction. Returns the number of notifications created.
    """
    target_ids = _node_and_ancestor_ids(db, node)

    watcher_ids = set(
        db.execute(select(NodeWatch.user_id).where(NodeWatch.node_id.in_(target_ids)))
        .scalars()
        .all()
    )
    if actor_user_id is not None:
        watcher_ids.discard(actor_user_id)

    for user_id in watcher_ids:
        create_notification(
            db,
            user_id=user_id,
            kind="watch_event",
            payload={
                "event": event,
                "node_id": str(node.id),
                "node_name": node.name,
                "space_id": str(node.space_id),
            },
        )
    return len(watcher_ids)
