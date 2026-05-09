"""Role-based access control: org membership enforcement on workspace,
space, and node API routes."""

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


def _make_user(session, email: str, name: str = "Test User") -> User:
    user = User(
        oidc_issuer="https://test.example.com",
        oidc_subject=uuid.uuid4().hex,
        email=email,
        name=name,
    )
    session.add(user)
    session.flush()
    return user


def _make_org_with_workspace(session) -> tuple:
    """Create an org with a workspace, space, folder node, and child page node."""
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Test Org")
    session.add(org)
    session.flush()

    ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="Test Workspace")
    session.add(ws)
    session.flush()

    space = Space(workspace_id=ws.id, slug="main", name="Main")
    session.add(space)
    session.flush()

    folder = Node(
        space_id=space.id,
        type="folder",
        name="Docs",
        slug="docs",
        position="a0",
    )
    session.add(folder)
    session.flush()

    page = Node(
        space_id=space.id,
        parent_id=folder.id,
        type="page",
        name="Test Page",
        slug="test-page",
        position="a0",
    )
    session.add(page)
    session.flush()

    rev = Revision(node_id=page.id, content="# Test")
    session.add(rev)
    session.flush()
    page.current_revision_id = rev.id
    session.flush()

    return org, ws, space, folder, page


def _add_membership(session, org, user, role: OrgRole) -> OrgMembership:
    m = OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role=role.value)
    session.add(m)
    session.flush()
    return m


def _auth_cookie(client, user):
    token = create_session_jwt(user.id, user.email, user.name)
    client.cookies.set(COOKIE_NAME, token)


# ---------------------------------------------------------------------------
# Workspace-level enforcement
# ---------------------------------------------------------------------------


class TestWorkspaceRBAC:
    def test_viewer_can_read_workspace(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer@test.com")
            org, ws, *_ = _make_org_with_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            db.commit()

            _auth_cookie(client, user)
            res = client.get(f"/api/workspaces/{ws.id}")
            assert res.status_code == 200
        finally:
            db.rollback()
            client.cookies.clear()

    def test_non_member_cannot_read_workspace(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "outsider@test.com")
            org, ws, *_ = _make_org_with_workspace(db)
            db.commit()

            _auth_cookie(client, user)
            res = client.get(f"/api/workspaces/{ws.id}")
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()

    def test_viewer_cannot_delete_workspace(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-del@test.com")
            org, ws, *_ = _make_org_with_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            db.commit()

            _auth_cookie(client, user)
            res = client.delete(f"/api/workspaces/{ws.id}")
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()

    def test_owner_can_delete_workspace(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "owner-del@test.com")
            org, ws, *_ = _make_org_with_workspace(db)
            _add_membership(db, org, user, OrgRole.OWNER)
            db.commit()

            _auth_cookie(client, user)
            res = client.delete(f"/api/workspaces/{ws.id}")
            assert res.status_code == 204
        finally:
            db.rollback()
            client.cookies.clear()

    def test_org_owner_can_create_workspace(self, client):
        """Org-owner role grants workspace creation."""
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "org-owner@test.com")
            org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Owner Org")
            db.add(org)
            db.flush()
            _add_membership(db, org, user, OrgRole.OWNER)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                "/api/workspaces",
                json={
                    "org_id": str(org.id),
                    "slug": f"ws-{uuid.uuid4().hex[:6]}",
                    "name": "Created WS",
                },
            )
            assert res.status_code in (200, 201), res.text
        finally:
            db.rollback()
            client.cookies.clear()

    @pytest.mark.xfail(
        reason="POST /api/workspaces does not currently gate on org role; "
        "any member may create. Tracked as a follow-up to v0.2 RBAC.",
        strict=False,
    )
    def test_viewer_cannot_create_workspace(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-create@test.com")
            org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Viewer Org")
            db.add(org)
            db.flush()
            _add_membership(db, org, user, OrgRole.VIEWER)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                "/api/workspaces",
                json={
                    "org_id": str(org.id),
                    "slug": f"ws-{uuid.uuid4().hex[:6]}",
                    "name": "Forbidden WS",
                },
            )
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()

    def test_api_key_bypasses_rbac(self, client, monkeypatch):
        monkeypatch.setenv("API_KEY", "test-key")
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            org, ws, *_ = _make_org_with_workspace(db)
            db.commit()

            res = client.get(
                f"/api/workspaces/{ws.id}",
                headers={"X-API-Key": "test-key"},
            )
            assert res.status_code == 200
        finally:
            db.rollback()

    def test_list_workspaces_scoped_to_user_orgs(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "scoped@test.com")
            org1, ws1, *_ = _make_org_with_workspace(db)
            org2, ws2, *_ = _make_org_with_workspace(db)
            _add_membership(db, org1, user, OrgRole.VIEWER)
            db.commit()

            _auth_cookie(client, user)
            res = client.get("/api/workspaces")
            assert res.status_code == 200
            ws_ids = {w["id"] for w in res.json()}
            assert str(ws1.id) in ws_ids
            assert str(ws2.id) not in ws_ids
        finally:
            db.rollback()
            client.cookies.clear()


# ---------------------------------------------------------------------------
# Space + node CRUD enforcement
# ---------------------------------------------------------------------------


class TestSpaceAndNodeRBAC:
    def test_editor_can_create_space(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor@test.com")
            org, ws, *_ = _make_org_with_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/workspaces/{ws.id}/spaces",
                json={"slug": "new-space", "name": "New Space"},
            )
            assert res.status_code == 201
        finally:
            db.rollback()
            client.cookies.clear()

    def test_editor_cannot_delete_space(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-del@test.com")
            org, ws, space, *_ = _make_org_with_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.delete(f"/api/workspaces/{ws.id}/spaces/{space.id}")
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()

    def test_viewer_cannot_create_node(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-node@test.com")
            org, ws, space, *_ = _make_org_with_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/spaces/{space.id}/nodes",
                json={"type": "page", "name": "New Page", "content": "# Hi"},
            )
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()

    def test_editor_can_create_node(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-node@test.com")
            org, ws, space, *_ = _make_org_with_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/spaces/{space.id}/nodes",
                json={"type": "page", "name": "Editor Page", "content": "# Hi"},
            )
            assert res.status_code == 201, res.text
        finally:
            db.rollback()
            client.cookies.clear()

    def test_viewer_can_read_node(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-read-node@test.com")
            org, ws, space, folder, page = _make_org_with_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            db.commit()

            _auth_cookie(client, user)
            res = client.get(f"/api/nodes/{page.id}")
            assert res.status_code == 200
        finally:
            db.rollback()
            client.cookies.clear()

    def test_editor_can_update_node(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-update@test.com")
            org, ws, space, folder, page = _make_org_with_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.patch(
                f"/api/nodes/{page.id}",
                json={"content": "# Updated"},
            )
            assert res.status_code == 200
        finally:
            db.rollback()
            client.cookies.clear()

    def test_viewer_cannot_update_node(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-update@test.com")
            org, ws, space, folder, page = _make_org_with_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            db.commit()

            _auth_cookie(client, user)
            res = client.patch(
                f"/api/nodes/{page.id}",
                json={"content": "# Forbidden"},
            )
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()

    def test_editor_cannot_delete_node(self, client):
        """Node deletion requires owner role."""
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-deletenode@test.com")
            org, ws, space, folder, page = _make_org_with_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.delete(f"/api/nodes/{page.id}")
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()

    def test_owner_can_delete_node(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "owner-delnode@test.com")
            org, ws, space, folder, page = _make_org_with_workspace(db)
            _add_membership(db, org, user, OrgRole.OWNER)
            db.commit()

            _auth_cookie(client, user)
            res = client.delete(f"/api/nodes/{page.id}")
            assert res.status_code == 204
        finally:
            db.rollback()
            client.cookies.clear()
