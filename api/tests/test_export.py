"""Integration tests for the export command.

Runs against a live PostgreSQL database (same Docker Compose default as other tests).
Each test rolls back its transaction so the DB stays clean between runs.
"""

import hashlib
import json
import os
import zipfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from marrow.export import SCHEMA_VERSION, estimate_export_sizes, export_workspace
from marrow.models import Attachment, Node, Organization, Revision, Space, Workspace
from marrow.storage import StorageAdapter

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://marrow:marrow@localhost:5433/marrow")


# ---------------------------------------------------------------------------
# Fake storage adapter (in-memory; no filesystem required)
# ---------------------------------------------------------------------------


class FakeStorageAdapter(StorageAdapter):
    def __init__(self, files: dict[tuple[str, str], bytes] | None = None) -> None:
        # keys are (attachment_id, filename)
        self._files: dict[tuple[str, str], bytes] = files or {}

    def read(self, attachment_id: str, filename: str) -> bytes:
        key = (attachment_id, filename)
        if key not in self._files:
            raise FileNotFoundError(f"No fake file for {key}")
        return self._files[key]

    def write(self, attachment_id: str, filename: str, data: bytes) -> None:
        self._files[(attachment_id, filename)] = data


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
def seeded(session):
    """Seed a workspace with two page nodes (two revisions each) and one attachment."""
    org = Organization(slug="export-test-org", name="Export Test Org")
    session.add(org)
    session.flush()

    ws = Workspace(org_id=org.id, slug="export-test-ws", name="Export Test Workspace")
    session.add(ws)
    session.flush()

    space = Space(workspace_id=ws.id, slug="sp", name="Space")
    session.add(space)
    session.flush()

    # Node 1 — page with two revisions and one internal link to node2 (added later).
    node1 = Node(space_id=space.id, parent_id=None, type="page", name="Page One", slug="page-one", position="a0")
    session.add(node1)
    session.flush()

    rev1a = Revision(node_id=node1.id, content="# Page One\nFirst draft.")
    session.add(rev1a)
    session.flush()

    rev1b = Revision(node_id=node1.id, content="# Page One\nSecond draft.")
    session.add(rev1b)
    session.flush()

    node1.current_revision_id = rev1b.id
    session.flush()

    # Node 2 — page (target of internal link from node1).
    node2 = Node(space_id=space.id, parent_id=None, type="page", name="Page Two", slug="page-two", position="a1")
    session.add(node2)
    session.flush()

    rev2 = Revision(node_id=node2.id, content="# Page Two\nOnly revision.")
    session.add(rev2)
    session.flush()

    node2.current_revision_id = rev2.id
    session.flush()

    # Update node1 current revision to include a link to node2.
    link_content = f"# Page One\n[See page two](/nodes/{node2.id})"
    rev1c = Revision(node_id=node1.id, content=link_content)
    session.add(rev1c)
    session.flush()

    node1.current_revision_id = rev1c.id
    session.flush()

    # Attachment on node1.
    att_data = b"fake image bytes"
    att_hash = hashlib.sha256(att_data).hexdigest()
    att = Attachment(
        node_id=node1.id,
        filename="photo.png",
        hash=att_hash,
        size_bytes=len(att_data),
    )
    session.add(att)
    session.flush()

    storage = FakeStorageAdapter({(str(att.id), "photo.png"): att_data})

    return {
        "workspace": ws,
        "nodes": [node1, node2],
        "attachment": att,
        "attachment_data": att_data,
        "storage": storage,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_export_produces_zip(seeded, session, tmp_path):
    result = export_workspace(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
        output_path=tmp_path,
    )

    assert result.exists()
    assert result.suffix == ".zip"
    assert "export-test-ws" in result.name


def test_zip_contains_expected_members(seeded, session, tmp_path):
    result = export_workspace(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
        output_path=tmp_path,
    )

    with zipfile.ZipFile(result) as zf:
        names = set(zf.namelist())

    node1_id = str(seeded["nodes"][0].id)
    node2_id = str(seeded["nodes"][1].id)
    att_id = str(seeded["attachment"].id)

    assert "manifest.json" in names
    assert "links.json" in names
    assert f"nodes/{node1_id}.md" in names
    assert f"nodes/{node2_id}.md" in names
    assert f"assets/{att_id}.png" in names


def test_manifest_content(seeded, session, tmp_path):
    ws = seeded["workspace"]
    result = export_workspace(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
        output_path=tmp_path,
    )

    with zipfile.ZipFile(result) as zf:
        manifest = json.loads(zf.read("manifest.json"))

    assert manifest["schema_version"] == SCHEMA_VERSION
    assert manifest["schema_version"] == "4"
    assert manifest["workspace"]["slug"] == ws.slug
    assert manifest["workspace"]["id"] == str(ws.id)

    assert "collections" not in manifest
    assert "pages" not in manifest
    assert len(manifest["spaces"]) == 1
    assert len(manifest["nodes"]) == 2
    assert len(manifest["revisions"]) == 4  # rev1a, rev1b, rev1c, rev2
    assert len(manifest["attachments"]) == 1

    att_record = manifest["attachments"][0]
    assert att_record["hash"] == seeded["attachment"].hash
    assert att_record["filename"] == "photo.png"
    assert "node_id" in att_record
    assert "created_at" in att_record


def test_node_content_matches_current_revision(seeded, session, tmp_path):
    node1 = seeded["nodes"][0]
    result = export_workspace(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
        output_path=tmp_path,
    )

    with zipfile.ZipFile(result) as zf:
        content = zf.read(f"nodes/{node1.id}.md").decode()

    assert f"/nodes/{seeded['nodes'][1].id}" in content


def test_all_revisions_are_included(seeded, session, tmp_path):
    node1 = seeded["nodes"][0]
    result = export_workspace(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
        output_path=tmp_path,
    )

    with zipfile.ZipFile(result) as zf:
        rev_files = [n for n in zf.namelist() if n.startswith(f"revisions/{node1.id}/")]

    # node1 has three revisions (rev1a, rev1b, rev1c)
    assert len(rev_files) == 3


def test_links_json(seeded, session, tmp_path):
    node1_id = str(seeded["nodes"][0].id)
    node2_id = str(seeded["nodes"][1].id)

    result = export_workspace(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
        output_path=tmp_path,
    )

    with zipfile.ZipFile(result) as zf:
        links = json.loads(zf.read("links.json"))

    internal = links["internal_links"]
    assert len(internal) == 1
    assert internal[0]["source_node_id"] == node1_id
    assert internal[0]["target_node_id"] == node2_id

    # node2 is linked to, so only node1 is orphaned (nothing links to it)
    assert node2_id not in links["orphaned_nodes"]
    assert node1_id in links["orphaned_nodes"]


def test_attachment_hash_mismatch_raises(seeded, session, tmp_path):
    att = seeded["attachment"]
    bad_storage = FakeStorageAdapter({(str(att.id), "photo.png"): b"corrupted bytes"})

    with pytest.raises(RuntimeError, match="Hash mismatch"):
        export_workspace(
            slug="export-test-ws",
            session=session,
            storage=bad_storage,
            output_path=tmp_path,
        )


def test_missing_workspace_raises(session, tmp_path):
    from marrow.storage import LocalFilesystemAdapter

    storage = LocalFilesystemAdapter("/tmp")
    with pytest.raises(ValueError, match="not found"):
        export_workspace(
            slug="no-such-workspace",
            session=session,
            storage=storage,
            output_path=tmp_path,
        )


def test_output_filename_default(seeded, session, tmp_path):
    result = export_workspace(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
        output_path=tmp_path,
    )
    assert result.name.startswith("marrow-export-export-test-ws-")
    assert result.name.endswith(".zip")


def test_folder_node_has_no_content_file(session, tmp_path):
    """Folder nodes appear in the manifest but get no nodes/{id}.md file."""
    org = Organization(slug="folder-export-org", name="Folder Export Org")
    session.add(org)
    session.flush()

    ws = Workspace(org_id=org.id, slug="folder-export-ws", name="Folder Export WS")
    session.add(ws)
    session.flush()

    space = Space(workspace_id=ws.id, slug="sp", name="Space")
    session.add(space)
    session.flush()

    folder = Node(
        space_id=space.id, parent_id=None, type="folder", name="My Folder",
        slug="my-folder", position="a0", description="A folder"
    )
    session.add(folder)
    session.flush()

    storage = FakeStorageAdapter()
    result = export_workspace(
        slug="folder-export-ws",
        session=session,
        storage=storage,
        output_path=tmp_path,
    )

    with zipfile.ZipFile(result) as zf:
        names = set(zf.namelist())
        manifest = json.loads(zf.read("manifest.json"))

    # Folder appears in manifest nodes list
    assert len(manifest["nodes"]) == 1
    assert manifest["nodes"][0]["type"] == "folder"
    assert manifest["nodes"][0]["description"] == "A folder"

    # No content file for folder
    assert f"nodes/{folder.id}.md" not in names
    assert f"nodes/{folder.id}.json" not in names


def test_include_trash_includes_deleted_nodes(session, tmp_path):
    """Soft-deleted nodes are excluded by default but included with include_trash=True."""
    from datetime import datetime, timezone

    org = Organization(slug="trash-export-org", name="Trash Export Org")
    session.add(org)
    session.flush()

    ws = Workspace(org_id=org.id, slug="trash-export-ws", name="Trash Export WS")
    session.add(ws)
    session.flush()

    space = Space(workspace_id=ws.id, slug="sp", name="Space")
    session.add(space)
    session.flush()

    live_node = Node(
        space_id=space.id, parent_id=None, type="page", name="Live", slug="live", position="a0"
    )
    session.add(live_node)
    session.flush()

    rev = Revision(node_id=live_node.id, content="Live content.")
    session.add(rev)
    session.flush()
    live_node.current_revision_id = rev.id
    session.flush()

    trashed_node = Node(
        space_id=space.id, parent_id=None, type="page", name="Trashed", slug="trashed",
        position="a1", deleted_at=datetime.now(timezone.utc)
    )
    session.add(trashed_node)
    session.flush()

    storage = FakeStorageAdapter()

    # Default export excludes trash
    result = export_workspace(
        slug="trash-export-ws",
        session=session,
        storage=storage,
        output_path=tmp_path,
    )
    with zipfile.ZipFile(result) as zf:
        manifest = json.loads(zf.read("manifest.json"))
    node_ids = {n["id"] for n in manifest["nodes"]}
    assert str(live_node.id) in node_ids
    assert str(trashed_node.id) not in node_ids

    # include_trash includes soft-deleted nodes
    result2 = export_workspace(
        slug="trash-export-ws",
        session=session,
        storage=storage,
        output_path=tmp_path,
        include_trash=True,
    )
    with zipfile.ZipFile(result2) as zf:
        manifest2 = json.loads(zf.read("manifest.json"))
    node_ids2 = {n["id"] for n in manifest2["nodes"]}
    assert str(live_node.id) in node_ids2
    assert str(trashed_node.id) in node_ids2


# ---------------------------------------------------------------------------
# Slim export tests
# ---------------------------------------------------------------------------


def test_slim_export_omits_revisions(seeded, session, tmp_path):
    result = export_workspace(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
        output_path=tmp_path,
        slim=True,
    )

    with zipfile.ZipFile(result) as zf:
        names = zf.namelist()

    assert not any(n.startswith("revisions/") for n in names)
    assert any(n.startswith("nodes/") for n in names)
    assert "manifest.json" in names


def test_slim_export_filename_contains_slim(seeded, session, tmp_path):
    result = export_workspace(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
        output_path=tmp_path,
        slim=True,
    )
    assert "-slim-" in result.name


def test_slim_manifest_has_slim_flag_and_empty_revisions(seeded, session, tmp_path):
    result = export_workspace(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
        output_path=tmp_path,
        slim=True,
    )

    with zipfile.ZipFile(result) as zf:
        manifest = json.loads(zf.read("manifest.json"))

    assert manifest.get("slim") is True
    assert manifest["revisions"] == []


def test_slim_bundle_is_restorable(session, tmp_path):
    """A slim v4 bundle restores cleanly — one revision per page from nodes/ content."""
    import io as _io
    import uuid as _uuid
    from datetime import datetime, timezone

    from marrow.restore import restore_workspace

    now = datetime.now(timezone.utc).isoformat()
    ws_id = _uuid.uuid4()
    org_id = _uuid.uuid4()
    space_id = _uuid.uuid4()
    node_id = _uuid.uuid4()

    manifest = {
        "schema_version": "4",
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
                "id": str(node_id),
                "space_id": str(space_id),
                "parent_id": None,
                "type": "page",
                "name": "Page",
                "slug": "pg",
                "position": "a0",
                "current_revision_id": None,
                "created_at": now,
            }
        ],
        "revisions": [],
        "attachments": [],
    }

    buf = _io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        zf.writestr(f"nodes/{node_id}.md", "# Page\nCurrent content.")
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
    all_nodes = [n for s in restored_ws.spaces for n in s.nodes if n.type == "page"]
    assert len(all_nodes) == 1
    n = all_nodes[0]
    assert n.current_revision is not None
    assert n.current_revision.content == "# Page\nCurrent content."
    assert len(n.revisions) == 1


def test_estimate_export_sizes(seeded, session):
    sizes = estimate_export_sizes(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
    )

    assert "full_bytes" in sizes
    assert "slim_bytes" in sizes
    assert sizes["full_bytes"] >= sizes["slim_bytes"]
    assert sizes["slim_bytes"] >= 0
