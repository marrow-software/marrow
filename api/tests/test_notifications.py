"""Integration tests for the Inbox notification feed + @-mention delivery."""

import json
import os
import uuid

import pytest
from fastapi.testclient import TestClient

from marrow.auth import COOKIE_NAME, create_session_jwt, reset_oidc_config
from marrow.models import (
    Node,
    Notification,
    Organization,
    OrgMembership,
    OrgRole,
    Space,
    User,
    Workspace,
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://marrow:marrow@localhost:5433/marrow")


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.delenv("OIDC_ISSUER", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    reset_oidc_config()
    yield
    reset_oidc_config()


@pytest.fixture
def client():
    from marrow.app import app

    return TestClient(app, raise_server_exceptions=False)


def _make_user(session, email: str) -> User:
    user = User(
        oidc_issuer="https://test.example.com",
        oidc_subject=uuid.uuid4().hex,
        email=email,
        name="Test User",
    )
    session.add(user)
    session.flush()
    return user


def _make_workspace(session) -> tuple:
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Test Org")
    session.add(org)
    session.flush()
    ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="Test WS")
    session.add(ws)
    session.flush()
    space = Space(workspace_id=ws.id, slug="main", name="Main")
    session.add(space)
    session.flush()
    return org, ws, space


def _add_membership(session, org, user, role: OrgRole) -> OrgMembership:
    m = OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role=role.value)
    session.add(m)
    session.flush()
    return m


def _auth_cookie(client, user):
    token = create_session_jwt(user.id, user.email, user.name)
    client.cookies.set(COOKIE_NAME, token)


def _doc_with_mention(user_id: uuid.UUID) -> str:
    """Minimal BlockNote document mentioning a single user."""
    return json.dumps(
        [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "hey "},
                    {
                        "type": "mention",
                        "props": {"userId": str(user_id), "displayName": "Mentioned"},
                    },
                ],
            }
        ]
    )


class TestMentionDelivery:
    def test_mention_on_create_notifies_target(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            author = _make_user(db, "author@test.com")
            target = _make_user(db, "target@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, author, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, author)
            res = client.post(
                f"/api/spaces/{space.id}/nodes",
                json={
                    "type": "page",
                    "name": "Mentioning Page",
                    "content": _doc_with_mention(target.id),
                    "content_format": "json",
                },
            )
            assert res.status_code == 201, res.text

            notes = (
                db.query(Notification).filter(Notification.user_id == target.id).all()
            )
            assert len(notes) == 1
            assert notes[0].kind == "mention"
            assert notes[0].payload["node_name"] == "Mentioning Page"
            assert notes[0].read_at is None
        finally:
            db.rollback()
            client.cookies.clear()

    def test_author_not_notified_for_self_mention(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            author = _make_user(db, "self@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, author, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, author)
            res = client.post(
                f"/api/spaces/{space.id}/nodes",
                json={
                    "type": "page",
                    "name": "Self Page",
                    "content": _doc_with_mention(author.id),
                    "content_format": "json",
                },
            )
            assert res.status_code == 201, res.text
            assert db.query(Notification).filter(
                Notification.user_id == author.id
            ).count() == 0
        finally:
            db.rollback()
            client.cookies.clear()

    def test_resave_does_not_renotify_existing_mention(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            author = _make_user(db, "author2@test.com")
            target = _make_user(db, "target2@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, author, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, author)
            doc = _doc_with_mention(target.id)
            created = client.post(
                f"/api/spaces/{space.id}/nodes",
                json={
                    "type": "page",
                    "name": "Page",
                    "content": doc,
                    "content_format": "json",
                },
            )
            node_id = created.json()["id"]

            # Re-save with the same mention — must not create a second notification.
            res = client.patch(
                f"/api/nodes/{node_id}",
                json={"content": doc, "content_format": "json"},
            )
            assert res.status_code == 200, res.text
            assert db.query(Notification).filter(
                Notification.user_id == target.id
            ).count() == 1
        finally:
            db.rollback()
            client.cookies.clear()


class TestInboxEndpoints:
    def test_list_mark_read_and_read_all(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "inbox@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            n1 = Notification(user_id=user.id, kind="mention", payload={"a": 1})
            n2 = Notification(user_id=user.id, kind="comment_reply", payload={})
            db.add_all([n1, n2])
            db.commit()
            n1_id = str(n1.id)

            _auth_cookie(client, user)

            listed = client.get("/api/users/me/notifications")
            assert listed.status_code == 200, listed.text
            body = listed.json()
            assert body["unread_count"] == 2
            assert len(body["notifications"]) == 2

            marked = client.patch(f"/api/notifications/{n1_id}")
            assert marked.status_code == 200
            assert marked.json()["read_at"] is not None

            after = client.get("/api/users/me/notifications?unread_only=true").json()
            assert after["unread_count"] == 1
            assert len(after["notifications"]) == 1

            all_read = client.post("/api/users/me/notifications/read-all")
            assert all_read.status_code == 204
            assert client.get("/api/users/me/notifications").json()["unread_count"] == 0
        finally:
            db.rollback()
            client.cookies.clear()

    def test_cannot_read_other_users_notification(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            owner = _make_user(db, "owner-n@test.com")
            other = _make_user(db, "other-n@test.com")
            note = Notification(user_id=owner.id, kind="mention", payload={})
            db.add(note)
            db.commit()
            note_id = str(note.id)

            _auth_cookie(client, other)
            res = client.patch(f"/api/notifications/{note_id}")
            assert res.status_code == 404
        finally:
            db.rollback()
            client.cookies.clear()

    def test_anonymous_has_no_inbox(self, client):
        # No session cookie, anonymous dev mode → user-scoped inbox is 401.
        res = client.get("/api/users/me/notifications")
        assert res.status_code == 401
