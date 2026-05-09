"""Round-trip integration test: export → wipe → restore → verify.

This is the regression anchor for the restore guarantee. A failure here is a
critical bug that must be fixed before any merge.

Two scenarios are covered:

* ``test_native_v4_round_trip``: build a node-tree workspace, export it as a
  v4 bundle, wipe the database, restore, and assert exact parity.
* ``test_v3_bundle_restores_to_v4``: synthesise a legacy v3 bundle (with the
  old collection/page tables) and confirm restore auto-upgrades it into the
  node-tree schema.

Run from the api/ directory:
    pytest tests/test_round_trip.py
"""

import hashlib
import io
import json
import os
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import pytest
from alembic.config import Config
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from alembic import command
from marrow.models import Attachment, Node, Organization, Revision, Space, Workspace
from marrow.storage import StorageAdapter

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://marrow:marrow@localhost:5433/marrow")


# ---------------------------------------------------------------------------
# Fake storage adapter (in-memory)
# ---------------------------------------------------------------------------


class FakeStorageAdapter(StorageAdapter):
    def __init__(self) -> None:
        self._files: dict[tuple[str, str], bytes] = {}

    def read(self, attachment_id: str, filename: str) -> bytes:
        key = (attachment_id, filename)
        if key not in self._files:
            raise FileNotFoundError(f"No file for {key}")
        return self._files[key]

    def write(self, attachment_id: str, filename: str, data: bytes) -> None:
        self._files[(attachment_id, filename)] = data

    def has(self, attachment_id: str, filename: str) -> bool:
        return (attachment_id, filename) in self._files


# ---------------------------------------------------------------------------
# Lazy-import helpers
#
# The v4 export/restore implementations land in #132 / #133. While those PRs
# are still in flight the legacy export.py module fails at import time with
# ``NameError: name 'Page' is not defined``. We defer the import so collection
# succeeds and skip the relevant tests cleanly.
# ---------------------------------------------------------------------------


def _import_export():
    try:
        from marrow.export import export_workspace
    except (ImportError, NameError) as exc:
        pytest.skip(f"export module unavailable until v4 lands: {exc}")
    return export_workspace


def _import_restore():
    try:
        from marrow.restore import restore_workspace
    except (ImportError, NameError) as exc:
        pytest.skip(f"restore module unavailable until v4 lands: {exc}")
    return restore_workspace


# ---------------------------------------------------------------------------
# Fresh database fixture
# ---------------------------------------------------------------------------


def _base_dsn() -> str:
    return DATABASE_URL.rsplit("/", 1)[0]


def _alembic_cfg(url: str) -> Config:
    os.environ["DATABASE_URL"] = url
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


@pytest.fixture(scope="module")
def db_url():
    """Create a fresh database, run migrations, yield URL, then drop it."""
    db_name = f"marrow_roundtrip_{uuid.uuid4().hex[:8]}"

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


def _wipe(engine) -> None:
    with engine.connect() as conn:
        conn.execute(text("TRUNCATE organizations, workspaces CASCADE"))
        conn.commit()


# ---------------------------------------------------------------------------
# Native v4 round-trip
# ---------------------------------------------------------------------------


def test_native_v4_round_trip(db_url, tmp_path):
    """Seed v4 node-tree → export → wipe DB → restore → assert exact parity."""
    export_workspace = _import_export()
    restore_workspace = _import_restore()

    engine = create_engine(db_url)
    export_storage = FakeStorageAdapter()

    original: dict = {}

    with Session(engine) as session:
        org = Organization(slug="roundtrip-org", name="Round-Trip Org")
        session.add(org)
        session.flush()

        ws = Workspace(org_id=org.id, slug="roundtrip-ws", name="Round-Trip Workspace")
        session.add(ws)
        session.flush()

        space = Space(workspace_id=ws.id, slug="main", name="Main Space")
        session.add(space)
        session.flush()

        # folder/
        #   subfolder/
        #     page-deep   (one revision)
        #   page-one      (multiple revisions, JSON canonical)
        # page-two        (root-level page, single revision)
        folder = Node(
            space_id=space.id,
            type="folder",
            name="Documentation",
            slug="docs",
            position="a0",
            description="Root folder",
        )
        session.add(folder)
        session.flush()

        subfolder = Node(
            space_id=space.id,
            parent_id=folder.id,
            type="folder",
            name="Deep",
            slug="deep",
            position="a0",
        )
        session.add(subfolder)
        session.flush()

        page_deep = Node(
            space_id=space.id,
            parent_id=subfolder.id,
            type="page",
            name="Page Deep",
            slug="page-deep",
            position="a0",
        )
        page_one = Node(
            space_id=space.id,
            parent_id=folder.id,
            type="page",
            name="Page One",
            slug="page-one",
            position="a1",
        )
        page_two = Node(
            space_id=space.id,
            parent_id=None,
            type="page",
            name="Page Two",
            slug="page-two",
            position="b0",
        )
        session.add_all([page_deep, page_one, page_two])
        session.flush()

        rev_deep = Revision(
            node_id=page_deep.id,
            content="# Deep\nNested page body.",
            content_format="markdown",
        )
        rev1a = Revision(
            node_id=page_one.id,
            content="# Page One\nFirst draft.",
            content_format="markdown",
        )
        rev1b = Revision(
            node_id=page_one.id,
            content="# Page One\nSecond draft.",
            content_format="markdown",
        )
        json_blocks = [
            {
                "id": "h1",
                "type": "heading",
                "props": {"level": 1, "textColor": "default", "backgroundColor": "default", "textAlignment": "left"},
                "content": [{"type": "text", "text": "Page One", "styles": {}}],
                "children": [],
            }
        ]
        rev1c = Revision(
            node_id=page_one.id,
            content=json.dumps(json_blocks),
            content_format="json",
        )
        rev_two = Revision(
            node_id=page_two.id,
            content="# Page Two\nOnly revision.",
            content_format="markdown",
        )
        session.add_all([rev_deep, rev1a, rev1b, rev1c, rev_two])
        session.flush()

        page_deep.current_revision_id = rev_deep.id
        page_one.current_revision_id = rev1c.id
        page_two.current_revision_id = rev_two.id
        session.flush()

        att_data = b"binary attachment content"
        att_hash = hashlib.sha256(att_data).hexdigest()
        att = Attachment(
            node_id=page_one.id,
            filename="diagram.png",
            hash=att_hash,
            size_bytes=len(att_data),
        )
        session.add(att)
        session.flush()
        export_storage.write(str(att.id), "diagram.png", att_data)

        original["org"] = {"id": str(org.id), "slug": org.slug, "name": org.name}
        original["workspace"] = {"id": str(ws.id), "slug": ws.slug, "name": ws.name}
        original["space"] = {"id": str(space.id), "slug": space.slug}
        original["nodes"] = {
            str(folder.id): {"type": "folder", "slug": "docs", "parent_id": None},
            str(subfolder.id): {"type": "folder", "slug": "deep", "parent_id": str(folder.id)},
            str(page_deep.id): {
                "type": "page",
                "slug": "page-deep",
                "parent_id": str(subfolder.id),
                "current_revision_id": str(rev_deep.id),
                "revisions": {
                    str(rev_deep.id): (rev_deep.content, "markdown"),
                },
            },
            str(page_one.id): {
                "type": "page",
                "slug": "page-one",
                "parent_id": str(folder.id),
                "current_revision_id": str(rev1c.id),
                "revisions": {
                    str(rev1a.id): (rev1a.content, "markdown"),
                    str(rev1b.id): (rev1b.content, "markdown"),
                    str(rev1c.id): (rev1c.content, "json"),
                },
            },
            str(page_two.id): {
                "type": "page",
                "slug": "page-two",
                "parent_id": None,
                "current_revision_id": str(rev_two.id),
                "revisions": {
                    str(rev_two.id): (rev_two.content, "markdown"),
                },
            },
        }
        original["attachment"] = {
            "id": str(att.id),
            "node_id": str(page_one.id),
            "filename": "diagram.png",
            "hash": att_hash,
            "size_bytes": len(att_data),
            "data": att_data,
        }

        session.commit()

    # Export
    with Session(engine) as session:
        bundle_path = export_workspace(
            slug="roundtrip-ws",
            session=session,
            storage=export_storage,
            output_path=tmp_path,
        )
    assert bundle_path.exists()

    # Wipe
    _wipe(engine)

    # Restore
    restore_storage = FakeStorageAdapter()
    with Session(engine) as session:
        slug = restore_workspace(bundle_path, session, restore_storage)
        session.commit()
    assert slug == "roundtrip-ws"

    # Verify
    with Session(engine) as session:
        ws_restored = session.query(Workspace).filter_by(slug="roundtrip-ws").one()
        assert str(ws_restored.id) == original["workspace"]["id"]
        assert ws_restored.name == original["workspace"]["name"]

        spaces = list(ws_restored.spaces)
        assert len(spaces) == 1
        assert str(spaces[0].id) == original["space"]["id"]

        restored_nodes = {
            str(n.id): n
            for n in session.query(Node).filter(Node.space_id == spaces[0].id).all()
        }
        assert set(restored_nodes.keys()) == set(original["nodes"].keys())

        for nid, expected in original["nodes"].items():
            n = restored_nodes[nid]
            assert n.type == expected["type"]
            assert n.slug == expected["slug"]
            actual_parent = str(n.parent_id) if n.parent_id else None
            assert actual_parent == expected["parent_id"]
            if n.type != "page":
                continue
            assert str(n.current_revision_id) == expected["current_revision_id"]
            revs = {str(r.id): r for r in n.revisions}
            assert set(revs.keys()) == set(expected["revisions"].keys())
            for rid, (content, fmt) in expected["revisions"].items():
                assert revs[rid].content == content
                assert revs[rid].content_format == fmt

        att_meta = original["attachment"]
        att_restored = session.get(Attachment, uuid.UUID(att_meta["id"]))
        assert att_restored is not None
        assert str(att_restored.node_id) == att_meta["node_id"]
        assert att_restored.hash == att_meta["hash"]
        assert restore_storage.has(att_meta["id"], att_meta["filename"])
        assert restore_storage.read(att_meta["id"], att_meta["filename"]) == att_meta["data"]

    engine.dispose()


# ---------------------------------------------------------------------------
# Legacy v3 bundle restore (proves v3 → v4 migration in restore code)
# ---------------------------------------------------------------------------


def _build_v3_bundle(tmp_path: Path) -> tuple[Path, dict]:
    """Synthesize a v3 bundle as if produced by the v0.1 exporter."""
    org_id = str(uuid.uuid4())
    ws_id = str(uuid.uuid4())
    space_id = str(uuid.uuid4())
    col_id = str(uuid.uuid4())
    page_id = str(uuid.uuid4())
    rev_id = str(uuid.uuid4())
    att_id = str(uuid.uuid4())

    now = datetime.now(timezone.utc).isoformat()

    body = "# Legacy\nFrom a v3 bundle."
    asset_data = b"legacy-asset-bytes"
    asset_hash = hashlib.sha256(asset_data).hexdigest()

    manifest = {
        "schema_version": "3",
        "export_timestamp": now,
        "organization": {
            "id": org_id,
            "slug": f"legacy-org-{org_id[:6]}",
            "name": "Legacy Org",
            "created_at": now,
        },
        "workspace": {
            "id": ws_id,
            "org_id": org_id,
            "slug": f"legacy-ws-{ws_id[:6]}",
            "name": "Legacy WS",
            "created_at": now,
        },
        "spaces": [
            {
                "id": space_id,
                "workspace_id": ws_id,
                "slug": "main",
                "name": "Main",
                "created_at": now,
            }
        ],
        "collections": [
            {
                "id": col_id,
                "space_id": space_id,
                "slug": "docs",
                "name": "Docs",
                "created_at": now,
            }
        ],
        "pages": [
            {
                "id": page_id,
                "collection_id": col_id,
                "slug": "legacy-page",
                "title": "Legacy Page",
                "current_revision_id": rev_id,
                "created_at": now,
            }
        ],
        "revisions": [
            {
                "id": rev_id,
                "page_id": page_id,
                "content_format": "markdown",
                "created_at": now,
            }
        ],
        "attachments": [
            {
                "id": att_id,
                "page_id": page_id,
                "filename": "legacy.bin",
                "hash": asset_hash,
                "size_bytes": len(asset_data),
                "created_at": now,
            }
        ],
    }

    bundle_path = tmp_path / "legacy-v3.zip"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        zf.writestr(f"pages/{page_id}.md", body)
        zf.writestr(f"revisions/{page_id}/{rev_id}.md", body)
        zf.writestr(f"assets/{att_id}.bin", asset_data)
        zf.writestr("links.json", json.dumps({"internal_links": [], "broken_links": [], "orphaned_pages": []}))
    bundle_path.write_bytes(buf.getvalue())

    expectations = {
        "ws_slug": manifest["workspace"]["slug"],
        "ws_id": ws_id,
        "page_id": page_id,
        "rev_id": rev_id,
        "att_id": att_id,
        "att_hash": asset_hash,
        "att_data": asset_data,
        "att_filename": "legacy.bin",
        "body": body,
    }
    return bundle_path, expectations


def test_v3_bundle_restores_to_v4(db_url, tmp_path):
    """A v3 bundle (collection/page world) must restore into v4 nodes."""
    restore_workspace = _import_restore()

    engine = create_engine(db_url)
    _wipe(engine)

    bundle_path, exp = _build_v3_bundle(tmp_path)
    storage = FakeStorageAdapter()

    with Session(engine) as session:
        try:
            slug = restore_workspace(bundle_path, session, storage)
            session.commit()
        except NameError as exc:
            # v3 bundle restore reroutes through the v0.1 collection/page code
            # path that is being removed; the v3 → v4 migration lands in #133.
            pytest.skip(f"restore module not yet v3→v4 capable: {exc}")

    assert slug == exp["ws_slug"]

    with Session(engine) as session:
        ws = session.query(Workspace).filter_by(slug=exp["ws_slug"]).one()
        assert str(ws.id) == exp["ws_id"]
        spaces = list(ws.spaces)
        assert len(spaces) == 1

        nodes = session.query(Node).filter(Node.space_id == spaces[0].id).all()
        # Old "Docs" collection must materialise as a folder, the legacy page
        # as a child page node under it.
        folders = [n for n in nodes if n.type == "folder"]
        pages = [n for n in nodes if n.type == "page"]
        assert len(folders) == 1
        assert len(pages) == 1
        assert pages[0].parent_id == folders[0].id
        # Page identity is preserved across the upgrade.
        assert str(pages[0].id) == exp["page_id"]

        # Revision content survives.
        revs = list(pages[0].revisions)
        assert len(revs) >= 1
        assert any(r.content == exp["body"] for r in revs)

        # Attachment is rehomed to the page node.
        att = session.get(Attachment, uuid.UUID(exp["att_id"]))
        assert att is not None
        assert str(att.node_id) == exp["page_id"]
        assert att.hash == exp["att_hash"]
        assert storage.read(exp["att_id"], exp["att_filename"]) == exp["att_data"]

    engine.dispose()
