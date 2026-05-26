"""Integration tests for the restore command.

Runs against a live PostgreSQL database. Each test uses hand-crafted bundles
with unique UUIDs and rolls back its transaction so the DB stays clean.
"""

import hashlib
import json
import os
import uuid
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from marrow.export import SCHEMA_VERSION
from marrow.models import Attachment, Node, Revision, Workspace
from marrow.restore import restore_workspace
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
            raise FileNotFoundError(f"No fake file for {key}")
        return self._files[key]

    def write(self, attachment_id: str, filename: str, data: bytes) -> None:
        self._files[(attachment_id, filename)] = data

    def has(self, attachment_id: str, filename: str) -> bool:
        return (attachment_id, filename) in self._files


# ---------------------------------------------------------------------------
# Bundle builder helpers
# ---------------------------------------------------------------------------


def _make_bundle(
    *,
    ws_id: uuid.UUID | None = None,
    ws_slug: str = "test-ws",
    ws_name: str = "Test Workspace",
    org_id: uuid.UUID | None = None,
    with_attachment: bool = False,
    attachment_data: bytes = b"attachment bytes",
    corrupt_attachment: bool = False,
    schema_version: str = SCHEMA_VERSION,
    omit_manifest: bool = False,
    omit_revision_file: bool = False,
) -> tuple[bytes, dict]:
    """Build a v4 bundle (nodes-based) and return (bytes, manifest dict)."""
    now = datetime.now(timezone.utc).isoformat()

    ws_id = ws_id or uuid.uuid4()
    org_id = org_id or uuid.uuid4()
    space_id = uuid.uuid4()
    folder_id = uuid.uuid4()
    page_id = uuid.uuid4()
    rev_id = uuid.uuid4()
    att_id = uuid.uuid4()

    att_hash = hashlib.sha256(attachment_data).hexdigest()

    manifest: dict = {
        "schema_version": schema_version,
        "export_timestamp": now,
        "organization": {
            "id": str(org_id),
            "slug": f"{ws_slug}-org",
            "name": f"{ws_name} Org",
            "created_at": now,
        },
        "workspace": {
            "id": str(ws_id),
            "org_id": str(org_id),
            "slug": ws_slug,
            "name": ws_name,
            "created_at": now,
        },
        "spaces": [
            {
                "id": str(space_id),
                "workspace_id": str(ws_id),
                "slug": "sp",
                "name": "Space",
                "created_at": now,
            }
        ],
        "nodes": [
            {
                "id": str(folder_id),
                "space_id": str(space_id),
                "parent_id": None,
                "type": "folder",
                "name": "Folder",
                "slug": "folder",
                "position": "000000",
                "description": None,
                "current_revision_id": None,
                "created_at": now,
            },
            {
                "id": str(page_id),
                "space_id": str(space_id),
                "parent_id": str(folder_id),
                "type": "page",
                "name": "Page",
                "slug": "pg",
                "position": "000000",
                "description": None,
                "current_revision_id": str(rev_id),
                "created_at": now,
            },
        ],
        "revisions": [
            {"id": str(rev_id), "node_id": str(page_id), "content_format": "markdown", "created_at": now}
        ],
        "attachments": (
            [
                {
                    "id": str(att_id),
                    "node_id": str(page_id),
                    "filename": "file.txt",
                    "hash": att_hash,
                    "size_bytes": len(attachment_data),
                    "created_at": now,
                }
            ]
            if with_attachment
            else []
        ),
    }

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        if not omit_manifest:
            zf.writestr("manifest.json", json.dumps(manifest))
        if not omit_revision_file:
            zf.writestr(f"revisions/{page_id}/{rev_id}.md", "# Page\nContent.")
        zf.writestr(f"pages/{page_id}.md", "# Page\nContent.")
        zf.writestr(
            "links.json",
            json.dumps(
                {"internal_links": [], "broken_links": [], "orphaned_nodes": [str(page_id)]}
            ),
        )
        if with_attachment:
            asset_bytes = b"corrupted" if corrupt_attachment else attachment_data
            zf.writestr(f"assets/{att_id}.txt", asset_bytes)

    return buf.getvalue(), manifest


def _make_v3_bundle(
    *,
    ws_id: uuid.UUID | None = None,
    ws_slug: str = "v3-ws",
    ws_name: str = "V3 Workspace",
    org_id: uuid.UUID | None = None,
    with_attachment: bool = False,
    attachment_data: bytes = b"attachment bytes",
    corrupt_attachment: bool = False,
    omit_revision_file: bool = False,
) -> tuple[bytes, dict]:
    """Build a v3 bundle (collections + pages) for testing the migration path."""
    now = datetime.now(timezone.utc).isoformat()

    ws_id = ws_id or uuid.uuid4()
    org_id = org_id or uuid.uuid4()
    space_id = uuid.uuid4()
    col_id = uuid.uuid4()
    page_id = uuid.uuid4()
    rev_id = uuid.uuid4()
    att_id = uuid.uuid4()

    att_hash = hashlib.sha256(attachment_data).hexdigest()

    manifest: dict = {
        "schema_version": "3",
        "export_timestamp": now,
        "organization": {
            "id": str(org_id),
            "slug": f"{ws_slug}-org",
            "name": f"{ws_name} Org",
            "created_at": now,
        },
        "workspace": {
            "id": str(ws_id),
            "org_id": str(org_id),
            "slug": ws_slug,
            "name": ws_name,
            "created_at": now,
        },
        "spaces": [
            {
                "id": str(space_id),
                "workspace_id": str(ws_id),
                "slug": "sp",
                "name": "Space",
                "created_at": now,
            }
        ],
        "collections": [
            {
                "id": str(col_id),
                "space_id": str(space_id),
                "slug": "col",
                "name": "Col",
                "created_at": now,
            }
        ],
        "pages": [
            {
                "id": str(page_id),
                "collection_id": str(col_id),
                "slug": "pg",
                "title": "Page",
                "current_revision_id": str(rev_id),
                "created_at": now,
            }
        ],
        "revisions": [
            {
                "id": str(rev_id),
                "page_id": str(page_id),
                "content_format": "markdown",
                "created_at": now,
            }
        ],
        "attachments": (
            [
                {
                    "id": str(att_id),
                    "page_id": str(page_id),
                    "filename": "file.txt",
                    "hash": att_hash,
                    "size_bytes": len(attachment_data),
                    "created_at": now,
                }
            ]
            if with_attachment
            else []
        ),
    }

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        if not omit_revision_file:
            zf.writestr(f"revisions/{page_id}/{rev_id}.md", "# Page\nContent.")
        zf.writestr(f"pages/{page_id}.md", "# Page\nContent.")
        zf.writestr(
            "links.json",
            json.dumps(
                {"internal_links": [], "broken_links": [], "orphaned_pages": [str(page_id)]}
            ),
        )
        if with_attachment:
            asset_bytes = b"corrupted" if corrupt_attachment else attachment_data
            zf.writestr(f"assets/{att_id}.txt", asset_bytes)

    return buf.getvalue(), manifest


# ---------------------------------------------------------------------------
# Fixtures
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


@pytest.fixture
def storage():
    return FakeStorageAdapter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_bundle(tmp_path: Path, bundle_bytes: bytes, name: str = "bundle.zip") -> Path:
    p = tmp_path / name
    p.write_bytes(bundle_bytes)
    return p


# ---------------------------------------------------------------------------
# v4 bundle tests
# ---------------------------------------------------------------------------


def test_restore_creates_workspace(session, storage, tmp_path):
    bundle_bytes, manifest = _make_bundle(ws_slug="restore-creates-ws")
    path = _write_bundle(tmp_path, bundle_bytes)

    slug = restore_workspace(path, session, storage)

    assert slug == "restore-creates-ws"
    ws = session.query(Workspace).filter_by(slug="restore-creates-ws").first()
    assert ws is not None
    assert str(ws.id) == manifest["workspace"]["id"]


def test_restore_accepts_legacy_freehold_prefixed_bundle(session, storage, tmp_path):
    # Restore is manifest-driven, not filename-driven — legacy bundles produced
    # before the freehold → marrow rename must still restore cleanly.
    bundle_bytes, manifest = _make_bundle(ws_slug="legacy-prefix-ws")
    path = _write_bundle(
        tmp_path, bundle_bytes, name="freehold-export-legacy-prefix-ws-20251231T000000Z.zip"
    )

    slug = restore_workspace(path, session, storage)

    assert slug == "legacy-prefix-ws"
    ws = session.query(Workspace).filter_by(slug="legacy-prefix-ws").first()
    assert ws is not None
    assert str(ws.id) == manifest["workspace"]["id"]


def test_restore_preserves_full_hierarchy(session, storage, tmp_path):
    bundle_bytes, manifest = _make_bundle(ws_slug="restore-hierarchy-ws")
    path = _write_bundle(tmp_path, bundle_bytes)

    restore_workspace(path, session, storage)

    ws = session.query(Workspace).filter_by(slug="restore-hierarchy-ws").first()
    assert len(ws.spaces) == 1
    space = ws.spaces[0]
    assert str(space.id) == manifest["spaces"][0]["id"]

    # v4: nodes instead of collections/pages
    folder_nodes = [n for n in space.nodes if n.type == "folder"]
    page_nodes = [n for n in space.nodes if n.type == "page"]
    assert len(folder_nodes) == 1
    assert len(page_nodes) == 1

    folder_rec = next(n for n in manifest["nodes"] if n["type"] == "folder")
    page_rec = next(n for n in manifest["nodes"] if n["type"] == "page")
    assert str(folder_nodes[0].id) == folder_rec["id"]
    assert str(page_nodes[0].id) == page_rec["id"]

    assert len(page_nodes[0].revisions) == 1
    assert str(page_nodes[0].current_revision_id) == manifest["revisions"][0]["id"]


def test_restore_preserves_page_content(session, storage, tmp_path):
    bundle_bytes, manifest = _make_bundle(ws_slug="restore-content-ws")
    path = _write_bundle(tmp_path, bundle_bytes)

    restore_workspace(path, session, storage)

    page_rec = next(n for n in manifest["nodes"] if n["type"] == "page")
    rev_rec = manifest["revisions"][0]
    page_node = session.get(Node, uuid.UUID(page_rec["id"]))
    rev = session.get(Revision, uuid.UUID(rev_rec["id"]))
    assert rev is not None
    assert rev.content == "# Page\nContent."
    assert str(page_node.current_revision_id) == rev_rec["id"]


def test_restore_with_attachment(session, storage, tmp_path):
    att_data = b"hello attachment"
    bundle_bytes, manifest = _make_bundle(
        ws_slug="restore-att-ws", with_attachment=True, attachment_data=att_data
    )
    path = _write_bundle(tmp_path, bundle_bytes)

    restore_workspace(path, session, storage)

    att_meta = manifest["attachments"][0]
    att = session.get(Attachment, uuid.UUID(att_meta["id"]))
    assert att is not None
    assert att.hash == att_meta["hash"]
    assert att.size_bytes == len(att_data)
    assert storage.has(att_meta["id"], "file.txt")
    assert storage._files[(att_meta["id"], "file.txt")] == att_data


def test_restore_verifies_attachment_hash(session, storage, tmp_path):
    bundle_bytes, _ = _make_bundle(
        ws_slug="restore-hash-ws", with_attachment=True, corrupt_attachment=True
    )
    path = _write_bundle(tmp_path, bundle_bytes)

    with pytest.raises(RuntimeError, match="Hash mismatch"):
        restore_workspace(path, session, storage)


def test_restore_duplicate_id_raises(session, storage, tmp_path):
    ws_id = uuid.uuid4()
    bundle_bytes, _ = _make_bundle(ws_id=ws_id, ws_slug="restore-dup-id-ws")
    path = _write_bundle(tmp_path, bundle_bytes)

    restore_workspace(path, session, storage)

    # Second restore with same ID.
    bundle_bytes2, _ = _make_bundle(ws_id=ws_id, ws_slug="restore-dup-id-ws-2")
    path2 = _write_bundle(tmp_path, bundle_bytes2, name="bundle2.zip")
    with pytest.raises(ValueError, match="already exists"):
        restore_workspace(path2, session, storage)


def test_restore_duplicate_slug_raises(session, storage, tmp_path):
    bundle_bytes, _ = _make_bundle(ws_slug="restore-dup-slug-ws")
    path = _write_bundle(tmp_path, bundle_bytes)

    restore_workspace(path, session, storage)

    # Second restore with same slug but different ID.
    bundle_bytes2, _ = _make_bundle(ws_slug="restore-dup-slug-ws")
    path2 = _write_bundle(tmp_path, bundle_bytes2, name="bundle2.zip")
    with pytest.raises(ValueError, match="already exists"):
        restore_workspace(path2, session, storage)


def test_restore_missing_manifest_raises(session, storage, tmp_path):
    bundle_bytes, _ = _make_bundle(ws_slug="restore-no-manifest-ws", omit_manifest=True)
    path = _write_bundle(tmp_path, bundle_bytes)

    with pytest.raises(ValueError, match="manifest.json missing"):
        restore_workspace(path, session, storage)


def test_restore_unsupported_schema_version_raises(session, storage, tmp_path):
    bundle_bytes, _ = _make_bundle(ws_slug="restore-bad-version-ws", schema_version="99")
    path = _write_bundle(tmp_path, bundle_bytes)

    with pytest.raises(ValueError, match="Unsupported bundle schema version"):
        restore_workspace(path, session, storage)


def test_restore_missing_revision_file_raises(session, storage, tmp_path):
    bundle_bytes, _ = _make_bundle(ws_slug="restore-missing-rev-ws", omit_revision_file=True)
    path = _write_bundle(tmp_path, bundle_bytes)

    with pytest.raises(ValueError, match="missing revision file"):
        restore_workspace(path, session, storage)


def test_restore_not_a_zip_raises(session, storage, tmp_path):
    path = tmp_path / "notazip.zip"
    path.write_bytes(b"this is not a zip")

    with pytest.raises(ValueError, match="Not a valid zip"):
        restore_workspace(path, session, storage)


# ---------------------------------------------------------------------------
# v3 bundle migration tests
# ---------------------------------------------------------------------------


def test_restore_v3_bundle_creates_workspace(session, storage, tmp_path):
    bundle_bytes, manifest = _make_v3_bundle(ws_slug="v3-creates-ws")
    path = _write_bundle(tmp_path, bundle_bytes, name="v3-creates.zip")

    slug = restore_workspace(path, session, storage)

    assert slug == "v3-creates-ws"
    ws = session.query(Workspace).filter_by(slug="v3-creates-ws").first()
    assert ws is not None
    assert str(ws.id) == manifest["workspace"]["id"]


def test_restore_v3_bundle_synthesizes_nodes(session, storage, tmp_path):
    """v3 collections → folder nodes; v3 pages → page nodes."""
    bundle_bytes, manifest = _make_v3_bundle(ws_slug="v3-nodes-ws")
    path = _write_bundle(tmp_path, bundle_bytes, name="v3-nodes.zip")

    restore_workspace(path, session, storage)

    ws = session.query(Workspace).filter_by(slug="v3-nodes-ws").first()
    space = ws.spaces[0]

    folder_nodes = [n for n in space.nodes if n.type == "folder"]
    page_nodes_list = [n for n in space.nodes if n.type == "page"]
    assert len(folder_nodes) == 1
    assert len(page_nodes_list) == 1

    col_rec = manifest["collections"][0]
    page_rec = manifest["pages"][0]

    # Collection UUID is preserved as the folder node UUID
    assert str(folder_nodes[0].id) == col_rec["id"]
    assert folder_nodes[0].slug == col_rec["slug"]
    assert folder_nodes[0].parent_id is None

    # Page UUID is preserved as the page node UUID
    assert str(page_nodes_list[0].id) == page_rec["id"]
    assert page_nodes_list[0].slug == page_rec["slug"]
    # Page is parented to the folder (was collection)
    assert str(page_nodes_list[0].parent_id) == col_rec["id"]

    # Revision content preserved
    assert len(page_nodes_list[0].revisions) == 1
    assert page_nodes_list[0].revisions[0].content == "# Page\nContent."
    assert str(page_nodes_list[0].current_revision_id) == manifest["revisions"][0]["id"]


def test_restore_v3_bundle_with_attachment(session, storage, tmp_path):
    att_data = b"v3 attachment bytes"
    bundle_bytes, manifest = _make_v3_bundle(
        ws_slug="v3-att-ws", with_attachment=True, attachment_data=att_data
    )
    path = _write_bundle(tmp_path, bundle_bytes, name="v3-att.zip")

    restore_workspace(path, session, storage)

    att_meta = manifest["attachments"][0]
    att = session.get(Attachment, uuid.UUID(att_meta["id"]))
    assert att is not None
    assert att.hash == att_meta["hash"]
    assert att.size_bytes == len(att_data)
    assert storage.has(att_meta["id"], "file.txt")


def test_restore_v3_bundle_hash_mismatch_raises(session, storage, tmp_path):
    bundle_bytes, _ = _make_v3_bundle(
        ws_slug="v3-hash-ws", with_attachment=True, corrupt_attachment=True
    )
    path = _write_bundle(tmp_path, bundle_bytes, name="v3-hash.zip")

    with pytest.raises(RuntimeError, match="Hash mismatch"):
        restore_workspace(path, session, storage)


def test_restore_v3_missing_revision_file_raises(session, storage, tmp_path):
    bundle_bytes, _ = _make_v3_bundle(ws_slug="v3-missing-rev-ws", omit_revision_file=True)
    path = _write_bundle(tmp_path, bundle_bytes, name="v3-missing-rev.zip")

    with pytest.raises(ValueError, match="missing revision file"):
        restore_workspace(path, session, storage)


# ---------------------------------------------------------------------------
# Slim bundle tests (v4)
# ---------------------------------------------------------------------------


def test_slim_bundle_is_restorable(session, tmp_path):
    """A slim bundle restores cleanly — one revision per page from pages/ content."""
    now = datetime.now(timezone.utc).isoformat()
    ws_id = uuid.uuid4()
    org_id = uuid.uuid4()
    space_id = uuid.uuid4()
    folder_id = uuid.uuid4()
    page_id = uuid.uuid4()

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "slim": True,
        "export_timestamp": now,
        "organization": {
            "id": str(org_id),
            "slug": "slim-restore-org",
            "name": "Slim Restore Org",
            "created_at": now,
        },
        "workspace": {
            "id": str(ws_id),
            "org_id": str(org_id),
            "slug": "slim-restore-ws",
            "name": "Slim Restore WS",
            "created_at": now,
        },
        "spaces": [
            {
                "id": str(space_id),
                "workspace_id": str(ws_id),
                "slug": "sp",
                "name": "Space",
                "created_at": now,
            }
        ],
        "nodes": [
            {
                "id": str(folder_id),
                "space_id": str(space_id),
                "parent_id": None,
                "type": "folder",
                "name": "Folder",
                "slug": "folder",
                "position": "000000",
                "description": None,
                "current_revision_id": None,
                "created_at": now,
            },
            {
                "id": str(page_id),
                "space_id": str(space_id),
                "parent_id": str(folder_id),
                "type": "page",
                "name": "Page",
                "slug": "pg",
                "position": "000000",
                "description": None,
                "current_revision_id": None,
                "created_at": now,
            },
        ],
        "revisions": [],
        "attachments": [],
    }

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        zf.writestr(f"pages/{page_id}.md", "# Page\nCurrent content.")
        zf.writestr(
            "links.json",
            json.dumps({"internal_links": [], "broken_links": [], "orphaned_nodes": []}),
        )

    bundle_path = tmp_path / "slim-bundle.zip"
    bundle_path.write_bytes(buf.getvalue())

    storage = FakeStorageAdapter()
    slug = restore_workspace(bundle_path, session, storage)
    assert slug == "slim-restore-ws"

    restored_ws = session.query(Workspace).filter_by(slug="slim-restore-ws").one()
    page_nodes = [n for s in restored_ws.spaces for n in s.nodes if n.type == "page"]
    assert len(page_nodes) == 1
    p = page_nodes[0]
    assert p.current_revision is not None
    assert p.current_revision.content == "# Page\nCurrent content."
    assert len(p.revisions) == 1
