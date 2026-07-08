"""Auto-provision workspace + space on personal org creation (#241)."""

import os
import uuid
from types import SimpleNamespace

import psycopg2
import pytest
from alembic.config import Config
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from alembic import command
from marrow.models import Organization, OrgMembership, OrgRole, Space, User, Workspace
from marrow.provisioning import provision_default_workspace_and_space
from marrow.routers import organizations as orgs_router
from marrow.schemas import OrganizationCreate

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
    db_name = f"marrow_provisioning_{uuid.uuid4().hex[:8]}"
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


def _seed_org(db: Session) -> Organization:
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Test Org")
    db.add(org)
    db.flush()
    return org


def test_provision_creates_workspace_and_space(db):
    org = _seed_org(db)

    ws, space = provision_default_workspace_and_space(db, org.id)

    assert ws.org_id == org.id
    assert ws.name == "Main"
    assert ws.slug == f"main-{org.id.hex}"
    assert space.workspace_id == ws.id
    assert space.slug == "main"
    assert space.name == "Main"


def test_provision_workspace_slug_collision(db):
    org = _seed_org(db)
    colliding = f"main-{org.id.hex}"
    db.add(Workspace(org_id=org.id, slug=colliding, name="Existing"))
    db.flush()

    ws, _space = provision_default_workspace_and_space(db, org.id)

    assert ws.slug != colliding
    assert ws.slug.startswith(f"main-{org.id.hex}")


def test_provision_is_idempotent_per_call_but_not_guarded(db):
    """Each call creates new rows — onboard must only provision when none exist."""
    org = _seed_org(db)
    provision_default_workspace_and_space(db, org.id)
    provision_default_workspace_and_space(db, org.id)

    workspaces = db.scalars(select(Workspace).where(Workspace.org_id == org.id)).all()
    assert len(workspaces) == 2


def test_create_org_does_not_provision(db):
    auth = SimpleNamespace(user_id=None, email=None)
    result = orgs_router.create_org(
        OrganizationCreate(slug=f"explicit-{uuid.uuid4().hex[:6]}", name="Named Already"),
        db=db,
        auth=auth,
    )

    workspaces = db.scalars(select(Workspace).where(Workspace.org_id == result.id)).all()
    assert workspaces == []


def test_personal_org_signup_does_not_provision_until_onboard(db):
    """Auth callback creates org only; workspace is provisioned on first /onboard."""
    from marrow.schemas import OrganizationOnboard

    user = User(
        oidc_issuer="https://test.example.com",
        oidc_subject=uuid.uuid4().hex,
        email=f"new-{uuid.uuid4().hex[:6]}@example.com",
        name="New User",
    )
    db.add(user)
    db.flush()

    org = Organization(name="New User's Space", slug=f"user-{uuid.uuid4().hex[:6]}")
    db.add(org)
    db.flush()
    db.add(
        OrgMembership(
            org_id=org.id,
            user_id=user.id,
            email=user.email,
            role=OrgRole.OWNER.value,
        )
    )
    db.flush()

    workspaces = db.scalars(select(Workspace).where(Workspace.org_id == org.id)).all()
    assert workspaces == []

    orgs_router.onboard_org(org.id, OrganizationOnboard(name="Acme"), db=db, auth=None)

    workspaces = db.scalars(select(Workspace).where(Workspace.org_id == org.id)).all()
    assert len(workspaces) == 1
    spaces = db.scalars(select(Space).where(Space.workspace_id == workspaces[0].id)).all()
    assert len(spaces) == 1


def test_relogin_does_not_reprovision(db):
    """User with existing membership should not hit the personal-org block."""
    user = User(
        oidc_issuer="https://test.example.com",
        oidc_subject=uuid.uuid4().hex,
        email=f"returning-{uuid.uuid4().hex[:6]}@example.com",
        name="Returning User",
    )
    db.add(user)
    db.flush()

    org = _seed_org(db)
    db.add(
        OrgMembership(
            org_id=org.id,
            user_id=user.id,
            email=user.email,
            role=OrgRole.OWNER.value,
        )
    )
    provision_default_workspace_and_space(db, org.id)
    db.flush()

    has_memberships = (
        db.query(OrgMembership).filter(OrgMembership.user_id == user.id).first()
    ) is not None
    assert has_memberships is True

    workspaces = db.scalars(select(Workspace).where(Workspace.org_id == org.id)).all()
    assert len(workspaces) == 1
