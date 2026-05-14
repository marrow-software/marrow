"""Tests for backlinks: parser, save reconciliation, endpoint, and RBAC."""

import json
import os
import uuid

import pytest
from fastapi.testclient import TestClient

from marrow.auth import COOKIE_NAME, create_session_jwt, reset_oidc_config
from marrow.links import extract_link_targets, reconcile_node_links
from marrow.models import (
    Node,
    NodeLink,
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


def _make_page(session, space, name: str, content: str = "") -> Node:
    node = Node(
        space_id=space.id,
        type="page",
        name=name,
        slug=name.lower().replace(" ", "-"),
        position="a0",
    )
    session.add(node)
    session.flush()
    rev = Revision(node_id=node.id, content=content, content_format="markdown")
    session.add(rev)
    session.flush()
    node.current_revision_id = rev.id
    session.flush()
    return node


# ---------------------------------------------------------------------------
# Parser (pure-function tests)
# ---------------------------------------------------------------------------


class TestExtract:
    def test_markdown_link_with_workspace_url(self):
        target = uuid.uuid4()
        content = f"see [the page](/w/abc/pages/{target}) for details"
        assert extract_link_targets(content, "markdown") == {target}

    def test_markdown_link_with_node_url(self):
        target = uuid.uuid4()
        content = f"[foo](/nodes/{target})"
        assert extract_link_targets(content, "markdown") == {target}

    def test_multiple_links(self):
        a, b = uuid.uuid4(), uuid.uuid4()
        content = f"[a](/pages/{a}) and [b](/pages/{b}) and [a again](/pages/{a})"
        assert extract_link_targets(content, "markdown") == {a, b}

    def test_at_mention_uuid(self):
        target = uuid.uuid4()
        content = f"hello @{target} world"
        assert target in extract_link_targets(content, "markdown")

    def test_no_links(self):
        assert extract_link_targets("just plain text", "markdown") == set()

    def test_external_link_ignored(self):
        assert extract_link_targets("[ext](https://example.com)", "markdown") == set()

    def test_empty_content(self):
        assert extract_link_targets("", "markdown") == set()
        assert extract_link_targets(None, "markdown") == set()

    def test_blocknote_json_link(self):
        target = uuid.uuid4()
        blocks = [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "see "},
                    {
                        "type": "link",
                        "href": f"/w/ws/pages/{target}",
                        "content": [{"type": "text", "text": "page"}],
                    },
                ],
            }
        ]
        assert extract_link_targets(json.dumps(blocks), "json") == {target}

    def test_blocknote_json_node_mention(self):
        target = uuid.uuid4()
        blocks = [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "mention",
                        "props": {"nodeId": str(target), "displayName": "X"},
                    }
                ],
            }
        ]
        assert extract_link_targets(json.dumps(blocks), "json") == {target}

    def test_blocknote_user_mention_ignored(self):
        blocks = [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "mention",
                        "props": {"userId": str(uuid.uuid4()), "displayName": "U"},
                    }
                ],
            }
        ]
        assert extract_link_targets(json.dumps(blocks), "json") == set()

    def test_blocknote_nested_children(self):
        target = uuid.uuid4()
        blocks = [
            {
                "type": "bulletListItem",
                "content": [],
                "children": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "link",
                                "href": f"/pages/{target}",
                                "content": [{"type": "text", "text": "x"}],
                            }
                        ],
                    }
                ],
            }
        ]
        assert extract_link_targets(json.dumps(blocks), "json") == {target}


# ---------------------------------------------------------------------------
# reconcile_node_links — DB-level
# ---------------------------------------------------------------------------


class TestReconcile:
    def test_reconcile_adds_links(self):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            _, _, space = _make_workspace(db)
            src = _make_page(db, space, "src")
            tgt = _make_page(db, space, "tgt")
            db.commit()

            reconcile_node_links(
                db,
                src.id,
                f"[t](/w/x/pages/{tgt.id})",
                "markdown",
            )
            db.commit()

            links = db.query(NodeLink).filter_by(source_node_id=src.id).all()
            assert len(links) == 1
            assert links[0].target_node_id == tgt.id
        finally:
            db.rollback()

    def test_reconcile_removes_stale_links(self):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            _, _, space = _make_workspace(db)
            src = _make_page(db, space, "src")
            t1 = _make_page(db, space, "t1")
            t2 = _make_page(db, space, "t2")
            db.commit()

            reconcile_node_links(db, src.id, f"[a](/pages/{t1.id}) [b](/pages/{t2.id})", "markdown")
            db.commit()
            assert db.query(NodeLink).filter_by(source_node_id=src.id).count() == 2

            # Re-save with only t1; t2 should be removed.
            reconcile_node_links(db, src.id, f"[a](/pages/{t1.id})", "markdown")
            db.commit()
            remaining = db.query(NodeLink).filter_by(source_node_id=src.id).all()
            assert len(remaining) == 1
            assert remaining[0].target_node_id == t1.id
        finally:
            db.rollback()

    def test_reconcile_skips_missing_target(self):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            _, _, space = _make_workspace(db)
            src = _make_page(db, space, "src")
            bogus = uuid.uuid4()
            db.commit()

            reconcile_node_links(db, src.id, f"[x](/pages/{bogus})", "markdown")
            db.commit()
            assert db.query(NodeLink).filter_by(source_node_id=src.id).count() == 0
        finally:
            db.rollback()

    def test_reconcile_skips_self_link(self):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            _, _, space = _make_workspace(db)
            src = _make_page(db, space, "src")
            db.commit()

            reconcile_node_links(db, src.id, f"[me](/pages/{src.id})", "markdown")
            db.commit()
            assert db.query(NodeLink).filter_by(source_node_id=src.id).count() == 0
        finally:
            db.rollback()


# ---------------------------------------------------------------------------
# Endpoint + RBAC
# ---------------------------------------------------------------------------


class TestBacklinksEndpoint:
    def test_returns_backlinks(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "v-bl@test.com")
            org, _, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)

            tgt = _make_page(db, space, "target")
            src_a = _make_page(db, space, "src-a")
            src_b = _make_page(db, space, "src-b")
            db.commit()

            reconcile_node_links(db, src_a.id, f"[t](/pages/{tgt.id})", "markdown")
            reconcile_node_links(db, src_b.id, f"[t](/pages/{tgt.id})", "markdown")
            db.commit()

            _auth_cookie(client, user)
            res = client.get(f"/api/nodes/{tgt.id}/backlinks")
            assert res.status_code == 200, res.text
            ids = {n["id"] for n in res.json()}
            assert ids == {str(src_a.id), str(src_b.id)}
        finally:
            db.rollback()
            client.cookies.clear()

    def test_trashed_source_excluded(self, client):
        from datetime import datetime, timezone

        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "v-bl-trash@test.com")
            org, _, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.VIEWER)

            tgt = _make_page(db, space, "target")
            src = _make_page(db, space, "src")
            db.commit()

            reconcile_node_links(db, src.id, f"[t](/pages/{tgt.id})", "markdown")
            db.commit()

            src.deleted_at = datetime.now(timezone.utc)
            db.commit()

            _auth_cookie(client, user)
            res = client.get(f"/api/nodes/{tgt.id}/backlinks")
            assert res.status_code == 200
            assert res.json() == []
        finally:
            db.rollback()
            client.cookies.clear()

    def test_rbac_non_member_403(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            outsider = _make_user(db, "outside-bl@test.com")
            _, _, space = _make_workspace(db)
            tgt = _make_page(db, space, "target")
            db.commit()

            _auth_cookie(client, outsider)
            res = client.get(f"/api/nodes/{tgt.id}/backlinks")
            assert res.status_code == 403
        finally:
            db.rollback()
            client.cookies.clear()


class TestSavePathReconciles:
    def test_create_page_with_link_creates_node_link(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "edit-save-bl@test.com")
            org, _, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            tgt = _make_page(db, space, "target")
            db.commit()

            _auth_cookie(client, user)
            res = client.post(
                f"/api/spaces/{space.id}/nodes",
                json={
                    "type": "page",
                    "name": "Src",
                    "content": f"see [t](/pages/{tgt.id})",
                },
            )
            assert res.status_code == 201, res.text
            src_id = uuid.UUID(res.json()["id"])

            db.expire_all()
            links = db.query(NodeLink).filter_by(source_node_id=src_id).all()
            assert len(links) == 1
            assert links[0].target_node_id == tgt.id
        finally:
            db.rollback()
            client.cookies.clear()

    def test_patch_updates_links(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "edit-patch-bl@test.com")
            org, _, space = _make_workspace(db)
            _add_membership(db, org, user, OrgRole.EDITOR)
            t1 = _make_page(db, space, "t1")
            t2 = _make_page(db, space, "t2")
            src = _make_page(db, space, "src", content=f"[a](/pages/{t1.id})")
            db.commit()

            reconcile_node_links(db, src.id, f"[a](/pages/{t1.id})", "markdown")
            db.commit()
            assert db.query(NodeLink).filter_by(source_node_id=src.id).count() == 1

            _auth_cookie(client, user)
            res = client.patch(
                f"/api/nodes/{src.id}",
                json={"content": f"[b](/pages/{t2.id})", "content_format": "markdown"},
            )
            assert res.status_code == 200, res.text

            db.expire_all()
            links = db.query(NodeLink).filter_by(source_node_id=src.id).all()
            assert len(links) == 1
            assert links[0].target_node_id == t2.id
        finally:
            db.rollback()
            client.cookies.clear()
