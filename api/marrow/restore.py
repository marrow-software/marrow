"""Restore a workspace from an export bundle.

Supports both legacy (v1/v2/v3 — collections + pages) and current (v4 — nodes)
bundle formats. Legacy bundles are migrated on the fly: each collection becomes
a folder node at the space root, and each page becomes a page node parented to
its synthesized folder.

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

from sqlalchemy.orm import Session

from .models import Attachment, Node, Organization, Revision, Space, Workspace
from .storage import StorageAdapter

logger = logging.getLogger(__name__)

SUPPORTED_VERSIONS = ("1", "2", "3", "4")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _position_for(index: int) -> str:
    """Synthesize a sortable position string for legacy bundles."""
    return f"a{index:06d}"


def restore_workspace(
    bundle_path: Path,
    session: Session,
    storage: StorageAdapter,
) -> str:
    """Restore a workspace from *bundle_path* into *session*.

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
                f"(expected one of {SUPPORTED_VERSIONS})"
            )

        logger.info("Restoring bundle %s (schema_version=%s)", bundle_path, schema_version)

        if schema_version == "4":
            return _restore_v4(zf, names, manifest, session, storage)
        return _restore_legacy(zf, names, manifest, session, storage, schema_version)


# ---------------------------------------------------------------------------
# v4 (native node-tree)
# ---------------------------------------------------------------------------


def _restore_v4(
    zf: zipfile.ZipFile,
    names: set[str],
    manifest: dict,
    session: Session,
    storage: StorageAdapter,
) -> str:
    is_slim = manifest.get("slim", False)

    orgs = manifest.get("organizations") or []
    workspaces = manifest.get("workspaces") or []
    if not orgs or not workspaces:
        raise ValueError("v4 bundle must contain at least one organization and one workspace")

    org_meta = orgs[0]
    ws_meta = workspaces[0]
    ws_id = uuid.UUID(ws_meta["id"])

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
    org_id = uuid.UUID(org_meta["id"])
    if session.get(Organization, org_id) is None:
        session.add(
            Organization(
                id=org_id,
                slug=org_meta["slug"],
                name=org_meta["name"],
                created_at=_dt(org_meta["created_at"]),
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
    for s in manifest.get("spaces", []):
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

    # --- Nodes (deferred current_revision_id; insert parents before children) ---
    nodes_meta = manifest.get("nodes", [])
    # Topological order: parents first. Map by id for ordering by depth.
    by_id = {n["id"]: n for n in nodes_meta}

    def depth(n: dict) -> int:
        d = 0
        cur = n
        while cur.get("parent_id"):
            parent = by_id.get(cur["parent_id"])
            if parent is None:
                break
            cur = parent
            d += 1
        return d

    sorted_nodes = sorted(nodes_meta, key=depth)

    pending_current_revisions: dict[uuid.UUID, uuid.UUID] = {}
    page_node_ids: set[uuid.UUID] = set()
    for n in sorted_nodes:
        node_id = uuid.UUID(n["id"])
        node_type = n["type"]
        deleted_at = _dt(n["deleted_at"]) if n.get("deleted_at") else None
        session.add(
            Node(
                id=node_id,
                space_id=uuid.UUID(n["space_id"]),
                parent_id=uuid.UUID(n["parent_id"]) if n.get("parent_id") else None,
                type=node_type,
                name=n["name"],
                slug=n["slug"],
                position=n["position"],
                description=n.get("description") if node_type == "folder" else None,
                current_revision_id=None,
                created_at=_dt(n["created_at"]),
                deleted_at=deleted_at,
            )
        )
        if node_type == "page":
            page_node_ids.add(node_id)
            crid = n.get("current_revision_id")
            if crid:
                pending_current_revisions[node_id] = uuid.UUID(crid)
    session.flush()

    # --- Revisions ---
    if is_slim:
        for n in nodes_meta:
            if n["type"] != "page":
                continue
            node_id = uuid.UUID(n["id"])
            if n.get("deleted_at"):
                continue
            json_file = f"nodes/{n['id']}.json"
            md_file = f"nodes/{n['id']}.md"
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
            pending_current_revisions[node_id] = new_rev_id
    else:
        for r in manifest.get("revisions", []):
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
    session.flush()

    # --- Wire up current_revision_id ---
    for node_id, rev_id in pending_current_revisions.items():
        node = session.get(Node, node_id)
        if node is not None:
            node.current_revision_id = rev_id
    session.flush()

    # --- Attachments ---
    _restore_attachments(zf, names, manifest.get("attachments", []), session, storage)

    return ws_meta["slug"]


# ---------------------------------------------------------------------------
# Legacy (v1/v2/v3 — collections + pages → synthesized nodes)
# ---------------------------------------------------------------------------


def _restore_legacy(
    zf: zipfile.ZipFile,
    names: set[str],
    manifest: dict,
    session: Session,
    storage: StorageAdapter,
    schema_version: str,
) -> str:
    is_slim = manifest.get("slim", False)

    ws_meta = manifest["workspace"]
    ws_id = uuid.UUID(ws_meta["id"])

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
    if schema_version in ("2", "3") and "organization" in manifest:
        org_meta = manifest["organization"]
        org_id = uuid.UUID(org_meta["id"])
        if session.get(Organization, org_id) is None:
            session.add(
                Organization(
                    id=org_id,
                    slug=org_meta["slug"],
                    name=org_meta["name"],
                    created_at=_dt(org_meta["created_at"]),
                )
            )
            session.flush()
    else:
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

    # --- Collections → folder Nodes (one per collection, parent_id=NULL) ---
    # Synthesize positions per-space so siblings stay sortable.
    space_collection_index: dict[str, int] = {}
    collections = manifest.get("collections", [])
    for c in collections:
        space_id_str = c["space_id"]
        idx = space_collection_index.get(space_id_str, 0)
        space_collection_index[space_id_str] = idx + 1
        session.add(
            Node(
                id=uuid.UUID(c["id"]),
                space_id=uuid.UUID(space_id_str),
                parent_id=None,
                type="folder",
                name=c["name"],
                slug=c["slug"],
                position=_position_for(idx),
                description=None,
                current_revision_id=None,
                created_at=_dt(c["created_at"]),
            )
        )
    session.flush()

    # --- Pages → page Nodes (parent_id = collection's synthesized folder) ---
    pages = manifest.get("pages", [])
    collection_page_index: dict[str, int] = {}
    pending_current_revisions: dict[uuid.UUID, uuid.UUID] = {}

    for p in pages:
        node_id = uuid.UUID(p["id"])
        col_id_str = p["collection_id"]
        idx = collection_page_index.get(col_id_str, 0)
        collection_page_index[col_id_str] = idx + 1
        # Look up the space for this page via its collection (needed for Node.space_id).
        # collections list above was already iterated — re-derive from manifest.
        space_id_str = next(
            (c["space_id"] for c in collections if c["id"] == col_id_str),
            None,
        )
        if space_id_str is None:
            raise ValueError(
                f"Page {p['id']} references unknown collection {col_id_str} in legacy manifest"
            )
        session.add(
            Node(
                id=node_id,
                space_id=uuid.UUID(space_id_str),
                parent_id=uuid.UUID(col_id_str),
                type="page",
                name=p["title"],
                slug=p["slug"],
                position=_position_for(idx),
                description=None,
                current_revision_id=None,
                created_at=_dt(p["created_at"]),
            )
        )
        if p.get("current_revision_id"):
            pending_current_revisions[node_id] = uuid.UUID(p["current_revision_id"])
    session.flush()

    # --- Revisions ---
    # Legacy bundles store content under pages/{page-id}.{md,json}; same for revisions/.
    # The page-id in legacy bundles is reused as the node-id post-migration.
    if is_slim:
        for p in pages:
            node_id = uuid.UUID(p["id"])
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
                    node_id=node_id,
                    content=content,
                    content_format=content_format,
                )
            )
            pending_current_revisions[node_id] = new_rev_id
    else:
        for r in manifest.get("revisions", []):
            content_format = r.get("content_format", "markdown")
            page_id_str = r["page_id"]  # legacy key
            if content_format == "json":
                rev_file = f"revisions/{page_id_str}/{r['id']}.json"
            else:
                rev_file = f"revisions/{page_id_str}/{r['id']}.md"
            if rev_file not in names:
                raise ValueError(f"Bundle is missing revision file: {rev_file}")
            content = zf.read(rev_file).decode()
            session.add(
                Revision(
                    id=uuid.UUID(r["id"]),
                    node_id=uuid.UUID(page_id_str),
                    content=content,
                    content_format=content_format,
                    created_at=_dt(r["created_at"]),
                )
            )
    session.flush()

    # --- Wire up current_revision_id ---
    for node_id, rev_id in pending_current_revisions.items():
        node = session.get(Node, node_id)
        if node is not None:
            node.current_revision_id = rev_id
    session.flush()

    # --- Attachments (legacy: page_id key → node_id) ---
    legacy_attachments = []
    for att in manifest.get("attachments", []):
        normalized = dict(att)
        if "node_id" not in normalized and "page_id" in normalized:
            normalized["node_id"] = normalized["page_id"]
        legacy_attachments.append(normalized)
    _restore_attachments(zf, names, legacy_attachments, session, storage)

    return ws_meta["slug"]


# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------


def _restore_attachments(
    zf: zipfile.ZipFile,
    names: set[str],
    attachments: list[dict],
    session: Session,
    storage: StorageAdapter,
) -> None:
    for att in attachments:
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
