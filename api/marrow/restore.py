"""Restore a workspace from an export bundle.

Accepts v3 (collections + pages) and v4 (nodes) bundles transparently.

Usage:
    marrow restore <bundle.zip>
"""

import hashlib
import json
import logging
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from .links import rebuild_node_links
from .models import Attachment, Node, NodeProperty, Organization, Revision, Space, Workspace
from .storage import StorageAdapter

logger = logging.getLogger(__name__)

SUPPORTED_VERSIONS = ("1", "2", "3", "4")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _pos(idx: int) -> str:
    """Generate a sortable position string for the given index."""
    return str(idx).zfill(6)


def restore_workspace(
    bundle_path: Path,
    session: Session,
    storage: StorageAdapter,
) -> str:
    """Restore a workspace from *bundle_path* into *session*.

    Accepts v3 (collections + pages) and v4 (nodes) bundles transparently.
    Returns the workspace slug on success. Raises on any validation failure.
    The caller is responsible for committing the session.
    """
    if not zipfile.is_zipfile(bundle_path):
        raise ValueError(f"Not a valid zip file: {bundle_path}")

    with zipfile.ZipFile(bundle_path) as zf:
        names = set(zf.namelist())
        if "manifest.json" not in names:
            raise ValueError(f"Not a valid Marrow bundle: manifest.json missing in {bundle_path}")

        manifest = json.loads(zf.read("manifest.json"))

        schema_version = manifest.get("schema_version")
        if schema_version not in SUPPORTED_VERSIONS:
            raise ValueError(
                f"Unsupported bundle schema version '{schema_version}' "
                f"(expected one of: {', '.join(SUPPORTED_VERSIONS)})"
            )

        logger.info(
            "Restoring bundle schema_version=%s from %s", schema_version, Path(bundle_path).name
        )

        is_slim = manifest.get("slim", False)

        ws_meta = manifest["workspace"]
        ws_id = uuid.UUID(ws_meta["id"])

        # Duplicate checks — fail loudly rather than silently overwriting.
        if session.get(Workspace, ws_id) is not None:
            raise ValueError(
                f"Workspace with id={ws_meta['id']} already exists. Delete it before restoring."
            )
        if session.query(Workspace).filter_by(slug=ws_meta["slug"]).first() is not None:
            raise ValueError(
                f"A workspace with slug '{ws_meta['slug']}' already exists. "
                "Delete it before restoring."
            )

        # --- Organization ---
        if schema_version in ("2", "3", "4") and "organization" in manifest:
            org_meta = manifest["organization"]
            org_id = uuid.UUID(org_meta["id"])
            existing_org = session.get(Organization, org_id)
            if existing_org is None:
                session.add(
                    Organization(
                        id=org_id,
                        slug=org_meta["slug"],
                        name=org_meta["name"],
                        created_at=_dt(org_meta["created_at"]),
                        # Restored orgs are already named — never re-onboard.
                        onboarded_at=_dt(org_meta["created_at"]),
                    )
                )
                session.flush()
        else:
            # v1 bundle: create a new org named after the workspace
            org_id = uuid.uuid4()
            slug_candidate = f"{ws_meta['slug']}-imported"
            counter = 0
            slug = slug_candidate
            while session.query(Organization).filter_by(slug=slug).first() is not None:
                counter += 1
                slug = f"{slug_candidate}-{counter}"
            session.add(
                Organization(
                    id=org_id,
                    slug=slug,
                    name=f"{ws_meta['name']} (imported)",
                    onboarded_at=sa_func.now(),
                )
            )
            session.flush()

        # --- Workspace ---
        session.add(
            Workspace(
                id=ws_id,
                org_id=org_id,
                slug=ws_meta["slug"],
                name=ws_meta["name"],
                created_at=_dt(ws_meta["created_at"]),
            )
        )
        session.flush()

        # --- Spaces ---
        for s in manifest["spaces"]:
            session.add(
                Space(
                    id=uuid.UUID(s["id"]),
                    workspace_id=uuid.UUID(s["workspace_id"]),
                    slug=s["slug"],
                    name=s["name"],
                    created_at=_dt(s["created_at"]),
                )
            )
        session.flush()

        # Dispatch to the appropriate restore path based on bundle version.
        if schema_version in ("1", "2", "3"):
            _restore_v3_nodes(manifest, zf, session, storage, names, is_slim)
        else:
            _restore_v4_nodes(manifest, zf, session, storage, names, is_slim)

        # Rebuild the node_links index from links.json if present.
        # v3 bundles use source_page_id/target_page_id; normalize to node_id keys.
        if "links.json" in names:
            links_data = json.loads(zf.read("links.json"))
            raw_links = links_data.get("internal_links", [])
            normalized = [
                {
                    "source_node_id": lnk.get("source_node_id", lnk.get("source_page_id")),
                    "target_node_id": lnk.get("target_node_id", lnk.get("target_page_id")),
                }
                for lnk in raw_links
            ]
            rebuild_node_links(session, normalized)

    return ws_meta["slug"]


def _restore_v3_nodes(
    manifest: dict,
    zf: zipfile.ZipFile,
    session: Session,
    storage: StorageAdapter,
    names: set[str],
    is_slim: bool,
) -> None:
    """Synthesize Node rows from v3 collections + pages manifest entries.

    Collections become folder-type nodes at the root of their space.
    Pages become page-type nodes parented to their collection's folder node.
    Original UUIDs are preserved for referential integrity.
    """
    # Map: old collection_id (str) → synthesized folder Node's space_id
    col_to_space_id: dict[str, uuid.UUID] = {}

    # --- Folders (synthesized from collections) ---
    for idx, c in enumerate(manifest.get("collections", [])):
        folder_id = uuid.UUID(c["id"])
        space_id = uuid.UUID(c["space_id"])
        col_to_space_id[c["id"]] = space_id
        session.add(
            Node(
                id=folder_id,
                space_id=space_id,
                parent_id=None,
                type="folder",
                name=c["name"],
                slug=c["slug"],
                position=_pos(idx),
                created_at=_dt(c["created_at"]),
            )
        )
    session.flush()

    # --- Pages (synthesized from pages, parented to folder nodes) ---
    node_current_revisions: dict[uuid.UUID, uuid.UUID] = {}
    # old page_id → synthesized page Node id (same UUID, preserved)
    page_to_node_id: dict[str, uuid.UUID] = {}

    # Build a lookup from collection_id → space_id for page → space_id resolution
    col_space_map: dict[str, uuid.UUID] = col_to_space_id

    for idx, p in enumerate(manifest.get("pages", [])):
        page_node_id = uuid.UUID(p["id"])
        page_to_node_id[p["id"]] = page_node_id
        parent_id = uuid.UUID(p["collection_id"]) if p.get("collection_id") else None
        space_id = col_space_map.get(p.get("collection_id", ""))
        if space_id is None:
            raise ValueError(
                f"Page '{p['id']}' has collection_id '{p.get('collection_id')}' "
                "which could not be mapped to a space — bundle may be corrupt."
            )

        session.add(
            Node(
                id=page_node_id,
                space_id=space_id,
                parent_id=parent_id,
                type="page",
                name=p.get("title", p.get("name", p["slug"])),
                slug=p["slug"],
                position=_pos(idx),
                current_revision_id=None,  # wired up after revisions are inserted
                created_at=_dt(p["created_at"]),
            )
        )
        if p.get("current_revision_id"):
            node_current_revisions[page_node_id] = uuid.UUID(p["current_revision_id"])
    session.flush()

    # --- Revisions ---
    if is_slim:
        for p in manifest.get("pages", []):
            page_node_id = page_to_node_id[p["id"]]
            json_file = f"pages/{p['id']}.json"
            md_file = f"pages/{p['id']}.md"
            if json_file in names:
                content = zf.read(json_file).decode()
                content_format = "json"
            elif md_file in names:
                content = zf.read(md_file).decode()
                content_format = "markdown"
            else:
                content = ""
                content_format = "markdown"
            new_rev_id = uuid.uuid4()
            session.add(
                Revision(
                    id=new_rev_id,
                    node_id=page_node_id,
                    content=content,
                    content_format=content_format,
                )
            )
            node_current_revisions[page_node_id] = new_rev_id
    else:
        for r in manifest.get("revisions", []):
            content_format = r.get("content_format", "markdown")
            page_id = r["page_id"]
            rev_id = r["id"]
            if content_format == "json":
                rev_file = f"revisions/{page_id}/{rev_id}.json"
            else:
                rev_file = f"revisions/{page_id}/{rev_id}.md"
            if rev_file not in names:
                raise ValueError(f"Bundle is missing revision file: {rev_file}")
            content = zf.read(rev_file).decode()
            node_id = page_to_node_id.get(page_id)
            if node_id is None:
                raise ValueError(
                    f"Revision '{rev_id}' references unknown page"
                    f" '{page_id}' — bundle may be corrupt."
                )
            session.add(
                Revision(
                    id=uuid.UUID(rev_id),
                    node_id=node_id,
                    content=content,
                    content_format=content_format,
                    created_at=_dt(r["created_at"]),
                )
            )
    session.flush()

    # --- Wire up current_revision_id now that revisions exist ---
    for node_id, rev_id in node_current_revisions.items():
        node = session.get(Node, node_id)
        if node is None:
            raise ValueError(f"Cannot wire current_revision_id: node {node_id} not found")
        node.current_revision_id = rev_id
    session.flush()

    # --- Attachments ---
    for att in manifest.get("attachments", []):
        att_id = att["id"]
        ext = Path(att["filename"]).suffix
        asset_file = f"assets/{att_id}{ext}"
        if asset_file not in names:
            raise ValueError(f"Bundle is missing asset file: {asset_file}")
        data = zf.read(asset_file)
        actual_hash = _sha256(data)
        if actual_hash != att["hash"]:
            raise RuntimeError(
                f"Hash mismatch for attachment {att_id} ({att['filename']}): "
                f"expected {att['hash']}, got {actual_hash}"
            )
        storage.write(att_id, att["filename"], data)
        page_id = att.get("page_id", "")
        node_id = page_to_node_id.get(page_id)
        if node_id is None:
            raise ValueError(f"Attachment {att_id} references unknown page_id '{page_id}'")
        session.add(
            Attachment(
                id=uuid.UUID(att_id),
                node_id=node_id,
                filename=att["filename"],
                hash=att["hash"],
                size_bytes=att["size_bytes"],
                created_at=_dt(att["created_at"]),
            )
        )
    session.flush()


def _restore_v4_nodes(
    manifest: dict,
    zf: zipfile.ZipFile,
    session: Session,
    storage: StorageAdapter,
    names: set[str],
    is_slim: bool,
) -> None:
    """Restore Node rows directly from a v4 bundle manifest."""
    # --- Nodes (topological order: parents before children) ---
    node_records = manifest.get("nodes", [])
    inserted: set[str] = set()
    remaining = list(node_records)

    while remaining:
        progress = False
        next_remaining = []
        for rec in remaining:
            parent_id = rec.get("parent_id")
            if parent_id is None or parent_id in inserted:
                node = Node(
                    id=uuid.UUID(rec["id"]),
                    space_id=uuid.UUID(rec["space_id"]),
                    parent_id=uuid.UUID(parent_id) if parent_id else None,
                    type=rec["type"],
                    name=rec["name"],
                    slug=rec["slug"],
                    position=rec["position"],
                    description=rec.get("description"),
                    current_revision_id=None,
                )
                if "deleted_at" in rec and rec["deleted_at"]:
                    node.deleted_at = _dt(rec["deleted_at"])
                session.add(node)
                inserted.add(rec["id"])
                progress = True
            else:
                next_remaining.append(rec)
        if not progress:
            unresolved_ids = [rec["id"] for rec in next_remaining]
            raise ValueError(
                f"Bundle has a cycle or missing parent reference in nodes: {unresolved_ids}"
            )
        remaining = next_remaining
    session.flush()

    # --- Revisions ---
    node_current_revisions: dict[uuid.UUID, uuid.UUID] = {}
    page_records = {rec["id"]: rec for rec in node_records if rec["type"] == "page"}

    if is_slim:
        # Slim bundles omit revision history. Recreate one revision per page
        # from the current node content stored in nodes/.
        for node_id_str, rec in page_records.items():
            node_id = uuid.UUID(node_id_str)
            json_file = f"nodes/{node_id_str}.json"
            md_file = f"nodes/{node_id_str}.md"
            if json_file in names:
                content = zf.read(json_file).decode()
                content_format = "json"
            elif md_file in names:
                content = zf.read(md_file).decode()
                content_format = "markdown"
            else:
                content = ""
                content_format = "markdown"
            new_rev_id = uuid.uuid4()
            session.add(
                Revision(
                    id=new_rev_id,
                    node_id=node_id,
                    content=content,
                    content_format=content_format,
                )
            )
            node_current_revisions[node_id] = new_rev_id
    else:
        for r in manifest["revisions"]:
            content_format = r.get("content_format", "markdown")
            node_id_str = r["node_id"]
            if content_format == "json":
                rev_file = f"revisions/{node_id_str}/{r['id']}.json"
            else:
                rev_file = f"revisions/{node_id_str}/{r['id']}.md"
            if rev_file not in names:
                raise ValueError(f"Bundle is missing revision file: {rev_file}")
            content = zf.read(rev_file).decode()
            session.add(
                Revision(
                    id=uuid.UUID(r["id"]),
                    node_id=uuid.UUID(node_id_str),
                    content=content,
                    content_format=content_format,
                    created_at=_dt(r["created_at"]),
                )
            )
        # Wire current_revision_id from manifest
        for rec in node_records:
            if rec["type"] == "page" and rec.get("current_revision_id"):
                node_current_revisions[uuid.UUID(rec["id"])] = uuid.UUID(rec["current_revision_id"])
    session.flush()

    # --- Wire up current_revision_id now that revisions exist ---
    for node_id, rev_id in node_current_revisions.items():
        node = session.get(Node, node_id)
        if node is not None:
            node.current_revision_id = rev_id
    session.flush()

    # --- Attachments ---
    for att in manifest["attachments"]:
        att_id = att["id"]
        if not att.get("node_id"):
            logger.warning("Skipping attachment %s with missing node_id", att_id)
            continue
        ext = Path(att["filename"]).suffix
        asset_file = f"assets/{att_id}{ext}"
        if asset_file not in names:
            raise ValueError(f"Bundle is missing asset file: {asset_file}")

        data = zf.read(asset_file)
        actual_hash = _sha256(data)
        if actual_hash != att["hash"]:
            raise RuntimeError(
                f"Hash mismatch for attachment {att_id} ({att['filename']}): "
                f"expected {att['hash']}, got {actual_hash}"
            )

        storage.write(att_id, att["filename"], data)
        if "node_id" not in att:
            raise ValueError(
                f"Attachment '{att_id}' is missing 'node_id' — v4 bundle may be corrupt."
            )
        session.add(
            Attachment(
                id=uuid.UUID(att_id),
                node_id=uuid.UUID(att["node_id"]),
                filename=att["filename"],
                hash=att["hash"],
                size_bytes=att["size_bytes"],
                created_at=_dt(att["created_at"]),
            )
        )
    session.flush()

    # --- Node properties (v4 bundles only) ---
    for prop in manifest.get("node_properties", []):
        node_id = uuid.UUID(prop["node_id"])
        if session.get(Node, node_id) is None:
            raise ValueError(f"node_properties entry references unknown node_id '{node_id}'")
        session.add(
            NodeProperty(
                id=uuid.UUID(prop["id"]),
                node_id=node_id,
                key=prop["key"],
                value=prop.get("value"),
                value_type=prop["value_type"],
                options=prop.get("options"),
                created_at=_dt(prop["created_at"]),
                updated_at=_dt(prop["updated_at"]),
            )
        )
    session.flush()
