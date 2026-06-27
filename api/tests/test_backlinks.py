"""Unit + integration tests for the backlinks index (issue #100)."""

import json
import os
import uuid

import pytest
from fastapi.testclient import TestClient

from marrow.auth import COOKIE_NAME, create_session_jwt, reset_oidc_config
from marrow.links import (
    extract_link_targets,
    rebuild_node_links,
    reconcile_node_links,
    serialize_node_links,
)
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


# ---------------------------------------------------------------------------
# Unit tests — content parsing
# ---------------------------------------------------------------------------


class TestExtractLinkTargets:
    def test_markdown_wiki_link_with_workspace_prefix(self):
        tid = uuid.uuid4()
        content = f"See [the other page](/w/abc123/pages/{tid}) for details."
        assert extract_link_targets(content, "markdown") == {tid}

    def test_markdown_export_relative_href(self):
        tid = uuid.uuid4()
        content = f"[link](/pages/{tid})"
        assert extract_link_targets(content, "markdown") == {tid}

    def test_markdown_nodes_href(self):
        tid = uuid.uuid4()
        content = f"[link](/nodes/{tid})"
        assert extract_link_targets(content, "markdown") == {tid}

    def test_markdown_external_links_ignored(self):
        content = "[ext](https://example.com) and [anchor](#section)"
        assert extract_link_targets(content, "markdown") == set()

    def test_markdown_multiple_and_deduped(self):
        a, b = uuid.uuid4(), uuid.uuid4()
        content = f"[1](/pages/{a}) [2](/pages/{b}) [again](/pages/{a})"
        assert extract_link_targets(content, "markdown") == {a, b}

    def test_json_link_inline_content(self):
        tid = uuid.uuid4()
        blocks = [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "go "},
                    {
                        "type": "link",
                        "href": f"/w/ws/pages/{tid}",
                        "content": [{"type": "text", "text": "here"}],
                    },
                ],
            }
        ]
        assert extract_link_targets(json.dumps(blocks), "json") == {tid}

    def test_json_nested_children(self):
        tid = uuid.uuid4()
        blocks = [
            {
                "type": "bulletListItem",
                "content": [],
                "children": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "link", "href": f"/pages/{tid}"}],
                    }
                ],
            }
        ]
        assert extract_link_targets(json.dumps(blocks), "json") == {tid}

    def test_json_user_mention_ignored(self):
        blocks = [
            {
                "type": "paragraph",
                "content": [{"type": "mention", "props": {"userId": str(uuid.uuid4())}}],
            }
        ]
        assert extract_link_targets(json.dumps(blocks), "json") == set()

    def test_malformed_json_returns_empty(self):
        assert extract_link_targets("{not json", "json") == set()

    def test_empty_content(self):
        assert extract_link_targets(None, "markdown") == set()
        assert extract_link_targets("", "json") == set()


# ---------------------------------------------------------------------------
# Integration helpers (mirror test_nodes.py)
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


def _add_membership(session, org, user, role: OrgRole) -> None:
    session.add(OrgMembership(org_id=org.id, user_id=user.id, email=user.email, role=role.value))
    session.flush()


def _auth_cookie(client, user):
    client.cookies.set(COOKIE_NAME, create_session_jwt(user.id, user.email, user.name))


# ---------------------------------------------------------------------------
# reconcile_node_links — save-path behaviour
# ---------------------------------------------------------------------------


class TestReconcile:
    def test_add_and_remove_stale(self):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            _, _, space = _make_workspace(db)
            a = _make_page(db, space, "Target A")
            b = _make_page(db, space, "Target B")
            src = _make_page(db, space, "Source")
            db.commit()

            reconcile_node_links(db, src.id, f"[a](/pages/{a.id}) [b](/pages/{b.id})", "markdown")
            db.commit()
            targets = {
                row.target_node_id for row in db.query(NodeLink).filter_by(source_node_id=src.id)
            }
            assert targets == {a.id, b.id}

            # Re-save with only A — B link must be removed.
            reconcile_node_links(db, src.id, f"[a](/pages/{a.id})", "markdown")
            db.commit()
            targets = {
                row.target_node_id for row in db.query(NodeLink).filter_by(source_node_id=src.id)
            }
            assert targets == {a.id}
        finally:
            db.rollback()
            db.close()

    def test_self_link_and_missing_target_dropped(self):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            _, _, space = _make_workspace(db)
            src = _make_page(db, space, "Source")
            db.commit()

            ghost = uuid.uuid4()
            reconcile_node_links(
                db, src.id, f"[self](/pages/{src.id}) [ghost](/pages/{ghost})", "markdown"
            )
            db.commit()
            assert db.query(NodeLink).filter_by(source_node_id=src.id).count() == 0
        finally:
            db.rollback()
            db.close()


# ---------------------------------------------------------------------------
# Endpoint + RBAC
# ---------------------------------------------------------------------------


class TestBacklinksEndpoint:
    def test_save_then_backlinks_listed(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "editor-bl@test.com")
            org, _, space = _make_workspace(db)
            target = _make_page(db, space, "Target")
            _add_membership(db, org, user, OrgRole.EDITOR)
            db.commit()
            target_id = str(target.id)

            _auth_cookie(client, user)
            resp = client.post(
                f"/api/spaces/{space.id}/nodes",
                json={
                    "type": "page",
                    "name": "Linker",
                    "content": f"see [target](/pages/{target_id})",
                    "content_format": "markdown",
                },
            )
            assert resp.status_code == 201, resp.text
            linker_id = resp.json()["id"]

            resp = client.get(f"/api/nodes/{target_id}/backlinks")
            assert resp.status_code == 200, resp.text
            assert [n["id"] for n in resp.json()] == [linker_id]
        finally:
            db.rollback()
            db.close()
            client.cookies.clear()

    def test_trashed_source_excluded(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            user = _make_user(db, "owner-bl@test.com")
            org, _, space = _make_workspace(db)
            target = _make_page(db, space, "Target")
            linker = _make_page(db, space, "Linker", content=f"[t](/pages/{target.id})")
            _add_membership(db, org, user, OrgRole.OWNER)
            db.commit()
            reconcile_node_links(db, linker.id, f"[t](/pages/{target.id})", "markdown")
            db.commit()
            target_id, linker_id = str(target.id), str(linker.id)

            _auth_cookie(client, user)
            resp = client.get(f"/api/nodes/{target_id}/backlinks")
            assert [n["id"] for n in resp.json()] == [linker_id]

            # Trash the linker — it must drop out of backlinks.
            r = client.delete(f"/api/nodes/{linker_id}")
            assert r.status_code == 204
            resp = client.get(f"/api/nodes/{target_id}/backlinks")
            assert resp.json() == []
        finally:
            db.rollback()
            db.close()
            client.cookies.clear()

    def test_requires_viewer_role(self, client):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            outsider = _make_user(db, "outsider-bl@test.com")
            _, _, space = _make_workspace(db)
            target = _make_page(db, space, "Target")
            db.commit()
            target_id = str(target.id)

            _auth_cookie(client, outsider)
            resp = client.get(f"/api/nodes/{target_id}/backlinks")
            assert resp.status_code == 403
        finally:
            db.rollback()
            db.close()
            client.cookies.clear()


# ---------------------------------------------------------------------------
# Export/restore round-trip of the index
# ---------------------------------------------------------------------------


class TestSerializeRebuild:
    def test_serialize_then_rebuild(self):
        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            _, _, space = _make_workspace(db)
            a = _make_page(db, space, "A")
            b = _make_page(db, space, "B")
            db.add(NodeLink(source_node_id=a.id, target_node_id=b.id))
            db.commit()

            dumped = serialize_node_links(db, {a.id, b.id})
            assert dumped == [{"source_node_id": str(a.id), "target_node_id": str(b.id)}]

            db.query(NodeLink).delete()
            db.commit()
            rebuild_node_links(db, dumped)
            db.commit()

            row = db.query(NodeLink).one()
            assert (row.source_node_id, row.target_node_id) == (a.id, b.id)
        finally:
            db.rollback()
            db.close()

    def test_rebuild_keeps_trashed_endpoints_when_include_trash(self):
        from datetime import datetime, timezone

        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            _, _, space = _make_workspace(db)
            live = _make_page(db, space, "Live")
            trashed = _make_page(db, space, "Trashed")
            trashed.deleted_at = datetime.now(timezone.utc)
            db.flush()
            link = {"source_node_id": str(live.id), "target_node_id": str(trashed.id)}
            db.commit()

            rebuild_node_links(db, [link], include_trash=True)
            db.commit()

            rows = (
                db.query(NodeLink)
                .filter_by(source_node_id=live.id, target_node_id=trashed.id)
                .all()
            )
            assert len(rows) == 1
        finally:
            db.rollback()
            db.close()

    def test_rebuild_skips_trashed_endpoints_by_default(self):
        from datetime import datetime, timezone

        from marrow.dependencies import get_db

        db = next(get_db())
        try:
            _, _, space = _make_workspace(db)
            live = _make_page(db, space, "Live")
            trashed = _make_page(db, space, "Trashed")
            trashed.deleted_at = datetime.now(timezone.utc)
            db.flush()
            link = {"source_node_id": str(live.id), "target_node_id": str(trashed.id)}
            db.commit()

            rebuild_node_links(db, [link])
            db.commit()

            assert (
                db.query(NodeLink)
                .filter_by(source_node_id=live.id, target_node_id=trashed.id)
                .count()
                == 0
            )
        finally:
            db.rollback()
            db.close()


# ---------------------------------------------------------------------------
# Export / restore round-trip of links involving trashed nodes
# ---------------------------------------------------------------------------


class TestExportRestoreLinks:
    def test_include_trash_restores_links_to_trashed_nodes(self, tmp_path):
        import zipfile
        from datetime import datetime, timezone

        from sqlalchemy import create_engine, text
        from sqlalchemy.orm import Session

        from marrow.export import export_workspace
        from marrow.restore import restore_workspace
        from marrow.storage import StorageAdapter

        class MemStorage(StorageAdapter):
            def read(self, attachment_id: str, filename: str) -> bytes:
                raise FileNotFoundError(attachment_id)

            def write(self, attachment_id: str, filename: str, data: bytes) -> None:
                pass

        engine = create_engine(DATABASE_URL)
        org_id = None
        with Session(engine) as session:
            org = Organization(slug=f"bl-org-{uuid.uuid4().hex[:6]}", name="BL Org")
            session.add(org)
            session.flush()
            ws = Workspace(org_id=org.id, slug=f"bl-ws-{uuid.uuid4().hex[:6]}", name="BL WS")
            session.add(ws)
            session.flush()
            space = Space(workspace_id=ws.id, slug="main", name="Main")
            session.add(space)
            session.flush()

            live = _make_page(session, space, "Live")
            trashed = _make_page(session, space, "Trashed")
            session.flush()
            reconcile_node_links(
                session, live.id, f"[trashed](/pages/{trashed.id})", "markdown"
            )
            trashed.deleted_at = datetime.now(timezone.utc)
            session.commit()
            org_id = org.id
            ws_slug = ws.slug
            live_id, trashed_id = live.id, trashed.id

            bundle = export_workspace(
                ws_slug, session, MemStorage(), output_path=tmp_path, include_trash=True
            )

        with zipfile.ZipFile(bundle) as zf:
            links = json.loads(zf.read("links.json"))
            manifest = json.loads(zf.read("manifest.json"))
        assert manifest.get("include_trash") is True
        assert links["internal_links"] == [
            {"source_node_id": str(live_id), "target_node_id": str(trashed_id)}
        ]

        with Session(engine) as session:
            session.execute(text("DELETE FROM organizations WHERE id = :id"), {"id": org_id})
            session.commit()

        with Session(engine) as session:
            restore_workspace(bundle, session, MemStorage())
            session.commit()

        with Session(engine) as session:
            rows = (
                session.query(NodeLink)
                .filter_by(source_node_id=live_id, target_node_id=trashed_id)
                .all()
            )
            assert len(rows) == 1

            session.execute(text("DELETE FROM organizations WHERE id = :id"), {"id": org_id})
            session.commit()

        engine.dispose()
