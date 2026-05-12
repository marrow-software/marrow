"""Integration tests for node watch + notification fan-out."""

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from marrow.auth import COOKIE_NAME, create_session_jwt, reset_oidc_config
from marrow.models import (
    Node,
    Notification,
    NodeWatch,
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


def _make_workspace(session):
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Org")
    session.add(org)
    session.flush()
    ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="WS")
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


def _make_page(session, space, parent=None, name="page") -> Node:
    node = Node(
        space_id=space.id,
        parent_id=parent.id if parent else None,
        type="page",
        name=name,
        slug=name,
        position="a0",
    )
    session.add(node)
    session.flush()
    rev = Revision(node_id=node.id, content="v1", content_format="markdown")
    session.add(rev)
    session.flush()
    node.current_revision_id = rev.id
    session.flush()
    return node


def _make_folder(session, space, parent=None, name="folder") -> Node:
    node = Node(
        space_id=space.id,
        parent_id=parent.id if parent else None,
        type="folder",
        name=name,
        slug=name,
        position="a0",
    )
    session.add(node)
    session.flush()
    return node


def _auth(client, user):
    client.cookies.set(COOKIE_NAME, create_session_jwt(user.id, user.email, user.name))


class TestWatchEndpoints:
    def test_watch_then_unwatch(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "w1@test.com")
            org, _, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            page = _make_page(db, space, name=f"p-{uuid.uuid4().hex[:6]}")
            db.commit()

            _auth(client, user)

            res = client.get(f"/api/nodes/{page.id}/watching")
            assert res.status_code == 200
            assert res.json() == {"watching": False}

            res = client.post(f"/api/nodes/{page.id}/watch")
            assert res.status_code == 201
            assert res.json() == {"watching": True}

            # Idempotent
            res = client.post(f"/api/nodes/{page.id}/watch")
            assert res.status_code == 201

            res = client.get(f"/api/nodes/{page.id}/watching")
            assert res.json() == {"watching": True}

            res = client.delete(f"/api/nodes/{page.id}/watch")
            assert res.status_code == 204

            res = client.get(f"/api/nodes/{page.id}/watching")
            assert res.json() == {"watching": False}
        finally:
            db.close()

    def test_watch_requires_membership(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            outsider = _make_user(db, "outsider@test.com")
            _, _, space = _make_workspace(db)
            page = _make_page(db, space, name=f"p-{uuid.uuid4().hex[:6]}")
            db.commit()

            _auth(client, outsider)
            res = client.post(f"/api/nodes/{page.id}/watch")
            assert res.status_code == 403
        finally:
            db.close()


class TestFanOut:
    def test_save_notifies_watcher_excluding_actor(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            watcher = _make_user(db, "watcher@test.com")
            editor = _make_user(db, "editor@test.com")
            org, _, space = _make_workspace(db)
            _add_membership(db, org, watcher, OrgRole.VIEWER)
            _add_membership(db, org, editor, OrgRole.EDITOR)
            page = _make_page(db, space, name=f"p-{uuid.uuid4().hex[:6]}")
            db.add(NodeWatch(user_id=watcher.id, node_id=page.id))
            # Editor also watches their own change → should NOT receive
            db.add(NodeWatch(user_id=editor.id, node_id=page.id))
            db.commit()

            _auth(client, editor)
            res = client.patch(f"/api/nodes/{page.id}", json={"content": "v2"})
            assert res.status_code == 200, res.text

            notifs = (
                db.execute(select(Notification).where(Notification.node_id == page.id))
                .scalars()
                .all()
            )
            user_ids = {n.user_id for n in notifs}
            assert watcher.id in user_ids
            assert editor.id not in user_ids
            assert all(n.kind == "node.updated" for n in notifs)
            assert all(n.actor_user_id == editor.id for n in notifs)
        finally:
            db.close()

    def test_folder_watch_fires_on_descendant_change(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            watcher = _make_user(db, "folder-watch@test.com")
            editor = _make_user(db, "folder-edit@test.com")
            org, _, space = _make_workspace(db)
            _add_membership(db, org, watcher, OrgRole.VIEWER)
            _add_membership(db, org, editor, OrgRole.EDITOR)
            folder = _make_folder(db, space, name=f"f-{uuid.uuid4().hex[:6]}")
            nested_folder = _make_folder(
                db, space, parent=folder, name=f"nf-{uuid.uuid4().hex[:6]}"
            )
            page = _make_page(
                db, space, parent=nested_folder, name=f"p-{uuid.uuid4().hex[:6]}"
            )
            db.add(NodeWatch(user_id=watcher.id, node_id=folder.id))
            db.commit()

            _auth(client, editor)
            res = client.patch(f"/api/nodes/{page.id}", json={"content": "v2"})
            assert res.status_code == 200, res.text

            notifs = (
                db.execute(
                    select(Notification).where(
                        Notification.user_id == watcher.id,
                        Notification.node_id == page.id,
                    )
                )
                .scalars()
                .all()
            )
            assert len(notifs) == 1
        finally:
            db.close()

    def test_non_content_patch_does_not_notify(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            watcher = _make_user(db, "no-notif@test.com")
            editor = _make_user(db, "renamer@test.com")
            org, _, space = _make_workspace(db)
            _add_membership(db, org, watcher, OrgRole.VIEWER)
            _add_membership(db, org, editor, OrgRole.EDITOR)
            page = _make_page(db, space, name=f"p-{uuid.uuid4().hex[:6]}")
            db.add(NodeWatch(user_id=watcher.id, node_id=page.id))
            db.commit()

            _auth(client, editor)
            res = client.patch(f"/api/nodes/{page.id}", json={"name": "Renamed"})
            assert res.status_code == 200

            notifs = (
                db.execute(
                    select(Notification).where(Notification.user_id == watcher.id)
                )
                .scalars()
                .all()
            )
            assert notifs == []
        finally:
            db.close()
