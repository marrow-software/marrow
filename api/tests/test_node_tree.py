"""Node-tree integrity tests: soft-delete cascade, reparenting, slug rules."""

import os
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from marrow.auth import COOKIE_NAME, create_session_jwt, reset_oidc_config
from marrow.models import (
    Node,
    Organization,
    OrgMembership,
    Space,
    User,
    Workspace,
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://marrow:marrow@localhost:5433/marrow")


# ---------------------------------------------------------------------------
# Shared fixtures and helpers
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def engine():
    eng = create_engine(DATABASE_URL)
    yield eng
    eng.dispose()


@pytest.fixture
def session(engine):
    with Session(engine) as s:
        yield s
        s.rollback()


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


def _make_workspace(session: Session) -> tuple[Organization, Workspace, Space]:
    org = Organization(slug=f"org-{uuid.uuid4().hex[:6]}", name="Tree Org")
    session.add(org)
    session.flush()
    ws = Workspace(org_id=org.id, slug=f"ws-{uuid.uuid4().hex[:6]}", name="Tree WS")
    session.add(ws)
    session.flush()
    space = Space(workspace_id=ws.id, slug=f"sp-{uuid.uuid4().hex[:6]}", name="Tree Space")
    session.add(space)
    session.flush()
    return org, ws, space


def _make_user(session: Session, email: str) -> User:
    user = User(
        oidc_issuer="https://test.example.com",
        oidc_subject=uuid.uuid4().hex,
        email=email,
        name="Test User",
    )
    session.add(user)
    session.flush()
    return user


def _make_folder(session: Session, space: Space, slug: str, parent: Node | None = None) -> Node:
    n = Node(
        space_id=space.id,
        parent_id=parent.id if parent else None,
        type="folder",
        name=slug,
        slug=slug,
        position="a0",
    )
    session.add(n)
    session.flush()
    return n


def _auth_cookie(client, user):
    token = create_session_jwt(user.id, user.email, user.name)
    client.cookies.set(COOKIE_NAME, token)


# ---------------------------------------------------------------------------
# Soft-delete cascade
# ---------------------------------------------------------------------------


def test_soft_delete_cascades_through_endpoint(session, client):
    """DELETE on a folder must soft-delete all descendants recursively."""
    org, ws, space = _make_workspace(session)
    user = _make_user(session, "owner-cascade@test.com")
    session.add(OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role="owner"))

    root = _make_folder(session, space, "root")
    mid = _make_folder(session, space, "mid", parent=root)
    leaf = _make_folder(session, space, "leaf", parent=mid)
    session.commit()

    _auth_cookie(client, user)
    res = client.delete(f"/api/nodes/{root.id}")
    assert res.status_code == 204

    session.expire_all()
    for n in (root, mid, leaf):
        session.refresh(n)
        assert n.deleted_at is not None, f"{n.slug} not soft-deleted"

    client.cookies.clear()


def test_restore_does_not_auto_uncascade(session):
    """Clearing deleted_at on a parent must NOT auto-restore descendants.

    Restoring descendants is the caller's responsibility — the DB has no trigger
    that mirrors soft-delete in reverse.
    """
    org, ws, space = _make_workspace(session)
    root = _make_folder(session, space, "r")
    child = _make_folder(session, space, "c", parent=root)
    now = datetime.now(timezone.utc)
    root.deleted_at = now
    child.deleted_at = now
    session.flush()

    root.deleted_at = None
    session.flush()

    session.refresh(child)
    assert child.deleted_at is not None


def test_hard_delete_cascades_via_fk(session):
    """Physically deleting a parent must cascade to children (ondelete=CASCADE)."""
    org, ws, space = _make_workspace(session)
    parent = _make_folder(session, space, "p")
    child = _make_folder(session, space, "c", parent=parent)
    child_id = child.id
    session.flush()

    # Issue the delete at the SQL level so the DB cascades and the ORM identity
    # map doesn't silently re-hydrate the child row.
    session.execute(text("DELETE FROM nodes WHERE id = :id"), {"id": parent.id})
    session.expire_all()

    remaining = session.execute(
        text("SELECT id FROM nodes WHERE id = :id"), {"id": child_id}
    ).first()
    assert remaining is None


# ---------------------------------------------------------------------------
# Slug uniqueness — siblings and re-creation after soft-delete
# ---------------------------------------------------------------------------


def test_slug_unique_among_active_siblings(session):
    """Two active nodes with the same parent cannot share a slug."""
    org, ws, space = _make_workspace(session)
    parent = _make_folder(session, space, "parent")
    a = _make_folder(session, space, "dupe", parent=parent)  # noqa: F841

    b = Node(
        space_id=space.id,
        parent_id=parent.id,
        type="folder",
        name="dupe",
        slug="dupe",
        position="a1",
    )
    session.add(b)
    with pytest.raises(IntegrityError):
        session.flush()


def test_slug_unique_at_space_root(session):
    """Space-root scope: two root nodes with the same slug must conflict."""
    org, ws, space = _make_workspace(session)
    _make_folder(session, space, "shared")

    dup = Node(
        space_id=space.id,
        parent_id=None,
        type="folder",
        name="shared",
        slug="shared",
        position="a1",
    )
    session.add(dup)
    with pytest.raises(IntegrityError):
        session.flush()


def test_slug_reusable_after_soft_delete(session):
    """Soft-deleting a node frees its slug for a new sibling."""
    org, ws, space = _make_workspace(session)
    parent = _make_folder(session, space, "parent")
    first = _make_folder(session, space, "name", parent=parent)
    first.deleted_at = datetime.now(timezone.utc)
    session.flush()

    second = Node(
        space_id=space.id,
        parent_id=parent.id,
        type="folder",
        name="name",
        slug="name",
        position="a1",
    )
    session.add(second)
    session.flush()  # must succeed


# ---------------------------------------------------------------------------
# Position is not constrained to be unique among siblings
# ---------------------------------------------------------------------------


def test_position_not_unique_among_siblings(session):
    """Position is a fractional index — collisions are allowed; ordering tie-breaks elsewhere."""
    org, ws, space = _make_workspace(session)
    parent = _make_folder(session, space, "parent")

    a = Node(
        space_id=space.id,
        parent_id=parent.id,
        type="folder",
        name="a",
        slug="a",
        position="m0",
    )
    b = Node(
        space_id=space.id,
        parent_id=parent.id,
        type="folder",
        name="b",
        slug="b",
        position="m0",
    )
    session.add_all([a, b])
    session.flush()  # no unique constraint; should succeed


# ---------------------------------------------------------------------------
# Reparenting validation
# ---------------------------------------------------------------------------


def test_reparenting_within_workspace_succeeds(session, client):
    """PATCH parent_id within the same workspace must succeed."""
    org, ws, space = _make_workspace(session)
    user = _make_user(session, "editor-move@test.com")
    session.add(OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role="editor"))

    a = _make_folder(session, space, "a")
    b = _make_folder(session, space, "b")
    session.commit()

    _auth_cookie(client, user)
    res = client.patch(f"/api/nodes/{a.id}", json={"parent_id": str(b.id)})
    assert res.status_code == 200, res.text

    session.expire_all()
    session.refresh(a)
    assert a.parent_id == b.id

    client.cookies.clear()


def test_cross_workspace_move_rejected(session, client):
    """PATCH parent_id to a node in another workspace must return 400."""
    org1, ws1, space1 = _make_workspace(session)
    org2, ws2, space2 = _make_workspace(session)

    user = _make_user(session, "editor-xws@test.com")
    session.add(OrgMembership(org_id=org1.id, user_id=user.id, email=user.email, role="editor"))
    session.add(OrgMembership(org_id=org2.id, user_id=user.id, email=user.email, role="editor"))

    src = _make_folder(session, space1, "src")
    dst = _make_folder(session, space2, "dst")
    session.commit()

    _auth_cookie(client, user)
    res = client.patch(f"/api/nodes/{src.id}", json={"parent_id": str(dst.id)})
    assert res.status_code == 400

    client.cookies.clear()


# ---------------------------------------------------------------------------
# Deleted nodes are hidden from reads
# ---------------------------------------------------------------------------


def test_soft_deleted_node_hidden_from_get(session, client):
    org, ws, space = _make_workspace(session)
    user = _make_user(session, "viewer-hidden@test.com")
    session.add(OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role="viewer"))

    node = _make_folder(session, space, "gone")
    node.deleted_at = datetime.now(timezone.utc)
    session.commit()

    _auth_cookie(client, user)
    res = client.get(f"/api/nodes/{node.id}")
    assert res.status_code == 404

    client.cookies.clear()


def test_soft_deleted_node_hidden_from_list(session, client):
    org, ws, space = _make_workspace(session)
    user = _make_user(session, "viewer-listhidden@test.com")
    session.add(OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role="viewer"))

    _make_folder(session, space, "alive")
    dead = _make_folder(session, space, "dead")
    dead.deleted_at = datetime.now(timezone.utc)
    session.commit()

    _auth_cookie(client, user)
    res = client.get(f"/api/spaces/{space.id}/nodes")
    assert res.status_code == 200
    slugs = {n["slug"] for n in res.json()}
    assert "alive" in slugs
    assert "dead" not in slugs

    client.cookies.clear()


# ---------------------------------------------------------------------------
# Tree shape: folder-vs-page shape constraint
# ---------------------------------------------------------------------------


def test_revision_for_folder_violates_shape(session):
    """Revisions reference page nodes only — a folder can't carry one."""
    from marrow.models import Revision

    org, ws, space = _make_workspace(session)
    folder = _make_folder(session, space, "f")

    rev = Revision(node_id=folder.id, content="bad", content_format="markdown")
    session.add(rev)
    with pytest.raises(IntegrityError):
        session.flush()
