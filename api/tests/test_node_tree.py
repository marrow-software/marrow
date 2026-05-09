"""Node-tree invariants: soft-delete cascade, restore cascade, slug uniqueness,
parent reparenting validation, and cross-workspace move rejection.

Soft-delete cascade and restore cascade are application-level behaviour
(implemented by the node delete handler / a future restore handler). The
invariants here exercise the underlying database state plus the API endpoints
that enforce them.
"""

import os
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from marrow.auth import COOKIE_NAME, create_session_jwt, reset_oidc_config
from marrow.models import (
    Node,
    Organization,
    OrgMembership,
    OrgRole,
    Space,
    User,
    Workspace,
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://marrow:marrow@localhost:5433/marrow")


# Use the live database (same one the API uses), but wrap each test in a
# transaction that gets rolled back so we don't leak rows into other tests.


@pytest.fixture(scope="module")
def engine():
    eng = create_engine(DATABASE_URL)
    yield eng
    eng.dispose()


@pytest.fixture
def session(engine):
    conn = engine.connect()
    tx = conn.begin()
    sess = Session(bind=conn)
    yield sess
    sess.close()
    tx.rollback()
    conn.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_workspace(session) -> tuple[Workspace, Space]:
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Org")
    session.add(org)
    session.flush()
    ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="WS")
    session.add(ws)
    session.flush()
    space = Space(workspace_id=ws.id, slug="main", name="Main")
    session.add(space)
    session.flush()
    return ws, space


def _folder(session, space, slug, name="Folder", parent=None) -> Node:
    n = Node(
        space_id=space.id,
        parent_id=parent.id if parent else None,
        type="folder",
        name=name,
        slug=slug,
        position="a0",
    )
    session.add(n)
    session.flush()
    return n


def _page(session, space, slug, name="Page", parent=None) -> Node:
    n = Node(
        space_id=space.id,
        parent_id=parent.id if parent else None,
        type="page",
        name=name,
        slug=slug,
        position="a0",
    )
    session.add(n)
    session.flush()
    return n


# ---------------------------------------------------------------------------
# Slug uniqueness
# ---------------------------------------------------------------------------


def test_duplicate_slug_at_root_rejected(session):
    _ws, space = _seed_workspace(session)
    _folder(session, space, "dup")
    with pytest.raises(IntegrityError):
        _folder(session, space, "dup")


def test_duplicate_slug_under_same_parent_rejected(session):
    _ws, space = _seed_workspace(session)
    parent = _folder(session, space, "parent")
    _page(session, space, "child", parent=parent)
    with pytest.raises(IntegrityError):
        _page(session, space, "child", parent=parent)


def test_same_slug_in_different_parents_allowed(session):
    _ws, space = _seed_workspace(session)
    p1 = _folder(session, space, "p1")
    p2 = _folder(session, space, "p2")
    _page(session, space, "shared", parent=p1)
    _page(session, space, "shared", parent=p2)


def test_soft_deleted_slug_can_be_reused(session):
    """The unique index excludes soft-deleted rows; trash must not block recreation."""
    _ws, space = _seed_workspace(session)
    n1 = _folder(session, space, "reusable")
    n1.deleted_at = datetime.now(tz=timezone.utc)
    session.flush()
    # Same slug, same root scope, must succeed now that n1 is trashed.
    _folder(session, space, "reusable")


# ---------------------------------------------------------------------------
# Soft-delete cascade and restore cascade
# (delete is exposed via the API; restore is application-level too — we use the
# raw model + recursive helpers to assert the invariant the handlers must
# uphold.)
# ---------------------------------------------------------------------------


def _soft_delete_subtree(session, root: Node, when: datetime) -> None:
    root.deleted_at = when
    children = session.execute(
        select(Node).where(Node.parent_id == root.id, Node.deleted_at.is_(None))
    ).scalars().all()
    for c in children:
        _soft_delete_subtree(session, c, when)


def _restore_subtree(session, root: Node, when: datetime) -> None:
    root.deleted_at = None
    # Restore only descendants that were trashed in the same operation.
    children = session.execute(
        select(Node).where(Node.parent_id == root.id, Node.deleted_at == when)
    ).scalars().all()
    for c in children:
        _restore_subtree(session, c, when)


def test_soft_delete_cascades_to_descendants(session):
    _ws, space = _seed_workspace(session)
    root = _folder(session, space, "root")
    sub = _folder(session, space, "sub", parent=root)
    leaf = _page(session, space, "leaf", parent=sub)

    when = datetime.now(tz=timezone.utc)
    _soft_delete_subtree(session, root, when)
    session.flush()

    for n in (root, sub, leaf):
        session.refresh(n)
        assert n.deleted_at is not None


def test_restore_cascades_to_descendants(session):
    _ws, space = _seed_workspace(session)
    root = _folder(session, space, "root")
    sub = _folder(session, space, "sub", parent=root)
    leaf = _page(session, space, "leaf", parent=sub)

    when = datetime.now(tz=timezone.utc)
    _soft_delete_subtree(session, root, when)
    session.flush()
    _restore_subtree(session, root, when)
    session.flush()

    for n in (root, sub, leaf):
        session.refresh(n)
        assert n.deleted_at is None


def test_soft_delete_does_not_touch_pre_trashed_descendants(session):
    """Restoring should not bring back nodes that were independently trashed earlier."""
    _ws, space = _seed_workspace(session)
    root = _folder(session, space, "root")
    sub = _folder(session, space, "sub", parent=root)
    leaf = _page(session, space, "leaf", parent=sub)

    earlier = datetime(2024, 1, 1, tzinfo=timezone.utc)
    leaf.deleted_at = earlier
    session.flush()

    later = datetime.now(tz=timezone.utc)
    _soft_delete_subtree(session, root, later)
    session.flush()

    session.refresh(leaf)
    # leaf was already trashed at `earlier`; the cascade should have left it.
    assert leaf.deleted_at == earlier

    _restore_subtree(session, root, later)
    session.flush()
    session.refresh(leaf)
    assert leaf.deleted_at == earlier  # still trashed


# ---------------------------------------------------------------------------
# Parent reparenting + cross-workspace move (API-level validation)
# ---------------------------------------------------------------------------


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


def _api_seed(db) -> tuple[Organization, Workspace, Space, User]:
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Org")
    db.add(org)
    db.flush()
    ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="WS")
    db.add(ws)
    db.flush()
    space = Space(workspace_id=ws.id, slug="main", name="Main")
    db.add(space)
    db.flush()
    user = User(
        oidc_issuer="https://test.example.com",
        oidc_subject=uuid.uuid4().hex,
        email=f"{uuid.uuid4().hex[:6]}@test.com",
        name="API User",
    )
    db.add(user)
    db.flush()
    db.add(OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role=OrgRole.EDITOR.value))
    db.flush()
    return org, ws, space, user


def _auth(client, user):
    token = create_session_jwt(user.id, user.email, user.name)
    client.cookies.set(COOKIE_NAME, token)


def test_reparent_to_missing_node_returns_404(client):
    from marrow.dependencies import get_db

    db = next(get_db())
    try:
        org, ws, space, user = _api_seed(db)
        node = _page(db, space, f"reparent-{uuid.uuid4().hex[:6]}")
        db.commit()

        _auth(client, user)
        res = client.patch(
            f"/api/nodes/{node.id}",
            json={"parent_id": str(uuid.uuid4())},
        )
        assert res.status_code == 404
    finally:
        db.rollback()
        client.cookies.clear()


def test_cross_workspace_move_rejected(client):
    """Moving a node into another workspace's tree must 400."""
    from marrow.dependencies import get_db

    db = next(get_db())
    try:
        org_a, ws_a, space_a, user = _api_seed(db)
        # Second workspace under a different org; user is editor there too so
        # the failure is the move validation, not a permission denial.
        org_b = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Other Org")
        db.add(org_b)
        db.flush()
        ws_b = Workspace(org_id=org_b.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="Other WS")
        db.add(ws_b)
        db.flush()
        space_b = Space(workspace_id=ws_b.id, slug="main", name="Main")
        db.add(space_b)
        db.flush()
        db.add(OrgMembership(org_id=org_b.id, user_id=user.id, email=user.email, role=OrgRole.EDITOR.value))
        db.flush()

        moving = _page(db, space_a, f"moving-{uuid.uuid4().hex[:6]}")
        target_parent = _folder(db, space_b, f"target-{uuid.uuid4().hex[:6]}")
        db.commit()

        _auth(client, user)
        res = client.patch(
            f"/api/nodes/{moving.id}",
            json={"parent_id": str(target_parent.id)},
        )
        assert res.status_code == 400
        assert "workspace" in res.json().get("detail", "").lower()
    finally:
        db.rollback()
        client.cookies.clear()
