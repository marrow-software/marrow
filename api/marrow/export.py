"""Export a workspace to a portable zip bundle.

Bundle layout (schema v4):
    marrow-export-{workspace-slug}-{timestamp}.zip
    ├── manifest.json
    ├── nodes/{node-id}.json          # canonical BlockNote JSON (format='json', pages only)
    ├── nodes/{node-id}.md            # human-readable Markdown (pages only)
    ├── assets/{asset-id}{ext}
    ├── revisions/{node-id}/{revision-id}.json   # for JSON-format revisions
    ├── revisions/{node-id}/{revision-id}.md     # for all revisions
    └── links.json

Folder nodes appear in the manifest only — no content files.
Trashed nodes (deleted_at IS NOT NULL) are excluded by default; pass
include_trash=True to include them.

v1/v2 bundles had only .md files; v3 added .json for JSON-format revisions
under pages/. v4 moves content files to nodes/ and drops collections/pages
from the manifest in favour of a flat nodes list.
"""

import hashlib
import json
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from sqlalchemy.orm import Session

from .links import reconcile_node_links, serialize_node_links
from .models import Node, NodeProperty, Workspace
from .storage import StorageAdapter

SCHEMA_VERSION = "4"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _collect_nodes(workspace: Workspace, include_trash: bool = False) -> list[Node]:
    nodes: list[Node] = []
    for space in workspace.spaces:
        if include_trash:
            nodes.extend(space.nodes)
            continue
        # First pass: collect IDs of directly-trashed nodes.
        trashed_ids: set = {n.id for n in space.nodes if n.deleted_at is not None}
        # Second pass: also exclude any node whose ancestor is trashed (children of
        # trashed folders must be excluded or restore raises "missing parent" errors).
        all_nodes = list(space.nodes)
        excluded: set = set(trashed_ids)
        changed = True
        while changed:
            changed = False
            for n in all_nodes:
                if n.id not in excluded and n.parent_id in excluded:
                    excluded.add(n.id)
                    changed = True
        nodes.extend(n for n in all_nodes if n.id not in excluded)
    return nodes


# ---------------------------------------------------------------------------
# BlockNote JSON → Markdown converter (for human-readable export)
# ---------------------------------------------------------------------------


def _inline_to_text(inline_content: list) -> str:
    """Convert BlockNote inline content array to Markdown text."""
    text = ""
    for item in inline_content:
        if not isinstance(item, dict):
            continue
        item_type = item.get("type", "text")
        if item_type == "text":
            t = item.get("text", "")
            styles = item.get("styles", {})
            if styles.get("code"):
                t = f"`{t}`"
            if styles.get("bold"):
                t = f"**{t}**"
            if styles.get("italic"):
                t = f"*{t}*"
            if styles.get("strike"):
                t = f"~~{t}~~"
            text += t
        elif item_type == "link":
            href = item.get("href", "")
            link_content = item.get("content", [])
            link_text = _inline_to_text(link_content)
            text += f"[{link_text}]({href})"
        elif item_type == "mention":
            # Member mention: lossy fallback to "@DisplayName" plaintext.
            # The canonical userId is preserved in the JSON revision.
            display_name = item.get("props", {}).get("displayName", "")
            if display_name:
                text += f"@{display_name}"
    return text


def _blocks_to_markdown(blocks: list, indent: int = 0) -> list[str]:
    """Recursively convert BlockNote block array to Markdown lines."""
    lines: list[str] = []
    prefix = "  " * indent

    for block in blocks:
        if not isinstance(block, dict):
            continue
        btype = block.get("type", "paragraph")
        content = block.get("content", [])
        props = block.get("props", {})
        children = block.get("children", [])

        # Table blocks store content as a 2D grid, not inline content
        if btype == "table":
            rows = content if isinstance(content, list) else []
            if rows:
                md_rows = []
                for i, row in enumerate(rows):
                    cells = row.get("cells", []) if isinstance(row, dict) else []
                    cell_texts = [
                        _inline_to_text(cell) if isinstance(cell, list) else str(cell)
                        for cell in cells
                    ]
                    md_rows.append(f"{prefix}| {' | '.join(cell_texts)} |")
                    if i == 0:
                        separator = f"{prefix}|" + "|".join([" --- " for _ in cells]) + "|"
                        md_rows.append(separator)
                lines.extend(md_rows)
            continue

        text = _inline_to_text(content) if isinstance(content, list) else str(content)

        if btype == "paragraph":
            if text.strip():
                lines.append(f"{prefix}{text}")
            else:
                lines.append("")
        elif btype == "heading":
            level = int(props.get("level", 1))
            lines.append(f"{prefix}{'#' * level} {text}")
        elif btype == "bulletListItem":
            lines.append(f"{prefix}- {text}")
        elif btype == "numberedListItem":
            lines.append(f"{prefix}1. {text}")
        elif btype == "checkListItem":
            checked = "x" if props.get("checked") else " "
            lines.append(f"{prefix}- [{checked}] {text}")
        elif btype == "codeBlock":
            language = props.get("language", "")
            lines.append(f"{prefix}```{language}")
            lines.append(text)
            lines.append(f"{prefix}```")
        elif btype == "quote":
            lines.append(f"{prefix}> {text}")
        elif btype == "divider":
            lines.append(f"{prefix}---")
        elif btype == "image":
            url = props.get("url", "")
            caption = props.get("caption", "") or props.get("name", "image")
            lines.append(f"{prefix}![{caption}]({url})")
        elif btype == "file":
            url = props.get("url", "")
            name = props.get("name", "file")
            lines.append(f"{prefix}[{name}]({url})")
        elif btype == "toggleListItem":
            lines.append(f"{prefix}> {text}")
        else:
            if text.strip():
                lines.append(f"{prefix}{text}")

        if children:
            lines.extend(_blocks_to_markdown(children, indent + 1))

    return lines


def blocks_to_markdown(content_json: str) -> str:
    """Convert a BlockNote JSON string to human-readable Markdown.

    Used during export to generate the .md companion file for JSON revisions.
    Returns the original string unchanged if parsing fails.
    """
    try:
        blocks = json.loads(content_json)
        if not isinstance(blocks, list):
            return content_json
        lines = _blocks_to_markdown(blocks)
        return "\n".join(lines)
    except (json.JSONDecodeError, TypeError, KeyError):
        return content_json


# ---------------------------------------------------------------------------
# Link index serialization (from node_links table)
# ---------------------------------------------------------------------------


def _reconcile_export_links(
    session: Session, nodes: list[Node], *, include_trash: bool = False
) -> None:
    """Sync ``node_links`` from each exported page's current revision content."""
    for node in nodes:
        if node.type != "page":
            continue
        if node.current_revision:
            content = node.current_revision.content
            fmt = node.current_revision.content_format
        else:
            content = ""
            fmt = "markdown"
        reconcile_node_links(session, node.id, content, fmt, include_trash=include_trash)


def _build_links(session: Session, nodes: list[Node]) -> dict:
    """Build links.json payload from the live ``node_links`` index."""
    page_nodes = [n for n in nodes if n.type == "page"]
    page_ids = {n.id for n in page_nodes}
    exported_ids = {str(nid) for nid in page_ids}

    internal_links = [
        lnk
        for lnk in serialize_node_links(session, page_ids)
        if lnk["target_node_id"] in exported_ids
    ]

    linked_ids = {lnk["target_node_id"] for lnk in internal_links}
    orphaned = [str(n.id) for n in page_nodes if str(n.id) not in linked_ids]

    return {
        "internal_links": internal_links,
        "broken_links": [],
        "orphaned_nodes": orphaned,
    }


def serialize_node_properties(properties: list[NodeProperty]) -> list[dict]:
    return [
        {
            "id": str(p.id),
            "node_id": str(p.node_id),
            "key": p.key,
            "value": p.value,
            "value_type": p.value_type,
            "options": p.options,
            "created_at": p.created_at.isoformat(),
            "updated_at": p.updated_at.isoformat(),
        }
        for p in properties
    ]


def _build_manifest(
    workspace: Workspace,
    nodes: list[Node],
    attachment_records: list[dict],
    export_timestamp: str,
    include_trash: bool = False,
    *,
    node_properties: list[dict] | None = None,
) -> dict:
    spaces = workspace.spaces
    page_nodes = [n for n in nodes if n.type == "page"]

    revision_records = [
        {
            "id": str(rev.id),
            "node_id": str(rev.node_id),
            "content_format": rev.content_format,
            "created_at": rev.created_at.isoformat(),
        }
        for node in page_nodes
        for rev in node.revisions
    ]

    node_records: list[dict] = []
    for n in nodes:
        rec: dict = {
            "id": str(n.id),
            "space_id": str(n.space_id),
            "parent_id": str(n.parent_id) if n.parent_id else None,
            "type": n.type,
            "name": n.name,
            "slug": n.slug,
            "position": n.position,
            "created_at": n.created_at.isoformat(),
        }
        if n.type == "folder" and n.description:
            rec["description"] = n.description
        if n.type == "page":
            rec["current_revision_id"] = (
                str(n.current_revision_id) if n.current_revision_id else None
            )
        if include_trash and n.deleted_at is not None:
            rec["deleted_at"] = n.deleted_at.isoformat()
        node_records.append(rec)

    org = workspace.organization
    manifest: dict = {
        "schema_version": SCHEMA_VERSION,
        "export_timestamp": export_timestamp,
        "organization": {
            "id": str(org.id),
            "slug": org.slug,
            "name": org.name,
            "created_at": org.created_at.isoformat(),
        },
        "workspace": {
            "id": str(workspace.id),
            "org_id": str(workspace.org_id),
            "slug": workspace.slug,
            "name": workspace.name,
            "created_at": workspace.created_at.isoformat(),
        },
        "spaces": [
            {
                "id": str(s.id),
                "workspace_id": str(s.workspace_id),
                "slug": s.slug,
                "name": s.name,
                "created_at": s.created_at.isoformat(),
            }
            for s in spaces
        ],
        "nodes": node_records,
        "revisions": revision_records,
        "attachments": attachment_records,
        "node_properties": node_properties or [],
        "include_trash": include_trash,
    }
    return manifest


def estimate_export_sizes(
    slug: str,
    session: Session,
    storage: StorageAdapter,
) -> dict:
    """Return estimated byte sizes for full and slim exports of *slug*.

    Sizes are raw (pre-compression) byte counts. Actual zip files will be
    smaller due to DEFLATE compression, but the ratio between full and slim
    is accurate.
    """
    workspace = session.query(Workspace).filter_by(slug=slug).first()
    if workspace is None:
        raise ValueError(f"Workspace '{slug}' not found")

    nodes = _collect_nodes(workspace)
    page_nodes = [n for n in nodes if n.type == "page"]
    for node in page_nodes:
        _ = node.current_revision
        _ = node.revisions
        _ = node.attachments

    attachment_bytes = sum(att.size_bytes for node in page_nodes for att in node.attachments)

    current_content_bytes = sum(
        len((node.current_revision.content or "").encode())
        for node in page_nodes
        if node.current_revision
    )
    revision_bytes = sum(
        len((rev.content or "").encode()) for node in page_nodes for rev in node.revisions
    )

    slim_bytes = current_content_bytes + attachment_bytes
    full_bytes = slim_bytes + revision_bytes

    return {"full_bytes": full_bytes, "slim_bytes": slim_bytes}


def export_workspace(
    slug: str,
    session: Session,
    storage: StorageAdapter,
    output_path: Path | None = None,
    slim: bool = False,
    include_trash: bool = False,
) -> Path:
    """Export *slug* to a zip bundle and return the path of the written file.

    When *slim* is True the revisions/ directory is omitted, producing a
    current-content-only bundle that is smaller but cannot restore full history.

    When *include_trash* is True, soft-deleted nodes are included in the bundle.
    """
    workspace = session.query(Workspace).filter_by(slug=slug).first()
    if workspace is None:
        raise ValueError(f"Workspace '{slug}' not found")

    nodes = _collect_nodes(workspace, include_trash=include_trash)

    # Eagerly touch lazy-loaded relationships while the session is open.
    for node in nodes:
        _ = node.current_revision
        _ = node.revisions
        _ = node.attachments

    export_timestamp = datetime.now(timezone.utc).isoformat()
    timestamp_fmt = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    slim_suffix = "-slim" if slim else ""
    bundle_name = f"marrow-export-{workspace.slug}{slim_suffix}-{timestamp_fmt}.zip"

    if output_path is None:
        output_path = Path.cwd() / bundle_name
    elif output_path.is_dir():
        output_path = output_path / bundle_name

    attachment_records: list[dict] = []
    buf = BytesIO()

    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for node in nodes:
            node_id = str(node.id)

            if node.type != "page":
                # Folders contribute manifest entry only — no content file.
                continue

            # Current page content — always write .md; also write .json for JSON format.
            if node.current_revision:
                content = node.current_revision.content
                fmt = node.current_revision.content_format
            else:
                content = ""
                fmt = "markdown"

            if fmt == "json":
                zf.writestr(f"nodes/{node_id}.json", content)
                zf.writestr(f"nodes/{node_id}.md", blocks_to_markdown(content))
            else:
                zf.writestr(f"nodes/{node_id}.md", content)

            if not slim:
                for rev in node.revisions:
                    rev_id = str(rev.id)
                    if rev.content_format == "json":
                        zf.writestr(f"revisions/{node_id}/{rev_id}.json", rev.content)
                        zf.writestr(
                            f"revisions/{node_id}/{rev_id}.md",
                            blocks_to_markdown(rev.content),
                        )
                    else:
                        zf.writestr(f"revisions/{node_id}/{rev_id}.md", rev.content)

        # Attachments — verify hash before including.
        all_attachments = [att for node in nodes for att in node.attachments]

        for att in all_attachments:
            att_id = str(att.id)
            ext = Path(att.filename).suffix
            data = storage.read(att_id, att.filename)
            actual_hash = _sha256(data)
            if actual_hash != att.hash:
                raise RuntimeError(
                    f"Hash mismatch for attachment {att_id} ({att.filename}): "
                    f"expected {att.hash}, got {actual_hash}"
                )
            zf.writestr(f"assets/{att_id}{ext}", data)
            attachment_records.append(
                {
                    "id": att_id,
                    "node_id": str(att.node_id),
                    "filename": att.filename,
                    "hash": att.hash,
                    "size_bytes": att.size_bytes,
                    "created_at": att.created_at.isoformat(),
                }
            )

        _reconcile_export_links(session, nodes, include_trash=include_trash)
        zf.writestr("links.json", json.dumps(_build_links(session, nodes), indent=2))

        node_id_list = [n.id for n in nodes]
        prop_rows = (
            (session.query(NodeProperty).filter(NodeProperty.node_id.in_(node_id_list)).all())
            if node_id_list
            else []
        )

        manifest = _build_manifest(
            workspace,
            nodes,
            attachment_records,
            export_timestamp,
            include_trash=include_trash,
            node_properties=serialize_node_properties(prop_rows) if prop_rows else None,
        )
        if slim:
            manifest["slim"] = True
            manifest["revisions"] = []

        zf.writestr("manifest.json", json.dumps(manifest, indent=2))

    output_path.write_bytes(buf.getvalue())
    return output_path
