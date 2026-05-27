"""Integration tests for node CRUD, revision, and attachment endpoints."""

import io
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


def _auth_cookie(client, user):
    token = create_session_jwt(user.id, user.email, user.name)
    client.cookies.set(COOKIE_NAME, token)


class TestCreateNode:
    def test_create_folder(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-folder@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/spaces/{space.id}/nodes",
                json={"type": "folder", "name": "My Folder", "slug": "my-folder"},
            )
            assert res.status_code == 201, res.text
            data = res.json()
            assert data["type"] == "folder"
            assert data["slug"] == "my-folder"
            assert data["current_revision_id"] is None
        finally:
            db.rollback()
            client.cookies.clear()

    def test_create_page_with_content(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-page@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/spaces/{space.id}/nodes",
                json={"type": "page", "name": "My Page", "content": "# Hello"},
            )
            assert res.status_code == 201, res.text
            data = res.json()
            assert data["type"] == "page"
            assert data["current_revision_id"] is not None
        finally:
            db.rollback()
            client.cookies.clear()

    def test_viewer_cannot_create_node(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-create@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/spaces/{space.id}/nodes",
                json={"type": "page", "name": "Forbidden"},
            )
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()


class TestGetNode:
    def test_get_node_with_content(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-get@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)

            node = Node(space_id=space.id, type="page", name="Test", slug="test", position="a0")
            db.add(node)
            db.flush()
            rev = Revision(node_id=node.id, content="hello", content_format="markdown")
            db.add(rev)
            db.flush()
            node.current_revision_id = rev.id
            db.commit()

            _auth_cookie(client, user)
            res = client.get(f"/api/nodes/{node.id}")
            assert res.status_code == 200
            data = res.json()
            assert data["content"] == "hello"
            assert data["content_format"] == "markdown"
        finally:
            db.rollback()
            client.cookies.clear()

    def test_get_deleted_node_returns_404(self, client):
        from datetime import datetime, timezone

        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-del-get@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)

            node = Node(
                space_id=space.id,
                type="folder",
                name="Gone",
                slug="gone",
                position="a0",
                deleted_at=datetime.now(timezone.utc),
            )
            db.add(node)
            db.commit()

            _auth_cookie(client, user)
            res = client.get(f"/api/nodes/{node.id}")
            assert res.status_code == 404
        finally:
            db.rollback()
            client.cookies.clear()


class TestPatchNode:
    def test_patch_content_creates_new_revision(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-patch@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)

            node = Node(space_id=space.id, type="page", name="Page", slug="page", position="a0")
            db.add(node)
            db.flush()
            rev = Revision(node_id=node.id, content="v1", content_format="markdown")
            db.add(rev)
            db.flush()
            node.current_revision_id = rev.id
            first_rev_id = rev.id
            db.commit()

            _auth_cookie(client, user)
            res = client.patch(f"/api/nodes/{node.id}", json={"content": "v2"})
            assert res.status_code == 200
            data = res.json()
            assert data["content"] == "v2"
            assert data["current_revision_id"] != str(first_rev_id)
        finally:
            db.rollback()
            client.cookies.clear()

    def test_patch_parent_id_cross_workspace_rejected(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-xws@test.com")
            org, ws, space = _make_workspace(db)
            org2, ws2, space2 = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            _add_membership(db, org2, user, OrgRole.EDITOR)

            node = Node(space_id=space.id, type="folder", name="A", slug="a", position="a0")
            db.add(node)
            other = Node(space_id=space2.id, type="folder", name="B", slug="b", position="a0")
            db.add(other)
            db.commit()

            _auth_cookie(client, user)
            res = client.patch(f"/api/nodes/{node.id}", json={"parent_id": str(other.id)})
            assert res.status_code == 400
        finally:
            db.rollback()
            client.cookies.clear()


class TestDeleteNode:
    def test_delete_soft_deletes_descendants(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "owner-delete@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.OWNER)

            parent = Node(
                space_id=space.id, type="folder", name="Parent", slug="parent", position="a0"
            )
            db.add(parent)
            db.flush()
            child = Node(
                space_id=space.id,
                parent_id=parent.id,
                type="page",
                name="Child",
                slug="child",
                position="a0",
            )
            db.add(child)
            db.commit()

            _auth_cookie(client, user)
            res = client.delete(f"/api/nodes/{parent.id}")
            assert res.status_code == 204

            db.expire_all()
            db.refresh(parent)
            db.refresh(child)
            assert parent.deleted_at is not None
            assert child.deleted_at is not None
        finally:
            db.rollback()
            client.cookies.clear()


class TestTrash:
    def test_delete_cascade_then_restore_subtree(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "owner-trash@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.OWNER)

            parent = Node(
                space_id=space.id, type="folder", name="P", slug="p", position="a0"
            )
            db.add(parent)
            db.flush()
            child = Node(
                space_id=space.id,
                parent_id=parent.id,
                type="folder",
                name="C",
                slug="c",
                position="a0",
            )
            db.add(child)
            db.flush()
            grandchild = Node(
                space_id=space.id,
                parent_id=child.id,
                type="page",
                name="GC",
                slug="gc",
                position="a0",
            )
            db.add(grandchild)
            db.commit()

            _auth_cookie(client, user)

            res = client.delete(f"/api/nodes/{parent.id}")
            assert res.status_code == 204

            db.expire_all()
            db.refresh(parent)
            db.refresh(child)
            db.refresh(grandchild)
            assert parent.deleted_at is not None
            assert child.deleted_at is not None
            assert grandchild.deleted_at is not None

            res = client.post(f"/api/nodes/{parent.id}/restore")
            assert res.status_code == 200, res.text

            db.expire_all()
            db.refresh(parent)
            db.refresh(child)
            db.refresh(grandchild)
            assert parent.deleted_at is None
            assert child.deleted_at is None
            assert grandchild.deleted_at is None
        finally:
            db.rollback()
            client.cookies.clear()

    def test_workspace_trash_lists_top_level(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-trash@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.OWNER)

            parent = Node(
                space_id=space.id, type="folder", name="P", slug="p", position="a0"
            )
            db.add(parent)
            db.flush()
            child = Node(
                space_id=space.id,
                parent_id=parent.id,
                type="page",
                name="C",
                slug="c",
                position="a0",
            )
            db.add(child)
            db.commit()

            _auth_cookie(client, user)
            res = client.delete(f"/api/nodes/{parent.id}")
            assert res.status_code == 204

            res = client.get(f"/api/workspaces/{ws.id}/trash")
            assert res.status_code == 200
            items = res.json()
            ids = {item["id"] for item in items}
            assert str(parent.id) in ids
            # child is trashed but its parent is also trashed → not top-level
            assert str(child.id) not in ids
        finally:
            db.rollback()
            client.cookies.clear()

    def test_restore_with_trashed_parent_rejected(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-rejrestore@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.OWNER)

            parent = Node(
                space_id=space.id, type="folder", name="P", slug="p", position="a0"
            )
            db.add(parent)
            db.flush()
            child = Node(
                space_id=space.id,
                parent_id=parent.id,
                type="page",
                name="C",
                slug="c",
                position="a0",
            )
            db.add(child)
            db.commit()

            _auth_cookie(client, user)
            client.delete(f"/api/nodes/{parent.id}")

            # child alone cannot be restored — its parent is still trashed
            res = client.post(f"/api/nodes/{child.id}/restore")
            assert res.status_code == 422
        finally:
            db.rollback()
            client.cookies.clear()

    def test_search_excludes_trashed_pages(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-trash-search@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.OWNER)

            node = Node(
                space_id=space.id,
                type="page",
                name="findme-trash-target",
                slug="findme",
                position="a0",
            )
            db.add(node)
            db.flush()
            rev = Revision(
                node_id=node.id,
                content="findme-trash-target body",
                content_format="markdown",
            )
            db.add(rev)
            db.flush()
            node.current_revision_id = rev.id
            db.commit()

            _auth_cookie(client, user)

            res = client.get(
                f"/api/workspaces/{ws.id}/search", params={"q": "findme-trash-target"}
            )
            assert res.status_code == 200
            assert any(r["node_id"] == str(node.id) for r in res.json()["results"])

            client.delete(f"/api/nodes/{node.id}")

            res = client.get(
                f"/api/workspaces/{ws.id}/search", params={"q": "findme-trash-target"}
            )
            assert res.status_code == 200
            assert not any(r["node_id"] == str(node.id) for r in res.json()["results"])
        finally:
            db.rollback()
            client.cookies.clear()

    def test_purge_endpoint_hard_deletes(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "owner-purge@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.OWNER)

            node = Node(
                space_id=space.id, type="folder", name="Z", slug="z", position="a0"
            )
            db.add(node)
            db.commit()
            node_id = node.id

            _auth_cookie(client, user)
            client.delete(f"/api/nodes/{node_id}")

            res = client.delete(f"/api/nodes/{node_id}/purge")
            assert res.status_code == 204

            db.expire_all()
            assert db.get(Node, node_id) is None
        finally:
            db.rollback()
            client.cookies.clear()

    def test_purge_rejects_live_node(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "owner-purge-live@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.OWNER)

            node = Node(
                space_id=space.id, type="folder", name="L", slug="l", position="a0"
            )
            db.add(node)
            db.commit()

            _auth_cookie(client, user)
            res = client.delete(f"/api/nodes/{node.id}/purge")
            assert res.status_code == 409
        finally:
            db.rollback()
            client.cookies.clear()

    def test_cli_purge_trash_respects_threshold(self):
        """CLI purge-trash deletes only nodes older than the threshold."""
        from datetime import datetime, timedelta, timezone

        from typer.testing import CliRunner

        from marrow.cli import app as cli_app
        from marrow.dependencies import get_db

        runner = CliRunner()

        db = next(get_db())
        try:
            _user = _make_user(db, "cli-purge@test.com")
            org, ws, space = _make_workspace(db)

            old = Node(
                space_id=space.id,
                type="folder",
                name="Old",
                slug="old",
                position="a0",
                deleted_at=datetime.now(timezone.utc) - timedelta(days=40),
            )
            db.add(old)
            recent = Node(
                space_id=space.id,
                type="folder",
                name="Rec",
                slug="rec",
                position="b0",
                deleted_at=datetime.now(timezone.utc) - timedelta(days=5),
            )
            db.add(recent)
            db.commit()
            old_id = old.id
            recent_id = recent.id
        finally:
            db.close()

        # Use the same env DATABASE_URL the test session uses.
        result = runner.invoke(cli_app, ["purge-trash", "--older-than-days", "30"])
        assert result.exit_code == 0, result.output

        db = next(get_db())
        try:
            assert db.get(Node, old_id) is None
            assert db.get(Node, recent_id) is not None
            # Cleanup
            n = db.get(Node, recent_id)
            db.delete(n)
            db.commit()
        finally:
            db.close()


class TestRevisions:
    def test_list_revisions_multiple_entries(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-revs@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)

            node = Node(space_id=space.id, type="page", name="Revs", slug="revs", position="a0")
            db.add(node)
            db.flush()
            r1 = Revision(node_id=node.id, content="v1", content_format="markdown")
            db.add(r1)
            db.flush()
            node.current_revision_id = r1.id
            r2 = Revision(node_id=node.id, content="v2", content_format="markdown")
            db.add(r2)
            db.flush()
            node.current_revision_id = r2.id
            db.commit()

            _auth_cookie(client, user)
            res = client.get(f"/api/nodes/{node.id}/revisions")
            assert res.status_code == 200
            assert len(res.json()) == 2
        finally:
            db.rollback()
            client.cookies.clear()

    def test_list_revisions_on_folder_returns_400(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-rev-folder@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)

            node = Node(space_id=space.id, type="folder", name="Fold", slug="fold", position="a0")
            db.add(node)
            db.commit()

            _auth_cookie(client, user)
            res = client.get(f"/api/nodes/{node.id}/revisions")
            assert res.status_code == 400
        finally:
            db.rollback()
            client.cookies.clear()

    def test_get_single_revision(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-rev-single@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)

            node = Node(space_id=space.id, type="page", name="Single", slug="single", position="a0")
            db.add(node)
            db.flush()
            rev = Revision(node_id=node.id, content="hello", content_format="markdown")
            db.add(rev)
            db.flush()
            node.current_revision_id = rev.id
            db.commit()

            _auth_cookie(client, user)
            res = client.get(f"/api/nodes/{node.id}/revisions/{rev.id}")
            assert res.status_code == 200
            assert res.json()["content"] == "hello"
        finally:
            db.rollback()
            client.cookies.clear()


class TestAttachments:
    def test_upload_and_download_attachment(self, client):
        from marrow.app import app
        from marrow.dependencies import get_db, get_storage
        from marrow.storage import StorageAdapter

        store: dict[str, bytes] = {}

        class FakeStorage(StorageAdapter):
            def read(self, aid, fn):
                return store[f"{aid}/{fn}"]

            def write(self, aid, fn, data):
                store[f"{aid}/{fn}"] = data

        app.dependency_overrides[get_storage] = lambda: FakeStorage()

        db = next(get_db())
        try:
            user = _make_user(db, "editor-attach@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)

            node = Node(space_id=space.id, type="page", name="Attach", slug="attach", position="a0")
            db.add(node)
            db.flush()
            rev = Revision(node_id=node.id, content="x", content_format="markdown")
            db.add(rev)
            db.flush()
            node.current_revision_id = rev.id
            db.commit()

            _auth_cookie(client, user)
            file_bytes = b"hello attachment"
            res = client.post(
                f"/api/nodes/{node.id}/attachments",
                files={"file": ("test.txt", io.BytesIO(file_bytes), "text/plain")},
            )
            assert res.status_code == 201, res.text
            att_id = res.json()["id"]

            res2 = client.get(f"/api/nodes/{node.id}/attachments")
            assert res2.status_code == 200
            assert len(res2.json()) == 1

            res3 = client.get(f"/api/nodes/{node.id}/attachments/{att_id}/file")
            assert res3.status_code == 200
            assert res3.content == file_bytes
        finally:
            db.rollback()
            client.cookies.clear()
            app.dependency_overrides.clear()


class TestListSpaceRootNodes:
    def test_list_root_nodes(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-list@test.com")
            org, ws, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)

            n1 = Node(space_id=space.id, type="folder", name="A", slug="a", position="a0")
            n2 = Node(space_id=space.id, type="folder", name="B", slug="b", position="b0")
            db.add(n1)
            db.add(n2)
            db.commit()

            _auth_cookie(client, user)
            res = client.get(f"/api/spaces/{space.id}/nodes")
            assert res.status_code == 200
            slugs = {n["slug"] for n in res.json()}
            assert "a" in slugs
            assert "b" in slugs
        finally:
            db.rollback()
            client.cookies.clear()


class TestCreateWorkspaceInOrg:
    def test_editor_can_create_workspace(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-ws@test.com")
            org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Test Org")
            db.add(org)
            db.flush()
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/orgs/{org.id}/workspaces",
                json={"slug": "new-ws", "name": "New Workspace"},
            )
            assert res.status_code == 201, res.text
            data = res.json()
            assert data["slug"] == "new-ws"
            assert data["org_id"] == str(org.id)
        finally:
            db.rollback()
            client.cookies.clear()

    def test_viewer_cannot_create_workspace(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "viewer-ws@test.com")
            org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Test Org")
            db.add(org)
            db.flush()
            _add_membership(db, org, user, OrgRole.VIEWER)
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/orgs/{org.id}/workspaces",
                json={"slug": "viewer-ws", "name": "Viewer Workspace"},
            )
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()

    def test_old_create_workspace_route_returns_410(self, client):
        res = client.post("/api/workspaces", json={"slug": "old", "name": "Old"})
        assert res.status_code == 410

    def test_slug_conflict_returns_409(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "owner-ws@test.com")
            org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Test Org")
            db.add(org)
            db.flush()
            _add_membership(db, org, user, OrgRole.OWNER)
            db.commit()

            _auth_cookie(client, user)
            client.post(f"/api/orgs/{org.id}/workspaces", json={"slug": "dupe", "name": "First"})
            res = client.post(f"/api/orgs/{org.id}/workspaces", json={"slug": "dupe", "name": "Second"})
            assert res.status_code == 409
        finally:
            db.rollback()
            client.cookies.clear()
