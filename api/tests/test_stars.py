"""Integration tests for starred-nodes endpoints (#102)."""

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


def _add_membership(session, org, user, role):
    m = OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role=role.value)
    session.add(m)
    session.flush()


def _auth(client, user):
    token = create_session_jwt(user.id, user.email, user.name)
    client.cookies.set(COOKIE_NAME, token)


def _make_node(db, space, name="Node") -> Node:
    n = Node(
        space_id=space.id,
        type="folder",
        name=name,
        slug=name.lower().replace(" ", "-"),
        position="a0",
    )
    db.add(n)
    db.flush()
    return n


class TestStarUnstar:
    def test_star_node_creates_row(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "star@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            node = _make_node(db, space, "Important")
            db.commit()

            _auth(client, user)
            res = client.post(f"/api/nodes/{node.id}/star")
            assert res.status_code == 204

            # idempotent
            res2 = client.post(f"/api/nodes/{node.id}/star")
            assert res2.status_code == 204

            res3 = client.get("/api/users/me/starred")
            assert res3.status_code == 200
            data = res3.json()
            assert len(data) == 1
            assert data[0]["node_id"] == str(node.id)
            assert data[0]["name"] == "Important"
            assert data[0]["workspace_id"] == str(ws.id)
        finally:
            db.rollback()
            client.cookies.clear()

    def test_unstar_removes_row(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "unstar@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            node = _make_node(db, space)
            db.add(UserStar(user_id=user.id, node_id=node.id))
            db.commit()

            _auth(client, user)
            res = client.delete(f"/api/nodes/{node.id}/star")
            assert res.status_code == 204

            res2 = client.get("/api/users/me/starred")
            assert res2.json() == []

            # idempotent — unstarring again is fine
            res3 = client.delete(f"/api/nodes/{node.id}/star")
            assert res3.status_code == 204
        finally:
            db.rollback()
            client.cookies.clear()

    def test_stars_scoped_per_user(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            alice = _make_user(db, "alice@test.com")
            bob = _make_user(db, "bob@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, alice, OrgRole.VIEWER)
            _add_membership(db, org, bob, OrgRole.VIEWER)
            node = _make_node(db, space, "Shared")
            db.add(UserStar(user_id=alice.id, node_id=node.id))
            db.commit()

            _auth(client, bob)
            res = client.get("/api/users/me/starred")
            assert res.status_code == 200
            assert res.json() == []
        finally:
            db.rollback()
            client.cookies.clear()

    def test_trashed_nodes_excluded(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "trash@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            node = _make_node(db, space, "Trashy")
            db.add(UserStar(user_id=user.id, node_id=node.id))
            db.commit()

            # Soft-delete the node after starring
            node.deleted_at = datetime.now(timezone.utc)
            db.commit()

            _auth(client, user)
            res = client.get("/api/users/me/starred")
            assert res.status_code == 200
            assert res.json() == []
        finally:
            db.rollback()
            client.cookies.clear()

    def test_non_member_cannot_star(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "outsider@test.com")
            org, ws, space = _make_workspace(db)
            # No membership added
            node = _make_node(db, space)
            db.commit()

            _auth(client, user)
            res = client.post(f"/api/nodes/{node.id}/star")
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()
