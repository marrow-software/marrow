"""Integration tests for the comments API (#101)."""

import os
import uuid

import pytest
from fastapi.testclient import TestClient

from marrow.auth import COOKIE_NAME, create_session_jwt, reset_oidc_config
from marrow.models import (
    Comment,
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


def _make_page(session):
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Org")
    session.add(org)
    session.flush()
    ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="WS")
    session.add(ws)
    session.flush()
    space = Space(workspace_id=ws.id, slug="main", name="Main")
    session.add(space)
    session.flush()
    node = Node(space_id=space.id, type="page", name="Page", slug="page", position="a0")
    session.add(node)
    session.flush()
    rev = Revision(node_id=node.id, content="hi", content_format="markdown")
    session.add(rev)
    session.flush()
    node.current_revision_id = rev.id
    return org, ws, space, node


def _membership(session, org, user, role: OrgRole):
    m = OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role=role.value)
    session.add(m)
    session.flush()
    return m


def _auth_cookie(client, user):
    token = create_session_jwt(user.id, user.email, user.name)
    client.cookies.set(COOKIE_NAME, token)


class TestCreateComment:
    def test_editor_can_post(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-post@test.com")
            org, ws, space, node = _make_page(db)
            _membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/nodes/{node.id}/comments", json={"body": "first comment"}
            )
            assert res.status_code == 201, res.text
            data = res.json()
            assert data["body"] == "first comment"
            assert data["author_user_id"] == str(user.id)
            assert data["resolved_at"] is None
        finally:
            db.rollback()
            client.cookies.clear()

    def test_viewer_cannot_post(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-post@test.com")
            org, ws, space, node = _make_page(db)
            _membership(db, org, user, OrgRole.VIEWER)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(f"/api/nodes/{node.id}/comments", json={"body": "nope"})
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()

    def test_cannot_comment_on_folder(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-folder-comment@test.com")
            org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Org")
            db.add(org)
            db.flush()
            ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="WS")
            db.add(ws)
            db.flush()
            sp = Space(workspace_id=ws.id, slug="main", name="Main")
            db.add(sp)
            db.flush()
            folder = Node(
                space_id=sp.id, type="folder", name="F", slug="f", position="a0"
            )
            db.add(folder)
            _membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(f"/api/nodes/{folder.id}/comments", json={"body": "x"})
            assert res.status_code == 400
        finally:
            db.rollback()
            client.cookies.clear()

    def test_reply_to_comment(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-reply@test.com")
            org, ws, space, node = _make_page(db)
            _membership(db, org, user, OrgRole.EDITOR)
            parent = Comment(node_id=node.id, author_user_id=user.id, body="parent")
            db.add(parent)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/nodes/{node.id}/comments",
                json={"body": "reply", "parent_comment_id": str(parent.id)},
            )
            assert res.status_code == 201, res.text
            assert res.json()["parent_comment_id"] == str(parent.id)
        finally:
            db.rollback()
            client.cookies.clear()


class TestListComments:
    def test_viewer_can_list(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-list@test.com")
            author = _make_user(db, "author-list@test.com")
            org, ws, space, node = _make_page(db)
            _membership(db, org, user, OrgRole.VIEWER)
            db.add(Comment(node_id=node.id, author_user_id=author.id, body="hi"))
            db.add(Comment(node_id=node.id, author_user_id=author.id, body="hey"))
            db.commit()

            _auth_cookie(client, user)
            res = client.get(f"/api/nodes/{node.id}/comments")
            assert res.status_code == 200
            assert len(res.json()) == 2
        finally:
            db.rollback()
            client.cookies.clear()


class TestUnreadCount:
    def test_unread_since_filter(self, client):
        from datetime import datetime, timedelta, timezone

        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-unread@test.com")
            org, ws, space, node = _make_page(db)
            _membership(db, org, user, OrgRole.VIEWER)
            db.add(Comment(node_id=node.id, author_user_id=user.id, body="a"))
            db.commit()

            cutoff = datetime.now(timezone.utc) + timedelta(seconds=1)

            _auth_cookie(client, user)
            res = client.get(
                f"/api/nodes/{node.id}/comments/unread",
                params={"since": cutoff.isoformat()},
            )
            assert res.status_code == 200
            assert res.json()["unread"] == 0

            res2 = client.get(f"/api/nodes/{node.id}/comments/unread")
            assert res2.status_code == 200
            assert res2.json()["unread"] == 1
        finally:
            db.rollback()
            client.cookies.clear()


class TestPatchComment:
    def test_resolve_and_unresolve(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-resolve@test.com")
            org, ws, space, node = _make_page(db)
            _membership(db, org, user, OrgRole.EDITOR)
            c = Comment(node_id=node.id, author_user_id=user.id, body="todo")
            db.add(c)
            db.commit()

            _auth_cookie(client, user)
            res = client.patch(f"/api/comments/{c.id}", json={"resolved": True})
            assert res.status_code == 200
            assert res.json()["resolved_at"] is not None

            res2 = client.patch(f"/api/comments/{c.id}", json={"resolved": False})
            assert res2.status_code == 200
            assert res2.json()["resolved_at"] is None
        finally:
            db.rollback()
            client.cookies.clear()

    def test_non_author_cannot_edit_body(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            author = _make_user(db, "author-edit@test.com")
            other = _make_user(db, "other-edit@test.com")
            org, ws, space, node = _make_page(db)
            _membership(db, org, author, OrgRole.EDITOR)
            _membership(db, org, other, OrgRole.EDITOR)
            c = Comment(node_id=node.id, author_user_id=author.id, body="orig")
            db.add(c)
            db.commit()

            _auth_cookie(client, other)
            res = client.patch(f"/api/comments/{c.id}", json={"body": "hijack"})
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()


class TestDeleteComment:
    def test_author_can_delete_own(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "author-delete@test.com")
            org, ws, space, node = _make_page(db)
            _membership(db, org, user, OrgRole.EDITOR)
            c = Comment(node_id=node.id, author_user_id=user.id, body="bye")
            db.add(c)
            db.commit()
            cid = c.id

            _auth_cookie(client, user)
            res = client.delete(f"/api/comments/{cid}")
            assert res.status_code == 204

            db.expire_all()
            assert db.get(Comment, cid) is None
        finally:
            db.rollback()
            client.cookies.clear()

    def test_non_author_editor_cannot_delete(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            author = _make_user(db, "author-other-del@test.com")
            other = _make_user(db, "other-editor-del@test.com")
            org, ws, space, node = _make_page(db)
            _membership(db, org, author, OrgRole.EDITOR)
            _membership(db, org, other, OrgRole.EDITOR)
            c = Comment(node_id=node.id, author_user_id=author.id, body="mine")
            db.add(c)
            db.commit()

            _auth_cookie(client, other)
            res = client.delete(f"/api/comments/{c.id}")
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()

    def test_owner_can_delete_anyones(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            author = _make_user(db, "author-owner-del@test.com")
            owner = _make_user(db, "owner-del@test.com")
            org, ws, space, node = _make_page(db)
            _membership(db, org, author, OrgRole.EDITOR)
            _membership(db, org, owner, OrgRole.OWNER)
            c = Comment(node_id=node.id, author_user_id=author.id, body="bye")
            db.add(c)
            db.commit()
            cid = c.id

            _auth_cookie(client, owner)
            res = client.delete(f"/api/comments/{cid}")
            assert res.status_code == 204
        finally:
            db.rollback()
            client.cookies.clear()
