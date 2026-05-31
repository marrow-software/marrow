"""Integration tests for node watches and watch-event fan-out (#104)."""

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
    Revision,
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


@pytest.fixture
def db():
    from marrow.dependencies import get_db

    session = next(get_db())
    try:
        yield session
    finally:
        session.close()


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


def _make_page(session, space, parent_id=None, name="Page") -> Node:
    node = Node(
        space_id=space.id,
        parent_id=parent_id,
        type="page",
        name=name,
        slug=f"{name.lower()}-{uuid.uuid4().hex[:6]}",
        position="a0",
    )
    session.add(node)
    session.flush()
    rev = Revision(node_id=node.id, content="hello", content_format="markdown")
    session.add(rev)
    session.flush()
    node.current_revision_id = rev.id
    session.flush()
    return node


def _make_folder(session, space, parent_id=None, name="Folder") -> Node:
    node = Node(
        space_id=space.id,
        parent_id=parent_id,
        type="folder",
        name=name,
        slug=f"{name.lower()}-{uuid.uuid4().hex[:6]}",
        position="a0",
    )
    session.add(node)
    session.flush()
    return node


def _auth_cookie(client, user):
    token = create_session_jwt(user.id, user.email, user.name)
    client.cookies.set(COOKIE_NAME, token)


def _watch_events(_db, user_id) -> list[Notification]:
    # Fresh session so we read the request transaction's committed rows
    # rather than a stale snapshot on the test's own session.
    from marrow.dependencies import get_db

    session = next(get_db())
    try:
        return (
            session.query(Notification)
            .filter(Notification.user_id == user_id, Notification.kind == "watch_event")
            .all()
        )
    finally:
        session.close()


class TestWatchEndpoints:
    def test_watch_unwatch_and_status(self, client, db):
        user = _make_user(db, "watcher@test.com")
        org, ws, space = _make_workspace(db)
        _add_membership(db, org, user, OrgRole.VIEWER)
        page = _make_page(db, space)
        db.commit()
        nid = str(page.id)

        _auth_cookie(client, user)

        r = client.get(f"/api/nodes/{nid}/watching")
        assert r.status_code == 200
        assert r.json() == {"watching": False}

        r = client.post(f"/api/nodes/{nid}/watch")
        assert r.status_code == 201
        assert r.json() == {"watching": True}

        # Idempotent — watching again is a no-op success.
        assert client.post(f"/api/nodes/{nid}/watch").status_code == 201

        assert client.get(f"/api/nodes/{nid}/watching").json() == {"watching": True}

        assert client.delete(f"/api/nodes/{nid}/watch").status_code == 204
        assert client.get(f"/api/nodes/{nid}/watching").json() == {"watching": False}

    def test_non_member_forbidden(self, client, db):
        user = _make_user(db, "outsider@test.com")
        _org, _ws, space = _make_workspace(db)
        page = _make_page(db, space)
        db.commit()
        nid = str(page.id)

        _auth_cookie(client, user)
        assert client.post(f"/api/nodes/{nid}/watch").status_code == 403

    def test_api_key_has_no_inbox(self, client, db, monkeypatch):
        _org, _ws, space = _make_workspace(db)
        page = _make_page(db, space)
        db.commit()
        nid = str(page.id)

        monkeypatch.setenv("API_KEY", "secret")
        reset_oidc_config()
        r = client.post(f"/api/nodes/{nid}/watch", headers={"X-API-Key": "secret"})
        assert r.status_code == 401


class TestWatchFanOut:
    def test_save_notifies_watcher_excluding_actor(self, client, db):
        watcher = _make_user(db, "fanout-watcher@test.com")
        editor = _make_user(db, "fanout-editor@test.com")
        org, ws, space = _make_workspace(db)
        _add_membership(db, org, watcher, OrgRole.VIEWER)
        _add_membership(db, org, editor, OrgRole.EDITOR)
        page = _make_page(db, space)
        db.commit()
        nid = str(page.id)
        watcher_id, editor_id = watcher.id, editor.id

        _auth_cookie(client, watcher)
        assert client.post(f"/api/nodes/{nid}/watch").status_code == 201
        # The editor also watches but is the actor, so must not self-notify.
        _auth_cookie(client, editor)
        assert client.post(f"/api/nodes/{nid}/watch").status_code == 201

        assert client.patch(f"/api/nodes/{nid}", json={"content": "updated"}).status_code == 200

        watcher_notes = _watch_events(db, watcher_id)
        assert len(watcher_notes) == 1
        assert watcher_notes[0].payload["event"] == "save"
        assert watcher_notes[0].payload["node_id"] == nid
        assert _watch_events(db, editor_id) == []

    def test_folder_watch_fires_on_descendant_save(self, client, db):
        watcher = _make_user(db, "folder-watcher@test.com")
        editor = _make_user(db, "folder-editor@test.com")
        org, ws, space = _make_workspace(db)
        _add_membership(db, org, watcher, OrgRole.VIEWER)
        _add_membership(db, org, editor, OrgRole.EDITOR)
        folder = _make_folder(db, space)
        child = _make_page(db, space, parent_id=folder.id)
        db.commit()
        folder_id = str(folder.id)
        child_id = str(child.id)
        watcher_id = watcher.id

        _auth_cookie(client, watcher)
        assert client.post(f"/api/nodes/{folder_id}/watch").status_code == 201

        _auth_cookie(client, editor)
        assert (
            client.patch(f"/api/nodes/{child_id}", json={"content": "changed"}).status_code == 200
        )

        notes = _watch_events(db, watcher_id)
        assert len(notes) == 1
        assert notes[0].payload["node_id"] == child_id
