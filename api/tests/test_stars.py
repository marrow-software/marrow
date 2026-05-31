"""Integration tests for per-user starred nodes (#102)."""

import os
import uuid
from datetime import datetime, timezone

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
    UserStar,
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


def _make_node(session, space, **kw) -> Node:
    node = Node(
        space_id=space.id,
        type=kw.get("type", "page"),
        name=kw.get("name", "Node"),
        slug=kw.get("slug", uuid.uuid4().hex[:8]),
        position="a0",
        deleted_at=kw.get("deleted_at"),
    )
    session.add(node)
    session.flush()
    return node


def _auth_cookie(client, user):
    token = create_session_jwt(user.id, user.email, user.name)
    client.cookies.set(COOKIE_NAME, token)


class TestStarToggle:
    def test_star_then_unstar(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "star-toggle@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            node = _make_node(db, space, name="Fav")
            db.commit()

            _auth_cookie(client, user)
            assert client.post(f"/api/nodes/{node.id}/star").status_code == 204

            listed = client.get("/api/users/me/starred")
            assert listed.status_code == 200
            ids = [n["id"] for n in listed.json()]
            assert str(node.id) in ids

            assert client.delete(f"/api/nodes/{node.id}/star").status_code == 204
            assert client.get("/api/users/me/starred").json() == []
        finally:
            db.rollback()
            client.cookies.clear()

    def test_star_is_idempotent(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "star-idem@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            node = _make_node(db, space)
            db.commit()

            _auth_cookie(client, user)
            assert client.post(f"/api/nodes/{node.id}/star").status_code == 204
            assert client.post(f"/api/nodes/{node.id}/star").status_code == 204

            count = (
                db.query(UserStar)
                .filter(UserStar.user_id == user.id, UserStar.node_id == node.id)
                .count()
            )
            assert count == 1
        finally:
            db.rollback()
            client.cookies.clear()

    def test_unstar_missing_is_noop(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "star-unstar-noop@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            node = _make_node(db, space)
            db.commit()

            _auth_cookie(client, user)
            assert client.delete(f"/api/nodes/{node.id}/star").status_code == 204
        finally:
            db.rollback()
            client.cookies.clear()


class TestStarScopingAndFiltering:
    def test_stars_scoped_per_user(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user_a = _make_user(db, "star-a@test.com")
            user_b = _make_user(db, "star-b@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user_a, OrgRole.VIEWER)
            _add_membership(db, org, user_b, OrgRole.VIEWER)
            node = _make_node(db, space)
            db.commit()

            _auth_cookie(client, user_a)
            assert client.post(f"/api/nodes/{node.id}/star").status_code == 204

            client.cookies.clear()
            _auth_cookie(client, user_b)
            assert client.get("/api/users/me/starred").json() == []
        finally:
            db.rollback()
            client.cookies.clear()

    def test_trashed_nodes_excluded(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "star-trash@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            node = _make_node(db, space, name="ToTrash")
            db.add(UserStar(user_id=user.id, node_id=node.id))
            db.commit()

            _auth_cookie(client, user)
            assert len(client.get("/api/users/me/starred").json()) == 1

            node.deleted_at = datetime.now(timezone.utc)
            db.commit()
            assert client.get("/api/users/me/starred").json() == []
        finally:
            db.rollback()
            client.cookies.clear()


class TestStarRBAC:
    def test_non_member_cannot_star(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            outsider = _make_user(db, "star-outsider@test.com")
            org, ws, space = _make_workspace(db)
            node = _make_node(db, space)
            db.commit()

            _auth_cookie(client, outsider)
            assert client.post(f"/api/nodes/{node.id}/star").status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()

    def test_viewer_can_star(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "star-viewer@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            node = _make_node(db, space)
            db.commit()

            _auth_cookie(client, user)
            assert client.post(f"/api/nodes/{node.id}/star").status_code == 204
        finally:
            db.rollback()
            client.cookies.clear()
