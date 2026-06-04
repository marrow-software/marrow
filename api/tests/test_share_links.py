"""Integration tests for view-only sharing links (#40)."""

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


def _make_page(session, space, parent_id, name, content) -> Node:
    node = Node(
        space_id=space.id,
        parent_id=parent_id,
        type="page",
        name=name,
        slug=name.lower().replace(" ", "-"),
        position="a0",
    )
    session.add(node)
    session.flush()
    rev = Revision(node_id=node.id, content=content, content_format="markdown")
    session.add(rev)
    session.flush()
    node.current_revision_id = rev.id
    session.flush()
    return node


def _make_folder(session, space, name) -> Node:
    node = Node(
        space_id=space.id,
        parent_id=None,
        type="folder",
        name=name,
        slug=name.lower().replace(" ", "-"),
        position="a0",
        description="A folder",
    )
    session.add(node)
    session.flush()
    return node


def _auth_cookie(client, user):
    token = create_session_jwt(user.id, user.email, user.name)
    client.cookies.set(COOKIE_NAME, token)


class TestShareLinkManagement:
    def test_editor_creates_link_for_page(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-share@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            page = _make_page(db, space, None, "Doc", "# Hello")
            db.commit()

            _auth_cookie(client, user)
            res = client.post(f"/api/nodes/{page.id}/share-links", json={})
            assert res.status_code == 201, res.text
            data = res.json()
            assert data["node_id"] == str(page.id)
            assert data["token"]
            assert data["expires_at"] is None
        finally:
            db.rollback()
            client.cookies.clear()

    def test_viewer_cannot_create_link(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-share@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            page = _make_page(db, space, None, "Doc", "x")
            db.commit()

            _auth_cookie(client, user)
            res = client.post(f"/api/nodes/{page.id}/share-links", json={})
            assert res.status_code == 403, res.text
        finally:
            db.rollback()
            client.cookies.clear()

    def test_editor_revokes_link(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "revoke@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            page = _make_page(db, space, None, "Doc", "x")
            link = ShareLink(node_id=page.id, token=uuid.uuid4().hex)
            db.add(link)
            db.commit()
            token = link.token

            _auth_cookie(client, user)
            res = client.delete(f"/api/share-links/{link.id}")
            assert res.status_code == 204, res.text

            # The public link is now dead.
            res = client.get(f"/shared/{token}")
            assert res.status_code == 404
        finally:
            db.rollback()
            client.cookies.clear()


class TestPublicSharedView:
    def test_view_page_without_auth(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            org, ws, space = _make_workspace(db)
            page = _make_page(db, space, None, "Public Doc", "# Shared content")
            link = ShareLink(node_id=page.id, token=uuid.uuid4().hex)
            db.add(link)
            db.commit()
            token = link.token

            # No auth cookie set at all.
            res = client.get(f"/shared/{token}")
            assert res.status_code == 200, res.text
            data = res.json()
            assert data["type"] == "page"
            assert data["content"] == "# Shared content"
            assert data["children"] == []
        finally:
            db.rollback()
            client.cookies.clear()

    def test_view_folder_returns_visible_subtree(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            org, ws, space = _make_workspace(db)
            folder = _make_folder(db, space, "Project")
            _make_page(db, space, folder.id, "Visible", "alive")
            trashed = _make_page(db, space, folder.id, "Trashed", "gone")
            trashed.deleted_at = datetime.now(timezone.utc)
            link = ShareLink(node_id=folder.id, token=uuid.uuid4().hex)
            db.add(link)
            db.commit()
            token = link.token

            res = client.get(f"/shared/{token}")
            assert res.status_code == 200, res.text
            data = res.json()
            assert data["type"] == "folder"
            names = [c["name"] for c in data["children"]]
            assert names == ["Visible"]
        finally:
            db.rollback()
            client.cookies.clear()

    def test_expired_link_returns_410(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            org, ws, space = _make_workspace(db)
            page = _make_page(db, space, None, "Doc", "x")
            link = ShareLink(
                node_id=page.id,
                token=uuid.uuid4().hex,
                expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
            )
            db.add(link)
            db.commit()
            token = link.token

            res = client.get(f"/shared/{token}")
            assert res.status_code == 410, res.text
        finally:
            db.rollback()
            client.cookies.clear()

    def test_unknown_token_returns_404(self, client):
        res = client.get(f"/shared/{uuid.uuid4().hex}")
        assert res.status_code == 404
