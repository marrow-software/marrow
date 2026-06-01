"""Inbox notification endpoints (list, mark-read, mark-all-read)."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db, verify_auth
from ..models import Notification
from ..schemas import NotificationList, NotificationRead

router = APIRouter(tags=["notifications"])


def _require_user(auth: AuthContext) -> UUID:
    """Notifications are user-scoped — API-key/anonymous callers have no inbox."""
    if auth.user_id is None:
        raise HTTPException(401, "User authentication required for notifications")
    return auth.user_id


@router.get("/api/users/me/notifications", response_model=NotificationList)
def list_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    user_id = _require_user(auth)

    query = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    items = db.execute(query.order_by(Notification.created_at.desc())).scalars().all()

    unread_count = db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    ).scalar_one()

    return NotificationList(notifications=items, unread_count=unread_count)


@router.patch("/api/notifications/{nid}", response_model=NotificationRead)
def mark_notification_read(
    nid: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    user_id = _require_user(auth)

    notification = db.get(Notification, nid)
    if notification is None or notification.user_id != user_id:
        raise HTTPException(404, "Notification not found")

    if notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notification)
    return notification


@router.post("/api/users/me/notifications/read-all", status_code=204)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    user_id = _require_user(auth)
    db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(timezone.utc))
    )
    db.commit()
