"""Integration tests for view-only share links (#40)."""

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from marrow.auth import COOKIE_NAME, create_session_jwt, reset_oidc_config
from marrow.models import (
    Node,
    Organization,
    OrgMembership,
    OrgRole,
    Revision,
    ShareLink,
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


def _make_page(session, space, name="Doc", content="# Hello") -> Node:
    node = Node(space_id=space.id, type="page", name=name, slug=name.lower(), position="a0")
    session.add(node)
    session.flush()
    rev = Revision(node_id=node.id, content=content, content_format="markdown")
    session.add(rev)
    session.flush()
    node.current_revision_id = rev.id
    session.flush()
    return node


def _make_folder(session, space, name="Folder", parent_id=None) -> Node:
    node = Node(
        space_id=space.id,
        type="folder",
        name=name,
        slug=name.lower(),
        position="a0",
        parent_id=parent_id,
    )
    session.add(node)
    session.flush()
    return node


def _auth_cookie(client, user):
    token = create_session_jwt(user.id, user.email, user.name)
    client.cookies.set(COOKIE_NAME, token)


def _add_membership(session, org, user, role: OrgRole):
    session.add(OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role=role.value))
    session.flush()


class TestCreateShareLink:
    def test_editor_can_create(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-share@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            page = _make_page(db, space)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(f"/api/nodes/{page.id}/share-links", json={})
            assert res.status_code == 201, res.text
            data = res.json()
            assert data["token"]
            assert data["revoked_at"] is None
        finally:
            db.rollback()
            client.cookies.clear()

    def test_viewer_cannot_create(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-share@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            page = _make_page(db, space)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(f"/api/nodes/{page.id}/share-links", json={})
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()


class TestPublicAccess:
    def test_shared_page_returns_content(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "ed1@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            page = _make_page(db, space, content="public hello")
            link = ShareLink(node_id=page.id, token="tok-page-1", created_by=user.id)
            db.add(link)
            db.commit()

            res = client.get(f"/shared/{link.token}")
            assert res.status_code == 200
            body = res.json()
            assert body["type"] == "page"
            assert body["content"] == "public hello"
        finally:
            db.rollback()

    def test_shared_folder_returns_children(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "ed2@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            folder = _make_folder(db, space, name="Public")
            child = Node(
                space_id=space.id,
                parent_id=folder.id,
                type="page",
                name="Child",
                slug="child",
                position="a0",
            )
            db.add(child)
            db.flush()
            rev = Revision(node_id=child.id, content="x", content_format="markdown")
            db.add(rev)
            db.flush()
            child.current_revision_id = rev.id

            link = ShareLink(node_id=folder.id, token="tok-folder-1")
            db.add(link)
            db.commit()

            res = client.get(f"/shared/{link.token}")
            assert res.status_code == 200
            body = res.json()
            assert body["type"] == "folder"
            assert len(body["children"]) == 1
            assert body["children"][0]["name"] == "Child"
        finally:
            db.rollback()

    def test_expired_link_returns_410(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "ed3@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            page = _make_page(db, space)
            link = ShareLink(
                node_id=page.id,
                token="tok-expired",
                expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            )
            db.add(link)
            db.commit()

            res = client.get(f"/shared/{link.token}")
            assert res.status_code == 410
        finally:
            db.rollback()

    def test_revoked_link_returns_410(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "ed4@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            page = _make_page(db, space)
            link = ShareLink(
                node_id=page.id,
                token="tok-revoked",
                revoked_at=datetime.now(timezone.utc),
            )
            db.add(link)
            db.commit()

            res = client.get(f"/shared/{link.token}")
            assert res.status_code == 410
        finally:
            db.rollback()

    def test_unknown_token_returns_404(self, client):
        res = client.get("/shared/does-not-exist")
        assert res.status_code == 404


class TestRevoke:
    def test_editor_can_revoke(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "rev-ed@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            page = _make_page(db, space)
            link = ShareLink(node_id=page.id, token="tok-rev-1")
            db.add(link)
            db.commit()

            _auth_cookie(client, user)
            res = client.delete(f"/api/share-links/{link.id}")
            assert res.status_code == 204

            res2 = client.get(f"/shared/{link.token}")
            assert res2.status_code == 410
        finally:
            db.rollback()
            client.cookies.clear()
