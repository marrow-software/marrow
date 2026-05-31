"""Integration tests for node property schemas, values, inheritance, and FTS."""

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
from marrow.search import PostgresSearchBackend

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


def _setup(db, role: OrgRole = OrgRole.EDITOR):
    user = User(
        oidc_issuer="https://test.example.com",
        oidc_subject=uuid.uuid4().hex,
        email=f"prop-{uuid.uuid4().hex[:6]}@test.com",
        name="Prop User",
    )
    db.add(user)
    db.flush()
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Org")
    db.add(org)
    db.flush()
    ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="WS")
    db.add(ws)
    db.flush()
    space = Space(workspace_id=ws.id, slug="main", name="Main")
    db.add(space)
    db.flush()
    db.add(OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role=role.value))
    db.flush()
    return user, ws, space


def _auth(client, user):
    client.cookies.set(COOKIE_NAME, create_session_jwt(user.id, user.email, user.name))


def _page(db, space, name, parent_id=None):
    node = Node(
        space_id=space.id,
        parent_id=parent_id,
        type="page",
        name=name,
        slug=name.lower().replace(" ", "-"),
        position="a0",
    )
    db.add(node)
    db.flush()
    rev = Revision(node_id=node.id, content=f"{name} body", content_format="markdown")
    db.add(rev)
    db.flush()
    node.current_revision_id = rev.id
    db.flush()
    return node


def _folder(db, space, name, parent_id=None):
    node = Node(
        space_id=space.id,
        parent_id=parent_id,
        type="folder",
        name=name,
        slug=name.lower().replace(" ", "-"),
        position="a0",
    )
    db.add(node)
    db.flush()
    return node


class TestPropertySchema:
    def test_folder_schema_crud(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user, ws, space = _setup(db)
            folder = _folder(db, space, "Docs")
            db.commit()
            _auth(client, user)

            r = client.put(
                f"/api/nodes/{folder.id}/property-schema/status",
                json={"value_type": "select", "options": ["todo", "done"]},
            )
            assert r.status_code == 200, r.text
            assert r.json()["options"] == ["todo", "done"]

            r = client.get(f"/api/nodes/{folder.id}/property-schema")
            assert r.status_code == 200
            assert [p["key"] for p in r.json()] == ["status"]

            r = client.delete(f"/api/nodes/{folder.id}/property-schema/status")
            assert r.status_code == 204
            assert client.get(f"/api/nodes/{folder.id}/property-schema").json() == []
        finally:
            db.rollback()
            client.cookies.clear()

    def test_select_requires_options(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user, ws, space = _setup(db)
            folder = _folder(db, space, "Docs2")
            db.commit()
            _auth(client, user)
            r = client.put(
                f"/api/nodes/{folder.id}/property-schema/tags",
                json={"value_type": "multi-select"},
            )
            assert r.status_code == 400
        finally:
            db.rollback()
            client.cookies.clear()

    def test_schema_rejected_on_page(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user, ws, space = _setup(db)
            page = _page(db, space, "Page A")
            db.commit()
            _auth(client, user)
            r = client.put(
                f"/api/nodes/{page.id}/property-schema/x",
                json={"value_type": "text"},
            )
            assert r.status_code == 400
        finally:
            db.rollback()
            client.cookies.clear()


class TestPropertyInheritance:
    def test_page_inherits_folder_schema_and_overlays_value(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user, ws, space = _setup(db)
            folder = _folder(db, space, "Project")
            page = _page(db, space, "Task", parent_id=folder.id)
            db.commit()
            _auth(client, user)

            client.put(
                f"/api/nodes/{folder.id}/property-schema/priority",
                json={"value_type": "select", "options": ["low", "high"]},
            )

            r = client.get(f"/api/nodes/{page.id}/properties")
            assert r.status_code == 200
            props = {p["key"]: p for p in r.json()["properties"]}
            assert props["priority"]["inherited"] is True
            assert props["priority"]["value"] is None
            assert props["priority"]["options"] == ["low", "high"]

            r = client.put(
                f"/api/nodes/{page.id}/properties/priority",
                json={"value": "high", "value_type": "select"},
            )
            assert r.status_code == 200, r.text

            props = {
                p["key"]: p
                for p in client.get(f"/api/nodes/{page.id}/properties").json()["properties"]
            }
            assert props["priority"]["value"] == "high"
            assert props["priority"]["inherited"] is True
        finally:
            db.rollback()
            client.cookies.clear()

    def test_value_rejected_on_folder(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user, ws, space = _setup(db)
            folder = _folder(db, space, "F")
            db.commit()
            _auth(client, user)
            r = client.put(
                f"/api/nodes/{folder.id}/properties/k",
                json={"value": "v", "value_type": "text"},
            )
            assert r.status_code == 400
        finally:
            db.rollback()
            client.cookies.clear()


class TestPropertyFTS:
    def test_property_value_is_searchable(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user, ws, space = _setup(db)
            page = _page(db, space, "Quarterly Report")
            db.commit()
            _auth(client, user)

            client.put(
                f"/api/nodes/{page.id}/properties/owner",
                json={"value": "zephyrandromeda", "value_type": "text"},
            )

            results = PostgresSearchBackend().search(ws.id, "zephyrandromeda", db)
            assert any(res.node_id == page.id for res in results)
        finally:
            db.rollback()
            client.cookies.clear()
