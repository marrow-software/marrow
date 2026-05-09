"""Integration tests for the v4 export command.

Runs against a live PostgreSQL database (same Docker Compose default as other tests).
Each test rolls back its transaction so the DB stays clean between runs.
"""

import hashlib
import json
import os
import zipfile
from datetime import datetime, timezone

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
    """Seed a workspace with two page nodes (multiple revisions), one folder node, and one attachment."""
    org = Organization(slug="export-test-org", name="Export Test Org")
    session.add(org)
    session.flush()

    ws = Workspace(org_id=org.id, slug="export-test-ws", name="Export Test Workspace")
    session.add(ws)
    session.flush()

    space = Space(workspace_id=ws.id, slug="sp", name="Space")
    session.add(space)
    session.flush()

    # Folder node (contributes manifest entry only — no content file)
    folder = Node(
        space_id=space.id,
        parent_id=None,
        type="folder",
        name="Docs Folder",
        slug="docs-folder",
        position="a0",
        description="A folder node",
    )
    session.add(folder)
    session.flush()

    # Page node 1 with three revisions and one internal link to page node 2 (added later).
    page1 = Node(
        space_id=space.id,
        parent_id=None,
        type="page",
        name="Page One",
        slug="page-one",
        position="a1",
    )
    session.add(page1)
    session.flush()

    rev1a = Revision(node_id=page1.id, content="# Page One\nFirst draft.")
    session.add(rev1a)
    session.flush()

    rev1b = Revision(node_id=page1.id, content="# Page One\nSecond draft.")
    session.add(rev1b)
    session.flush()

    page1.current_revision_id = rev1b.id
    session.flush()

    # Page node 2 (target of internal link from page 1).
    page2 = Node(
        space_id=space.id,
        parent_id=None,
        type="page",
        name="Page Two",
        slug="page-two",
        position="a2",
    )
    session.add(page2)
    session.flush()

    rev2 = Revision(node_id=page2.id, content="# Page Two\nOnly revision.")
    session.add(rev2)
    session.flush()

    page2.current_revision_id = rev2.id
    session.flush()

    # Update page1 current revision to include a link to page2.
    link_content = f"# Page One\n[See page two](/nodes/{page2.id})"
    rev1c = Revision(node_id=page1.id, content=link_content)
    session.add(rev1c)
    session.flush()

    page1.current_revision_id = rev1c.id
    session.flush()

    # Attachment on page1.
    att_data = b"fake image bytes"
    att_hash = hashlib.sha256(att_data).hexdigest()
    att = Attachment(
        node_id=page1.id,
        filename="photo.png",
        hash=att_hash,
        size_bytes=len(att_data),
    )
    session.add(att)
    session.flush()

    storage = FakeStorageAdapter({(str(att.id), "photo.png"): att_data})

    return {
        "workspace": ws,
        "folder": folder,
        "pages": [page1, page2],
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

    page1_id = str(seeded["pages"][0].id)
    page2_id = str(seeded["pages"][1].id)
    folder_id = str(seeded["folder"].id)
    att_id = str(seeded["attachment"].id)

    assert "manifest.json" in names
    assert "links.json" in names
    assert f"nodes/{page1_id}.md" in names
    assert f"nodes/{page2_id}.md" in names
    assert f"assets/{att_id}.png" in names
    # Folder nodes have no content file
    assert f"nodes/{folder_id}.md" not in names
    assert f"nodes/{folder_id}.json" not in names


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

    # v4 uses plural top-level keys
    assert "organizations" in manifest
    assert "workspaces" in manifest
    assert "collections" not in manifest
    assert "pages" not in manifest

    assert len(manifest["organizations"]) == 1
    assert manifest["organizations"][0]["slug"] == "export-test-org"

    assert len(manifest["workspaces"]) == 1
    assert manifest["workspaces"][0]["slug"] == ws.slug
    assert manifest["workspaces"][0]["id"] == str(ws.id)

    assert len(manifest["spaces"]) == 1
    # 2 pages + 1 folder
    assert len(manifest["nodes"]) == 3
    # rev1a, rev1b, rev1c, rev2 = 4 revisions (pages only)
    assert len(manifest["revisions"]) == 4
    assert len(manifest["attachments"]) == 1

    att_record = manifest["attachments"][0]
    assert att_record["hash"] == seeded["attachment"].hash
    assert att_record["filename"] == "photo.png"
    assert "node_id" in att_record
    assert "created_at" in att_record


def test_manifest_node_entries(seeded, session, tmp_path):
    result = export_workspace(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
        output_path=tmp_path,
    )

    with zipfile.ZipFile(result) as zf:
        manifest = json.loads(zf.read("manifest.json"))

    folder_id = str(seeded["folder"].id)
    folder_entry = next(n for n in manifest["nodes"] if n["id"] == folder_id)
    assert folder_entry["type"] == "folder"
    assert folder_entry["description"] == "A folder node"

    page1_id = str(seeded["pages"][0].id)
    page1_entry = next(n for n in manifest["nodes"] if n["id"] == page1_id)
    assert page1_entry["type"] == "page"
    assert page1_entry["description"] is None
    assert page1_entry["current_revision_id"] is not None
    assert "position" in page1_entry
    assert "slug" in page1_entry


def test_page_content_matches_current_revision(seeded, session, tmp_path):
    page1 = seeded["pages"][0]
    result = export_workspace(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
        output_path=tmp_path,
    )

    with zipfile.ZipFile(result) as zf:
        content = zf.read(f"nodes/{page1.id}.md").decode()

    assert f"/nodes/{seeded['pages'][1].id}" in content


def test_all_revisions_are_included(seeded, session, tmp_path):
    page1 = seeded["pages"][0]
    result = export_workspace(
        slug="export-test-ws",
        session=session,
        storage=seeded["storage"],
        output_path=tmp_path,
    )

    with zipfile.ZipFile(result) as zf:
        rev_files = [n for n in zf.namelist() if n.startswith(f"revisions/{page1.id}/")]

    # page1 has three revisions (rev1a, rev1b, rev1c)
    assert len(rev_files) == 3


def test_links_json(seeded, session, tmp_path):
    page1_id = str(seeded["pages"][0].id)
    page2_id = str(seeded["pages"][1].id)

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
    assert internal[0]["source_node_id"] == page1_id
    assert internal[0]["target_node_id"] == page2_id

    # page2 is linked to, so only page1 is orphaned (nothing links to it)
    assert page2_id not in links["orphaned_nodes"]
    assert page1_id in links["orphaned_nodes"]


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


# ---------------------------------------------------------------------------
# include_trash tests
# ---------------------------------------------------------------------------


def test_trashed_nodes_excluded_by_default(session, tmp_path):
    """Soft-deleted nodes are omitted from the bundle by default."""
    org = Organization(slug="trash-test-org", name="Trash Test Org")
    session.add(org)
    session.flush()

    ws = Workspace(org_id=org.id, slug="trash-test-ws", name="Trash WS")
    session.add(ws)
    session.flush()

    space = Space(workspace_id=ws.id, slug="sp", name="Space")
    session.add(space)
    session.flush()

    active = Node(space_id=space.id, type="page", name="Active", slug="active", position="a0")
    session.add(active)
    session.flush()

    rev_a = Revision(node_id=active.id, content="Active content.")
    session.add(rev_a)
    session.flush()
    active.current_revision_id = rev_a.id
    session.flush()

    trashed = Node(
        space_id=space.id,
        type="page",
        name="Trashed",
        slug="trashed",
        position="a1",
        deleted_at=datetime.now(timezone.utc),
    )
    session.add(trashed)
    session.flush()

    rev_t = Revision(node_id=trashed.id, content="Trashed content.")
    session.add(rev_t)
    session.flush()
    trashed.current_revision_id = rev_t.id
    session.flush()

    storage = FakeStorageAdapter()
    result = export_workspace(
        slug="trash-test-ws",
        session=session,
        storage=storage,
        output_path=tmp_path,
    )

    with zipfile.ZipFile(result) as zf:
        names = set(zf.namelist())
        manifest = json.loads(zf.read("manifest.json"))

    assert f"nodes/{active.id}.md" in names
    assert f"nodes/{trashed.id}.md" not in names
    assert len(manifest["nodes"]) == 1
    assert manifest["nodes"][0]["id"] == str(active.id)


def test_include_trash_adds_deleted_nodes(session, tmp_path):
    """Soft-deleted nodes appear in the bundle when include_trash=True."""
    org = Organization(slug="trash-include-org", name="Trash Include Org")
    session.add(org)
    session.flush()

    ws = Workspace(org_id=org.id, slug="trash-include-ws", name="Trash Include WS")
    session.add(ws)
    session.flush()

    space = Space(workspace_id=ws.id, slug="sp", name="Space")
    session.add(space)
    session.flush()

    trashed = Node(
        space_id=space.id,
        type="page",
        name="Trashed",
        slug="trashed",
        position="a0",
        deleted_at=datetime.now(timezone.utc),
    )
    session.add(trashed)
    session.flush()

    rev = Revision(node_id=trashed.id, content="Trashed content.")
    session.add(rev)
    session.flush()
    trashed.current_revision_id = rev.id
    session.flush()

    storage = FakeStorageAdapter()
    result = export_workspace(
        slug="trash-include-ws",
        session=session,
        storage=storage,
        output_path=tmp_path,
        include_trash=True,
    )

    with zipfile.ZipFile(result) as zf:
        names = set(zf.namelist())
        manifest = json.loads(zf.read("manifest.json"))

    assert f"nodes/{trashed.id}.md" in names
    assert len(manifest["nodes"]) == 1
    assert "deleted_at" in manifest["nodes"][0]


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
