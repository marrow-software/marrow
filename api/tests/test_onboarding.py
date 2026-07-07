"""Org onboarding tests — onboarded_at, /onboard endpoint, needs_onboarding (#214)."""

import os
import uuid
from types import SimpleNamespace

import psycopg2
import pytest
from alembic.config import Config
from fastapi import HTTPException
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from alembic import command
from marrow.models import Organization, OrgMembership, OrgRole, User
from marrow.routers import auth as auth_router
from marrow.routers import organizations as orgs_router
from marrow.schemas import OrganizationCreate, OrganizationOnboard, OrganizationUpdate

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://marrow:marrow@localhost:5433/marrow")


def _base_dsn() -> str:
    return DATABASE_URL.rsplit("/", 1)[0]


def _alembic_cfg(url: str) -> Config:
    os.environ["DATABASE_URL"] = url
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


@pytest.fixture(scope="module")
def db_url():
    db_name = f"marrow_onboarding_{uuid.uuid4().hex[:8]}"
    admin = psycopg2.connect(f"{_base_dsn()}/postgres")
    admin.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    with admin.cursor() as cur:
        cur.execute(f'CREATE DATABASE "{db_name}"')
    admin.close()

    url = f"{_base_dsn()}/{db_name}"
    command.upgrade(_alembic_cfg(url), "head")
    yield url

    admin = psycopg2.connect(f"{_base_dsn()}/postgres")
    admin.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    with admin.cursor() as cur:
        cur.execute(f'DROP DATABASE "{db_name}" WITH (FORCE)')
    admin.close()


@pytest.fixture(scope="module")
def engine(db_url):
    eng = create_engine(db_url)
    yield eng
    eng.dispose()


@pytest.fixture()
def db(engine):
    conn = engine.connect()
    tx = conn.begin()
    session = Session(bind=conn)
    yield session
    session.close()
    tx.rollback()
    conn.close()


def _seed_org(db: Session, **overrides) -> Organization:
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Acme's Space", **overrides)
    db.add(org)
    db.flush()
    return org


def _seed_owner(db: Session, org: Organization) -> User:
    user = User(
        oidc_issuer="https://test.example.com",
        oidc_subject=uuid.uuid4().hex,
        email=f"owner-{uuid.uuid4().hex[:6]}@example.com",
        name="Owner",
    )
    db.add(user)
    db.flush()
    db.add(
        OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role=OrgRole.OWNER.value)
    )
    db.flush()
    return user


def test_onboard_sets_name_and_onboarded_at(db):
    org = _seed_org(db)
    assert org.onboarded_at is None

    result = orgs_router.onboard_org(
        org.id, OrganizationOnboard(name="  Real Name  "), db=db, auth=None
    )

    assert result.name == "Real Name"
    assert result.onboarded_at is not None


def test_onboard_rejects_empty_name(db):
    org = _seed_org(db)
    with pytest.raises(HTTPException) as exc:
        orgs_router.onboard_org(org.id, OrganizationOnboard(name="   "), db=db, auth=None)
    assert exc.value.status_code == 422


def test_onboard_is_idempotent_on_timestamp(db):
    org = _seed_org(db)
    orgs_router.onboard_org(org.id, OrganizationOnboard(name="First"), db=db, auth=None)
    first_ts = db.get(Organization, org.id).onboarded_at

    orgs_router.onboard_org(org.id, OrganizationOnboard(name="Second"), db=db, auth=None)
    refreshed = db.get(Organization, org.id)
    assert refreshed.name == "Second"
    assert refreshed.onboarded_at == first_ts


def test_update_org_applies_name(db):
    org = _seed_org(db, onboarded_at=None)
    result = orgs_router.update_org(
        org.id, OrganizationUpdate(name="Renamed Org"), db=db, auth=None
    )
    assert result.name == "Renamed Org"


def test_update_org_rejects_empty_name(db):
    org = _seed_org(db)
    with pytest.raises(HTTPException) as exc:
        orgs_router.update_org(org.id, OrganizationUpdate(name="  "), db=db, auth=None)
    assert exc.value.status_code == 422


def test_create_org_skips_onboarding(db):
    auth = SimpleNamespace(user_id=None, email=None)
    result = orgs_router.create_org(
        OrganizationCreate(slug=f"explicit-{uuid.uuid4().hex[:6]}", name="Named Already"),
        db=db,
        auth=auth,
    )
    assert result.onboarded_at is not None


def test_needs_onboarding_toggles(db, monkeypatch):
    monkeypatch.setenv("SAAS_MODE", "true")
    monkeypatch.setattr(auth_router, "get_db", lambda: iter([db]))

    org = _seed_org(db)
    user = _seed_owner(db, org)

    has_payable, needs_onboarding = auth_router._owner_gate_flags(user.id)
    assert needs_onboarding is True
    assert has_payable is True

    org = db.get(Organization, org.id)
    orgs_router.onboard_org(org.id, OrganizationOnboard(name="Acme"), db=db, auth=None)
    org = db.get(Organization, org.id)
    org.subscription_status = "trialing"
    db.flush()

    has_payable, needs_onboarding = auth_router._owner_gate_flags(user.id)
    assert needs_onboarding is False
    assert has_payable is False


def test_gate_flags_off_in_self_hosted_mode(db, monkeypatch):
    monkeypatch.delenv("SAAS_MODE", raising=False)
    monkeypatch.setattr(auth_router, "get_db", lambda: iter([db]))

    org = _seed_org(db)
    user = _seed_owner(db, org)

    has_payable, needs_onboarding = auth_router._owner_gate_flags(user.id)
    assert has_payable is False
    assert needs_onboarding is True

    orgs_router.onboard_org(org.id, OrganizationOnboard(name="Acme"), db=db, auth=None)
    has_payable, needs_onboarding = auth_router._owner_gate_flags(user.id)
    assert has_payable is False
    assert needs_onboarding is False
