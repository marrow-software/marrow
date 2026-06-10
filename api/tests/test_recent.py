"""Tests for GET /api/users/me/recent — cross-workspace recent pages."""

import os
import uuid
from datetime import datetime, timedelta, timezone

import psycopg2
import pytest
from alembic.config import Config
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from alembic import command
from marrow.dependencies import AuthContext
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
from marrow.routers.users import list_recent

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
    db_name = f"marrow_recent_{uuid.uuid4().hex[:8]}"
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


def _make_user(db: Session) -> User:
    user = User(
        oidc_issuer="https://idp.test",
        oidc_subject=uuid.uuid4().hex,
        email=f"u-{uuid.uuid4().hex[:6]}@example.com",
        name="Test User",
    )
    db.add(user)
    db.flush()
    return user


def _make_workspace(db: Session, *, member: User | None) -> tuple[Workspace, Space]:
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Org")
    db.add(org)
    db.flush()
    if member is not None:
        db.add(
            OrgMembership(
                org_id=org.id, user_id=member.id, email=member.email, role=OrgRole.OWNER.value
            )
        )
    ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name=f"WS {org.slug}")
    db.add(ws)
    db.flush()
    space = Space(workspace_id=ws.id, slug="main", name="Main")
    db.add(space)
    db.flush()
    return ws, space


def _create_page(db, space, slug, name, *, updated_at=None) -> Node:
    node = Node(space_id=space.id, type="page", name=name, slug=slug, position="a0")
    db.add(node)
    db.flush()
    rev = Revision(node_id=node.id, content=f"# {name}")
    if updated_at is not None:
        rev.created_at = updated_at
    db.add(rev)
    db.flush()
    node.current_revision_id = rev.id
    db.flush()
    return node


def test_recent_spans_workspaces_and_orders_by_recency(db):
    user = _make_user(db)
    now = datetime.now(timezone.utc)

    ws_a, space_a = _make_workspace(db, member=user)
    ws_b, space_b = _make_workspace(db, member=user)

    _create_page(db, space_a, "old", "Old A", updated_at=now - timedelta(days=2))
    _create_page(db, space_b, "new", "New B", updated_at=now)
    _create_page(db, space_a, "mid", "Mid A", updated_at=now - timedelta(hours=1))

    auth = AuthContext(user_id=user.id, email=user.email, method="session")
    items = list_recent(limit=12, db=db, auth=auth)

    assert [i.name for i in items] == ["New B", "Mid A", "Old A"]
    # Cross-workspace: items carry their own workspace identity.
    ws_names = {i.workspace_name for i in items}
    assert ws_names == {ws_a.name, ws_b.name}
    new_b = next(i for i in items if i.name == "New B")
    assert new_b.workspace_id == ws_b.id


def test_recent_excludes_inaccessible_and_trashed(db):
    user = _make_user(db)
    now = datetime.now(timezone.utc)

    _ws_a, space_a = _make_workspace(db, member=user)
    _ws_other, space_other = _make_workspace(db, member=None)  # user is NOT a member

    _create_page(db, space_a, "mine", "Mine", updated_at=now)
    trashed = _create_page(db, space_a, "trash", "Trashed", updated_at=now)
    trashed.deleted_at = now
    db.flush()
    _create_page(db, space_other, "theirs", "Theirs", updated_at=now)

    auth = AuthContext(user_id=user.id, email=user.email, method="session")
    names = [i.name for i in list_recent(limit=12, db=db, auth=auth)]

    assert names == ["Mine"]
    assert "Theirs" not in names  # not a member
    assert "Trashed" not in names  # soft-deleted


def test_recent_limit_clamped(db):
    user = _make_user(db)
    _ws, space = _make_workspace(db, member=user)
    for i in range(5):
        _create_page(db, space, f"p{i}", f"Page {i}")

    auth = AuthContext(user_id=user.id, email=user.email, method="session")
    assert len(list_recent(limit=2, db=db, auth=auth)) == 2
