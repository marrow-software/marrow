"""Notification delivery helpers.

The Inbox surfaces activity that needs a user's attention. This module owns
the single insertion point (:func:`create_notification`) used by every
notification source — ``@`` mentions, comment replies, share requests, and
node-watch events (#104).
"""

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
