"""Notification delivery helpers.

Notifications are user-scoped activity records (mentions, comment replies,
share requests, watch events). They are deliberately excluded from the export
bundle — they belong to the receiving user, not the workspace.
"""

import re
import uuid
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Notification, OrgMembership, Space, User, Workspace

# BlockNote stores mentions as inline content nodes with type=mention and
# `userId` in props; also catch a plain @email fallback used by markdown content.
_MENTION_USER_ID = re.compile(r'"type"\s*:\s*"mention"[^}]*"userId"\s*:\s*"([^"]+)"')
_MENTION_EMAIL = re.compile(r"@([\w.+-]+@[\w-]+\.[\w.-]+)")


def extract_mentioned_user_ids(content: str) -> set[uuid.UUID]:
    """Return user IDs explicitly referenced by `userId` mentions in the content."""
    ids: set[uuid.UUID] = set()
    for match in _MENTION_USER_ID.finditer(content or ""):
        try:
            ids.add(uuid.UUID(match.group(1)))
        except ValueError:
            continue
    return ids


def extract_mentioned_emails(content: str) -> set[str]:
    return {m.group(1).lower() for m in _MENTION_EMAIL.finditer(content or "")}


def _workspace_for_node(db: Session, node) -> tuple[uuid.UUID, uuid.UUID] | None:
    space = db.get(Space, node.space_id)
    if space is None:
        return None
    ws = db.get(Workspace, space.workspace_id)
    if ws is None:
        return None
    return ws.org_id, ws.id


def _filter_org_member_user_ids(
    db: Session, org_id: uuid.UUID, user_ids: Iterable[uuid.UUID]
) -> set[uuid.UUID]:
    ids = list(user_ids)
    if not ids:
        return set()
    rows = db.execute(
        select(OrgMembership.user_id).where(
            OrgMembership.org_id == org_id, OrgMembership.user_id.in_(ids)
        )
    ).all()
    return {r[0] for r in rows if r[0] is not None}


def _user_ids_from_emails(db: Session, emails: Iterable[str]) -> set[uuid.UUID]:
    e = list(emails)
    if not e:
        return set()
    rows = db.execute(select(User.id).where(User.email.in_(e))).all()
    return {r[0] for r in rows}


def deliver_mention_notifications(
    db: Session,
    node,
    content: str,
    actor_user_id: uuid.UUID | None,
) -> list[Notification]:
    """Create mention notifications for any users referenced in `content`.

    Skips the actor (no self-notifications) and only delivers to org members.
    Returns the persisted Notification rows (the caller is responsible for
    committing the surrounding transaction).
    """
    ws_info = _workspace_for_node(db, node)
    if ws_info is None:
        return []
    org_id, workspace_id = ws_info

    user_ids = extract_mentioned_user_ids(content)
    if not user_ids:
        emails = extract_mentioned_emails(content)
        user_ids = _user_ids_from_emails(db, emails)

    if actor_user_id is not None:
        user_ids.discard(actor_user_id)

    user_ids = _filter_org_member_user_ids(db, org_id, user_ids)

    created: list[Notification] = []
    for uid in user_ids:
        n = Notification(
            user_id=uid,
            kind="mention",
            payload={
                "node_id": str(node.id),
                "node_name": node.name,
                "workspace_id": str(workspace_id),
                "actor_user_id": str(actor_user_id) if actor_user_id else None,
            },
        )
        db.add(n)
        created.append(n)
    if created:
        db.flush()
    return created


def deliver_comment_reply_notification(
    db: Session,
    *,
    recipient_user_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    node_id: uuid.UUID,
    comment_id: uuid.UUID,
    parent_comment_id: uuid.UUID,
    snippet: str | None = None,
) -> Notification | None:
    """Notify the author of a parent comment that someone replied."""
    if actor_user_id is not None and actor_user_id == recipient_user_id:
        return None
    n = Notification(
        user_id=recipient_user_id,
        kind="comment_reply",
        payload={
            "node_id": str(node_id),
            "comment_id": str(comment_id),
            "parent_comment_id": str(parent_comment_id),
            "actor_user_id": str(actor_user_id) if actor_user_id else None,
            "snippet": snippet,
        },
    )
    db.add(n)
    db.flush()
    return n


def deliver_share_request_notification(
    db: Session,
    *,
    recipient_user_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    resource_kind: str,
    resource_id: uuid.UUID,
    role: str,
) -> Notification:
    n = Notification(
        user_id=recipient_user_id,
        kind="share_request",
        payload={
            "resource_kind": resource_kind,
            "resource_id": str(resource_id),
            "role": role,
            "actor_user_id": str(actor_user_id) if actor_user_id else None,
        },
    )
    db.add(n)
    db.flush()
    return n
