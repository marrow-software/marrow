"""Integration tests for node view (table / board / list) endpoints."""

import os
import uuid

import pytest
from fastapi.testclient import TestClient

from marrow.auth import COOKIE_NAME, create_session_jwt, reset_oidc_config
from marrow.models import (
    Node,
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


def _make_folder(session, space, name="Folder") -> Node:
    node = Node(
        space_id=space.id,
        parent_id=None,
        type="folder",
        name=name,
        slug=name.lower(),
        position="a0",
    )
    session.add(node)
    session.flush()
    return node


def _add_membership(session, org, user, role: OrgRole) -> OrgMembership:
    m = OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role=role.value)
    session.add(m)
    session.flush()
    return m


def _auth_cookie(client, user):
    token = create_session_jwt(user.id, user.email, user.name)
    client.cookies.set(COOKIE_NAME, token)


class TestCreateView:
    def test_create_default_list_view(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-view@test.com")
            org, ws, space = _make_workspace(db)
            folder = _make_folder(db, space)
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/nodes/{folder.id}/views",
                json={"name": "All pages"},
            )
            assert res.status_code == 201, res.text
            data = res.json()
            assert data["view_type"] == "list"
            assert data["folder_node_id"] == str(folder.id)
            assert data["config"]["sorts"] == []
        finally:
            db.rollback()
            client.cookies.clear()

    def test_create_board_view_with_group_by(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-board@test.com")
            org, ws, space = _make_workspace(db)
            folder = _make_folder(db, space)
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/nodes/{folder.id}/views",
                json={
                    "name": "By status",
                    "view_type": "board",
                    "config": {
                        "group_by": "status",
                        "sorts": [{"property": "priority", "direction": "desc"}],
                        "filters": [{"property": "archived", "operator": "neq", "value": "true"}],
                    },
                },
            )
            assert res.status_code == 201, res.text
            data = res.json()
            assert data["view_type"] == "board"
            assert data["config"]["group_by"] == "status"
            assert data["config"]["sorts"][0]["direction"] == "desc"
        finally:
            db.rollback()
            client.cookies.clear()

    def test_reject_invalid_view_type(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-bad@test.com")
            org, ws, space = _make_workspace(db)
            folder = _make_folder(db, space)
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/nodes/{folder.id}/views",
                json={"name": "Bad", "view_type": "calendar"},
            )
            assert res.status_code == 422
        finally:
            db.rollback()
            client.cookies.clear()

    def test_reject_view_on_page_node(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-page-view@test.com")
            org, ws, space = _make_workspace(db)
            page = Node(
                space_id=space.id,
                type="page",
                name="A page",
                slug="a-page",
                position="a0",
            )
            db.add(page)
            db.flush()
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/nodes/{page.id}/views",
                json={"name": "Nope"},
            )
            assert res.status_code == 400
        finally:
            db.rollback()
            client.cookies.clear()

    def test_viewer_cannot_create_view(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-view@test.com")
            org, ws, space = _make_workspace(db)
            folder = _make_folder(db, space)
            _add_membership(db, org, user, OrgRole.VIEWER)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/nodes/{folder.id}/views",
                json={"name": "Nope"},
            )
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()


class TestListUpdateDeleteView:
    def test_list_update_and_delete(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "owner-view@test.com")
            org, ws, space = _make_workspace(db)
            folder = _make_folder(db, space)
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            created = client.post(
                f"/api/nodes/{folder.id}/views",
                json={"name": "Table", "view_type": "table"},
            ).json()
            view_id = created["id"]

            listed = client.get(f"/api/nodes/{folder.id}/views")
            assert listed.status_code == 200
            assert len(listed.json()) == 1

            patched = client.patch(
                f"/api/views/{view_id}",
                json={
                    "name": "Renamed",
                    "config": {"sorts": [{"property": "name"}]},
                },
            )
            assert patched.status_code == 200, patched.text
            assert patched.json()["name"] == "Renamed"
            assert patched.json()["config"]["sorts"][0]["property"] == "name"

            got = client.get(f"/api/views/{view_id}")
            assert got.status_code == 200
            assert got.json()["name"] == "Renamed"

            deleted = client.delete(f"/api/views/{view_id}")
            assert deleted.status_code == 204
            assert client.get(f"/api/views/{view_id}").status_code == 404
        finally:
            db.rollback()
            client.cookies.clear()
