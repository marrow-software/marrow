"""Inbox notification endpoints (mentions, comment replies, share requests)."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db, verify_auth
from ..models import Notification
from ..schemas import NotificationList, NotificationRead, NotificationUpdate

router = APIRouter(tags=["notifications"])


def _require_user(auth: AuthContext) -> UUID:
    if auth.user_id is None:
        raise HTTPException(401, "User session required for inbox")
    return auth.user_id


@router.get("/api/users/me/notifications", response_model=NotificationList)
def list_my_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    user_id = _require_user(auth)

    stmt = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
    items = db.execute(stmt).scalars().all()

    unread_count = db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    ).scalar_one()

    return NotificationList(
        items=[NotificationRead.model_validate(n) for n in items],
        unread_count=unread_count,
    )


@router.patch("/api/notifications/{nid}", response_model=NotificationRead)
def update_notification(
    nid: UUID,
    body: NotificationUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    user_id = _require_user(auth)
    notification = db.get(Notification, nid)
    if notification is None or notification.user_id != user_id:
        raise HTTPException(404, "Notification not found")

    if body.read:
        if notification.read_at is None:
            notification.read_at = datetime.now(timezone.utc)
    else:
        notification.read_at = None
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/api/users/me/notifications/read-all", status_code=204)
def mark_all_read(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(verify_auth),
):
    user_id = _require_user(auth)
    now = datetime.now(timezone.utc)
    db.query(Notification).filter(
        Notification.user_id == user_id, Notification.read_at.is_(None)
    ).update({Notification.read_at: now}, synchronize_session=False)
    db.commit()
