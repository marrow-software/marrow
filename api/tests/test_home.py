"""Tests for the Home / For You endpoint (workspace stats + recent pages)."""

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
from marrow.models import Node, Organization, Revision, Space, Workspace
from marrow.routers.workspaces import get_workspace_home

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
    db_name = f"marrow_home_{uuid.uuid4().hex[:8]}"
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


def _seed_workspace(db: Session) -> tuple[Workspace, Space]:
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Test Org")
    db.add(org)
    db.flush()
    ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="Test Workspace")
    db.add(ws)
    db.flush()
    space = Space(workspace_id=ws.id, slug="main", name="Main")
    db.add(space)
    db.flush()
    return ws, space


def _create_page(db, space, slug, name, *, parent=None, updated_at=None) -> Node:
    node = Node(
        space_id=space.id,
        parent_id=parent.id if parent else None,
        type="page",
        name=name,
        slug=slug,
        position="a0",
    )
    db.add(node)
    db.flush()
    # The home query orders by MAX(revision.created_at), not node.updated_at.
    rev = Revision(node_id=node.id, content=f"# {name}")
    if updated_at is not None:
        rev.created_at = updated_at
    db.add(rev)
    db.flush()
    node.current_revision_id = rev.id
    db.flush()
    return node


def _create_folder(db, space, slug, name, *, parent=None) -> Node:
    node = Node(
        space_id=space.id,
        parent_id=parent.id if parent else None,
        type="folder",
        name=name,
        slug=slug,
        position="a0",
    )
    db.add(node)
    db.flush()
    return node


def test_home_empty_workspace(db):
    ws, _space = _seed_workspace(db)
    # Remove the seeded space to simulate a brand-new workspace.
    db.delete(_space)
    db.flush()

    home = get_workspace_home(workspace_id=ws.id, limit=12, db=db, _=None)

    assert home.space_count == 0
    assert home.page_count == 0
    assert home.recent == []


def test_home_counts_and_recent_ordering(db):
    ws, space = _seed_workspace(db)
    now = datetime.now(timezone.utc)

    _create_folder(db, space, "docs", "Docs")
    folder = db.query(Node).filter_by(slug="docs").one()

    _create_page(db, space, "old", "Old Page", updated_at=now - timedelta(days=2))
    _create_page(db, space, "mid", "Mid Page", updated_at=now - timedelta(hours=2))
    nested = _create_page(db, space, "nested", "Nested Page", parent=folder, updated_at=now)
    # Soft-deleted pages must not count or appear.
    trashed = _create_page(db, space, "trashed", "Trashed", updated_at=now)
    trashed.deleted_at = now
    db.flush()

    home = get_workspace_home(workspace_id=ws.id, limit=12, db=db, _=None)

    assert home.space_count == 1
    assert home.page_count == 3  # trashed excluded
    names = [r.name for r in home.recent]
    assert names == ["Nested Page", "Mid Page", "Old Page"]
    assert "Trashed" not in names

    nested_item = next(r for r in home.recent if r.node_id == nested.id)
    assert nested_item.space_name == "Main"
    assert nested_item.node_path == ["Docs"]

    root_item = next(r for r in home.recent if r.name == "Old Page")
    assert root_item.node_path == []


def test_home_limit_is_clamped(db):
    ws, space = _seed_workspace(db)
    for i in range(5):
        _create_page(db, space, f"p{i}", f"Page {i}")

    home = get_workspace_home(workspace_id=ws.id, limit=2, db=db, _=None)
    assert len(home.recent) == 2
    assert home.page_count == 5
