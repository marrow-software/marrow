"""Page revision persistence — append a revision and run save side effects.

Caller owns the transaction (flush here; commit in the router / CLI).
Links and mention notifications participate in the main transaction; watch
fan-out is best-effort behind a nested savepoint so a notification failure
never rolls back the revision.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from .links import reconcile_node_links
from .models import Node, Revision
from .notifications import deliver_mention_notifications
from .watches import fan_out_watch_event


def persist_page_revision(
    db: Session,
    *,
    node: Node,
    content: str,
    content_format: str,
    actor_user_id: UUID | None,
) -> Revision:
    """Append a revision and run save side effects. Caller owns commit.

    Only valid for ``type='page'`` nodes. Raises ``ValueError`` otherwise.
    """
    if node.type != "page":
        raise ValueError("persist_page_revision requires a page node")

    prev_rev = node.current_revision
    prev_content = prev_rev.content if prev_rev else None
    prev_format = prev_rev.content_format if prev_rev else None

    rev = Revision(
        node_id=node.id,
        content=content,
        content_format=content_format,
    )
    db.add(rev)
    db.flush()
    node.current_revision_id = rev.id

    reconcile_node_links(db, node.id, content, content_format)

    deliver_mention_notifications(
        db,
        node=node,
        new_content=content,
        content_format=content_format,
        previous_content=prev_content,
        previous_format=prev_format,
        actor_user_id=actor_user_id,
    )

    # Notify watchers best-effort — must not block or fail the save.
    # Use a savepoint so any partial notification rows are rolled back on
    # failure rather than being committed by the caller's db.commit().
    sp = db.begin_nested()
    try:
        fan_out_watch_event(db, node=node, actor_user_id=actor_user_id, event="save")
        sp.commit()
    except Exception:
        sp.rollback()

    node.updated_at = datetime.now(timezone.utc)
    return rev
