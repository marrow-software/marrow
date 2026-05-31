"""Integration tests for page-level comment endpoints (CRUD + RBAC + resolve)."""

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


@pytest.fixture
def db():
    from marrow.dependencies import get_db

    session = next(get_db())
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _make_user(session, email: str) -> User:
    user = User(
        oidc_issuer="https://test.example.com",
        oidc_subject=uuid.uuid4().hex,
        email=email,
        name=email.split("@")[0],
    )
    session.add(user)
    session.flush()
    return user


def _make_page(session) -> tuple:
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Test Org")
    session.add(org)
    session.flush()
    ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="Test WS")
    session.add(ws)
    session.flush()
    space = Space(workspace_id=ws.id, slug="main", name="Main")
    session.add(space)
    session.flush()
    node = Node(
        space_id=space.id,
        type="page",
        name="A Page",
        slug="a-page",
        position="a0",
    )
    session.add(node)
    session.flush()
    rev = Revision(node_id=node.id, content="", content_format="json")
    session.add(rev)
    session.flush()
    node.current_revision_id = rev.id
    session.flush()
    return org, ws, space, node


def _add_membership(session, org, user, role: OrgRole) -> None:
    session.add(OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role=role.value))
    session.flush()


def _auth_cookie(client, user):
    client.cookies.set(COOKIE_NAME, create_session_jwt(user.id, user.email, user.name))


class TestCommentCrud:
    def test_create_list_and_reply(self, client, db):
        editor = _make_user(db, "editor@test.com")
        org, ws, space, node = _make_page(db)
        _add_membership(db, org, editor, OrgRole.EDITOR)
        db.commit()
        node_id = str(node.id)
        _auth_cookie(client, editor)

        res = client.post(f"/api/nodes/{node_id}/comments", json={"body": "First!"})
        assert res.status_code == 201, res.text
        top = res.json()
        assert top["body"] == "First!"
        assert top["author_name"] == "editor"
        assert top["parent_comment_id"] is None
        assert top["resolved_at"] is None

        res = client.post(
            f"/api/nodes/{node_id}/comments",
            json={"body": "A reply", "parent_comment_id": top["id"]},
        )
        assert res.status_code == 201, res.text
        assert res.json()["parent_comment_id"] == top["id"]

        res = client.get(f"/api/nodes/{node_id}/comments")
        assert res.status_code == 200
        assert len(res.json()) == 2

    def test_nested_reply_rejected(self, client, db):
        editor = _make_user(db, "editor2@test.com")
        org, ws, space, node = _make_page(db)
        _add_membership(db, org, editor, OrgRole.EDITOR)
        db.commit()
        node_id = str(node.id)
        _auth_cookie(client, editor)

        top = client.post(f"/api/nodes/{node_id}/comments", json={"body": "a"}).json()
        reply = client.post(
            f"/api/nodes/{node_id}/comments",
            json={"body": "b", "parent_comment_id": top["id"]},
        ).json()
        res = client.post(
            f"/api/nodes/{node_id}/comments",
            json={"body": "c", "parent_comment_id": reply["id"]},
        )
        assert res.status_code == 400

    def test_empty_body_rejected(self, client, db):
        editor = _make_user(db, "editor3@test.com")
        org, ws, space, node = _make_page(db)
        _add_membership(db, org, editor, OrgRole.EDITOR)
        db.commit()
        node_id = str(node.id)
        _auth_cookie(client, editor)
        res = client.post(f"/api/nodes/{node_id}/comments", json={"body": "   "})
        assert res.status_code == 422

    def test_comment_on_folder_rejected(self, client, db):
        editor = _make_user(db, "editor4@test.com")
        org, ws, space, _ = _make_page(db)
        _add_membership(db, org, editor, OrgRole.EDITOR)
        folder = Node(space_id=space.id, type="folder", name="F", slug="f", position="a0")
        db.add(folder)
        db.commit()
        folder_id = str(folder.id)
        _auth_cookie(client, editor)
        res = client.post(f"/api/nodes/{folder_id}/comments", json={"body": "x"})
        assert res.status_code == 400


class TestResolve:
    def test_resolve_and_unresolve(self, client, db):
        editor = _make_user(db, "res@test.com")
        org, ws, space, node = _make_page(db)
        _add_membership(db, org, editor, OrgRole.EDITOR)
        db.commit()
        node_id = str(node.id)
        _auth_cookie(client, editor)

        cid = client.post(f"/api/nodes/{node_id}/comments", json={"body": "resolve me"}).json()[
            "id"
        ]

        res = client.patch(f"/api/comments/{cid}", json={"resolved": True})
        assert res.status_code == 200
        assert res.json()["resolved_at"] is not None

        res = client.patch(f"/api/comments/{cid}", json={"resolved": False})
        assert res.status_code == 200
        assert res.json()["resolved_at"] is None

    def test_edit_body(self, client, db):
        editor = _make_user(db, "edit@test.com")
        org, ws, space, node = _make_page(db)
        _add_membership(db, org, editor, OrgRole.EDITOR)
        db.commit()
        node_id = str(node.id)
        _auth_cookie(client, editor)
        cid = client.post(f"/api/nodes/{node_id}/comments", json={"body": "typo"}).json()["id"]
        res = client.patch(f"/api/comments/{cid}", json={"body": "fixed"})
        assert res.status_code == 200
        assert res.json()["body"] == "fixed"


class TestRbac:
    def test_viewer_can_read_not_write(self, client, db):
        viewer = _make_user(db, "viewer@test.com")
        editor = _make_user(db, "ed@test.com")
        org, ws, space, node = _make_page(db)
        _add_membership(db, org, viewer, OrgRole.VIEWER)
        _add_membership(db, org, editor, OrgRole.EDITOR)
        db.commit()
        node_id = str(node.id)

        _auth_cookie(client, editor)
        client.post(f"/api/nodes/{node_id}/comments", json={"body": "hi"})

        _auth_cookie(client, viewer)
        assert client.get(f"/api/nodes/{node_id}/comments").status_code == 200
        res = client.post(f"/api/nodes/{node_id}/comments", json={"body": "no"})
        assert res.status_code == 403

    def test_non_member_forbidden(self, client, db):
        outsider = _make_user(db, "out@test.com")
        org, ws, space, node = _make_page(db)
        db.commit()
        node_id = str(node.id)
        _auth_cookie(client, outsider)
        assert client.get(f"/api/nodes/{node_id}/comments").status_code == 403

    def test_author_can_delete_own(self, client, db):
        editor = _make_user(db, "author@test.com")
        org, ws, space, node = _make_page(db)
        _add_membership(db, org, editor, OrgRole.EDITOR)
        db.commit()
        node_id = str(node.id)
        _auth_cookie(client, editor)
        cid = client.post(f"/api/nodes/{node_id}/comments", json={"body": "mine"}).json()["id"]
        assert client.delete(f"/api/comments/{cid}").status_code == 204

    def test_editor_cannot_delete_others_comment(self, client, db):
        author = _make_user(db, "a1@test.com")
        other = _make_user(db, "a2@test.com")
        org, ws, space, node = _make_page(db)
        _add_membership(db, org, author, OrgRole.EDITOR)
        _add_membership(db, org, other, OrgRole.EDITOR)
        db.commit()
        node_id = str(node.id)
        _auth_cookie(client, author)
        cid = client.post(f"/api/nodes/{node_id}/comments", json={"body": "x"}).json()["id"]

        _auth_cookie(client, other)
        assert client.delete(f"/api/comments/{cid}").status_code == 403

    def test_owner_can_delete_others_comment(self, client, db):
        author = _make_user(db, "a3@test.com")
        owner = _make_user(db, "owner@test.com")
        org, ws, space, node = _make_page(db)
        _add_membership(db, org, author, OrgRole.EDITOR)
        _add_membership(db, org, owner, OrgRole.OWNER)
        db.commit()
        node_id = str(node.id)
        _auth_cookie(client, author)
        cid = client.post(f"/api/nodes/{node_id}/comments", json={"body": "x"}).json()["id"]

        _auth_cookie(client, owner)
        assert client.delete(f"/api/comments/{cid}").status_code == 204
