"""Notification delivery helpers.

The Inbox surfaces activity that needs a user's attention. This module owns
the single insertion point (:func:`create_notification`) used by every
notification source — ``@`` mentions, comment replies, share requests, and
node-watch events (#104).
"""

import json
import uuid

from sqlalchemy.orm import Session

from .models import Notification


def create_notification(
    db: Session,
    *,
    user_id: uuid.UUID,
    kind: str,
    payload: dict,
) -> Notification:
    """Insert a single notification row. Caller owns the transaction."""
    notification = Notification(user_id=user_id, kind=kind, payload=payload)
    db.add(notification)
    db.flush()
    return notification


def _collect_mention_user_ids(value: object, acc: set[str]) -> None:
    """Recursively walk a BlockNote document collecting mentioned user IDs.

    Mentions are stored as inline content of ``type == "mention"`` carrying
    ``props.userId`` (see web/components/editor/mention-inline-content.tsx).
    """
    if isinstance(value, dict):
        if value.get("type") == "mention":
            user_id = (value.get("props") or {}).get("userId")
            if user_id:
                acc.add(str(user_id))
        for child in value.values():
            _collect_mention_user_ids(child, acc)
    elif isinstance(value, list):
        for item in value:
            _collect_mention_user_ids(item, acc)


def extract_mentioned_user_ids(content: str | None, content_format: str | None) -> set[uuid.UUID]:
    """Return the set of valid user UUIDs mentioned in a BlockNote document.

    Only ``json`` content carries structured mentions; legacy Markdown
    revisions have none, so they yield an empty set.
    """
    if not content or content_format != "json":
        return set()
    try:
        doc = json.loads(content)
    except (ValueError, TypeError):
        return set()

    raw: set[str] = set()
    _collect_mention_user_ids(doc, raw)

    parsed: set[uuid.UUID] = set()
    for value in raw:
        try:
            parsed.add(uuid.UUID(value))
        except (ValueError, AttributeError):
            continue
    return parsed


def deliver_mention_notifications(
    db: Session,
    *,
    node,
    new_content: str | None,
    content_format: str | None,
    previous_content: str | None,
    previous_format: str | None,
    actor_user_id: uuid.UUID | None,
) -> None:
    """Notify users newly ``@``-mentioned in a page node save.

    Only mentions that are *new* relative to the previous revision fire a
    notification, so re-saving a page doesn't spam everyone again. The actor
    is never notified about their own mention.
    """
    new_mentions = extract_mentioned_user_ids(new_content, content_format)
    if not new_mentions:
        return

    old_mentions = extract_mentioned_user_ids(previous_content, previous_format)
    targets = new_mentions - old_mentions
    if actor_user_id is not None:
        targets.discard(actor_user_id)

    workspace_id = str(node.space.workspace_id) if node.space else None
    for user_id in targets:
        payload: dict = {
            "node_id": str(node.id),
            "node_name": node.name,
            "space_id": str(node.space_id),
        }
        if workspace_id:
            payload["workspace_id"] = workspace_id
        create_notification(db, user_id=user_id, kind="mention", payload=payload)
