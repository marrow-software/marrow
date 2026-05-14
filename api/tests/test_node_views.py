"""Integration tests for node view CRUD endpoints."""

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
    monkeypatch.setenv("MARROW_ALLOW_ANONYMOUS", "true")
    reset_oidc_config()
    yield
    reset_oidc_config()


@pytest.fixture
def client():
    from marrow.app import app

    return TestClient(app, raise_server_exceptions=False)


def _seed(db):
    user = User(
        oidc_issuer="https://test.example.com",
        oidc_subject=uuid.uuid4().hex,
        email=f"u-{uuid.uuid4().hex[:6]}@test",
        name="U",
    )
    db.add(user)
    db.flush()
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Org")
    db.add(org)
    db.flush()
    m = OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role=OrgRole.EDITOR.value)
    db.add(m)
    ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="WS")
    db.add(ws)
    db.flush()
    space = Space(workspace_id=ws.id, slug="main", name="Main")
    db.add(space)
    db.flush()
    folder = Node(
        space_id=space.id, type="folder", name="F", slug=f"f-{uuid.uuid4().hex[:6]}",
        position="a0", description="",
    )
    db.add(folder)
    db.flush()
    page = Node(
        space_id=space.id, parent_id=folder.id, type="page", name="P",
        slug=f"p-{uuid.uuid4().hex[:6]}", position="a0",
    )
    db.add(page)
    db.flush()
    rev = Revision(node_id=page.id, content="", content_format="markdown")
    db.add(rev)
    db.flush()
    page.current_revision_id = rev.id
    db.commit()
    return user, folder, page


def _auth(client, user):
    client.cookies.set(COOKIE_NAME, create_session_jwt(user.id, user.email, user.name))


def test_create_list_update_delete_view(client):
    from marrow.dependencies import get_db

    db = next(get_db())
    try:
        user, folder, page = _seed(db)
        _auth(client, user)

        r = client.post(
            f"/api/nodes/{folder.id}/views",
            json={
                "name": "Tasks",
                "view_type": "table",
                "config": {"sort": [{"prop": "name", "dir": "asc"}]},
            },
        )
        assert r.status_code == 201, r.text
        view_id = r.json()["id"]

        r = client.get(f"/api/nodes/{folder.id}/views")
        assert r.status_code == 200
        assert len(r.json()) == 1

        r = client.patch(
            f"/api/views/{view_id}",
            json={"view_type": "board", "config": {"group_by": "status"}},
        )
        assert r.status_code == 200, r.text
        assert r.json()["view_type"] == "board"
        assert r.json()["config"] == {"group_by": "status"}

        r = client.patch(f"/api/views/{view_id}", json={"view_type": "calendar"})
        assert r.status_code == 422

        r = client.delete(f"/api/views/{view_id}")
        assert r.status_code == 204
        r = client.get(f"/api/nodes/{folder.id}/views")
        assert r.json() == []
    finally:
        db.rollback()
        client.cookies.clear()


def test_view_must_attach_to_folder(client):
    from marrow.dependencies import get_db

    db = next(get_db())
    try:
        user, folder, page = _seed(db)
        _auth(client, user)

        r = client.post(
            f"/api/nodes/{page.id}/views",
            json={"name": "x", "view_type": "list"},
        )
        assert r.status_code == 400
    finally:
        db.rollback()
        client.cookies.clear()
