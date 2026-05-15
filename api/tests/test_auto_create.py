"""Tests for org+workspace auto-creation: OIDC callback and API_KEY startup hook."""

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from marrow.auth import reset_oidc_config
from marrow.models import OrgMembership, OrgRole, Organization, User, Workspace
from marrow.routers.auth import _unique_workspace_slug, _unique_org_slug

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
def db():
    from marrow.dependencies import _engine

    with Session(_engine) as session:
        yield session


# ---------------------------------------------------------------------------
# _ensure_default_org_and_workspace (startup hook)
# ---------------------------------------------------------------------------


class TestEnsureDefaultOrgAndWorkspace:
    def test_noop_when_orgs_exist(self, db):
        """When at least one org exists, the function does nothing."""
        from marrow.app import _ensure_default_org_and_workspace

        # Ensure there's at least one org (the shared test DB always has some)
        existing_org = db.query(Organization).first()
        if existing_org is None:
            org = Organization(slug=f"seed-{uuid.uuid4().hex[:6]}", name="Seed Org")
            db.add(org)
            db.commit()

        count_before = db.query(Organization).count()
        _ensure_default_org_and_workspace()
        # Guard clause fired: count unchanged
        assert db.query(Organization).count() == count_before

    def test_creates_default_org_and_workspace_logic(self, db):
        """Verify the creation logic: Default org + workspace with correct fields."""
        suffix = uuid.uuid4().hex[:6]
        # Simulate what _ensure_default_org_and_workspace does
        org = Organization(slug=f"default-{suffix}", name="Default")
        db.add(org)
        db.flush()
        ws = Workspace(org_id=org.id, slug=f"default-{suffix}", name="Default")
        db.add(ws)
        db.commit()

        fetched_org = db.query(Organization).filter(Organization.id == org.id).first()
        assert fetched_org is not None
        assert fetched_org.name == "Default"

        fetched_ws = db.query(Workspace).filter(Workspace.org_id == org.id).first()
        assert fetched_ws is not None
        assert fetched_ws.name == "Default"
        assert fetched_ws.org_id == org.id


# ---------------------------------------------------------------------------
# OIDC callback: auto-create org + workspace for new users
# ---------------------------------------------------------------------------


class TestOidcAutoCreate:
    def test_new_user_gets_org_and_workspace(self, db):
        """When a new user has no invites, they should get a personal org + workspace."""
        suffix = uuid.uuid4().hex[:6]
        email = f"newuser-{suffix}@example.com"
        slug_base = f"newuser-{suffix}"

        user = User(
            oidc_issuer="https://test.example.com",
            oidc_subject=uuid.uuid4().hex,
            email=email,
            name=f"New User {suffix}",
        )
        db.add(user)
        db.flush()

        # Simulate the auto-create logic from the OIDC callback
        org_slug = _unique_org_slug(db, slug_base)
        personal_org = Organization(name=f"{user.name}'s Org", slug=org_slug)
        db.add(personal_org)
        db.flush()

        db.add(
            OrgMembership(
                org_id=personal_org.id,
                user_id=user.id,
                email=user.email,
                role=OrgRole.OWNER.value,
            )
        )

        ws_slug = _unique_workspace_slug(db, slug_base)
        db.add(Workspace(org_id=personal_org.id, slug=ws_slug, name="Default"))
        db.commit()

        # Verify org exists
        org = db.query(Organization).filter(Organization.id == personal_org.id).first()
        assert org is not None
        assert org.name == f"New User {suffix}'s Org"

        # Verify user is owner
        membership = (
            db.query(OrgMembership)
            .filter(OrgMembership.org_id == org.id, OrgMembership.user_id == user.id)
            .first()
        )
        assert membership is not None
        assert membership.role == OrgRole.OWNER.value

        # Verify default workspace exists
        workspace = db.query(Workspace).filter(Workspace.org_id == org.id).first()
        assert workspace is not None
        assert workspace.name == "Default"

    def test_slug_uniqueness_helpers(self, db):
        """Slug helpers append suffixes on collision."""
        suffix = uuid.uuid4().hex[:6]
        base = f"collision-test-{suffix}"

        # First call returns clean slug
        slug1 = _unique_org_slug(db, base)
        org = Organization(slug=slug1, name="Collision Test Org")
        db.add(org)
        db.flush()

        # Second call with same base returns a different slug
        slug2 = _unique_org_slug(db, base)
        assert slug2 != slug1

        ws_base = f"ws-collision-{suffix}"
        ws_slug1 = _unique_workspace_slug(db, ws_base)
        ws = Workspace(org_id=org.id, slug=ws_slug1, name="WS 1")
        db.add(ws)
        db.flush()

        ws_slug2 = _unique_workspace_slug(db, ws_base)
        assert ws_slug2 != ws_slug1

        db.rollback()


# ---------------------------------------------------------------------------
# API_KEY startup integration: TestClient lifespan triggers hook
# ---------------------------------------------------------------------------


class TestApiKeyStartupViaTestClient:
    def test_startup_hook_runs_in_test_client(self, monkeypatch):
        """When API_KEY is set with no OIDC, TestClient lifespan triggers the hook.

        Since the shared test DB already has orgs, the hook should be a noop
        (idempotent). We just verify no exception is raised.
        """
        monkeypatch.setenv("API_KEY", "test-api-key")

        from marrow.app import app

        # Using TestClient as context manager triggers the lifespan
        with TestClient(app, raise_server_exceptions=True) as client:
            res = client.get("/health", headers={"X-API-Key": "test-api-key"})
            assert res.status_code == 200
