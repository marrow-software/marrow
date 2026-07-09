---
title: Export bundle format
description: The on-disk layout of a Marrow export bundle.
---

A Marrow export bundle is a zip file with a transparent, human-readable structure. You can unzip it and read it without any Marrow tooling.

For why this format exists and how the guarantee is enforced, see [Restore guarantee](/concepts/restore-guarantee/).

## Export scope (v4)

Bundle schema **v4** is the current format. This table matches the [restore guarantee scope](/concepts/restore-guarantee/#what-round-trips-today):

| Category | Included in bundle | Notes |
| --- | --- | --- |
| **Exported today (v4)** | Node tree, revisions, attachments, `node_properties`, `node_links` (`links.json`), trash (`include_trash`) | Round-trips via `marrow restore`; CI verifies with `test_round_trip.py` |
| **Never exported** | Stars, Inbox notifications, node watches | User-scoped tables — not workspace content |
| **Planned v5** | Comments, share links, folder view definitions | Not in v4 bundles yet; restore guarantee will extend when bundle v5 ships |

Search indices and other derived state are **not** in the bundle — they are rebuilt on restore.

:::note[You do not need to round-trip yourself]
The restore guarantee is enforced by automated tests on every commit, not by customer onboarding. To audit a bundle by hand, see [Inspecting a bundle](#inspecting-a-bundle) or the [export/restore walkthrough](/getting-started/export-restore-demo/).
:::

## File naming

```
marrow-export-{workspace-slug}-{timestamp}.zip          # full
marrow-export-{workspace-slug}-slim-{timestamp}.zip     # slim
```

The `marrow restore` CLI also accepts the legacy `freehold-export-*` prefix from bundles produced before the project rename.

## Layout

```
bundle.zip
├── manifest.json
├── nodes/
│   ├── {node-id}.md
│   └── {node-id}.json
├── revisions/
│   └── {node-id}/
│       ├── {revision-id}.md
│       └── {revision-id}.json
├── assets/
│   └── {attachment-id}{ext}
└── links.json
```

**Folder nodes** appear only in `manifest.json` — they have no files under `nodes/`. Only page-typed nodes get content files.

### `manifest.json`

Contains workspace and org metadata, all entity IDs, and the bundle schema version. Schema is currently **v4** (Marrow 0.2+). Restore supports v1, v2, v3, and v4: older bundles are auto-upgraded — their legacy collection/page structure is mapped onto the new `nodes` tree on read.

v4 manifests carry:

- The full **node tree** (folders + pages), each node's `parent_id`, `position` (fractional index), and `deleted_at`
- **`node_properties`** — folder property schemas and page values
- **`include_trash`** — whether soft-deleted nodes were included in the export

### `nodes/`

Current state of every **page-typed** node.

- `{node-id}.md` — Markdown render of the current revision (always present).
- `{node-id}.json` — canonical BlockNote JSON (present when the current revision is JSON-format).

The Markdown is for humans. The JSON is what gets restored byte-for-byte.

v3 bundles used a `pages/` directory with the same file naming; v4 renamed it to `nodes/` to match the unified node tree.

### `revisions/`

The full append-only history. Each page-typed node has a subfolder containing every revision. Same `.md` + `.json` convention as `nodes/`.

**Slim bundles** omit this directory entirely. The manifest sets `"slim": true` and `"revisions": []`. Restore recreates a single revision per page from the `nodes/` content.

CLI: `marrow export --slim`. API: `?slim=true`.

### Soft-deleted nodes (trash)

By default, exports omit nodes that have a `deleted_at` set, so a backup matches what users currently see. To include trash:

- CLI: `marrow export --include-trash`
- API: `?include_trash=true`

The manifest records the choice (`"include_trash": true|false`). Restore replays each included node's `deleted_at` so trash is preserved across the round trip.

### `assets/`

Every attachment, named by attachment ID with the original extension.

### `links.json`

Internal node-to-node links, broken links, and orphaned nodes. Used to reconstruct cross-references on restore. The `orphaned_nodes` array lists nodes with no inbound links from other exported nodes.

## Bundle schema versions

| Version | Introduced | Notes |
| --- | --- | --- |
| v1 | Initial | Markdown-only revisions. |
| v2 | — | Added `links.json`. |
| v3 | 0.1 | Added `.json` files alongside `.md` for canonical BlockNote content; content under `pages/`. |
| v4 | 0.2 (current) | Collapsed `collections` + `pages` into a single `nodes` tree (folders + pages); content under `nodes/`; added `parent_id`, `position`, `deleted_at`, `include_trash`, and `node_properties`. |

Restore is backward-compatible: any older bundle restores cleanly into a current Marrow workspace. v1/v2/v3 bundles are auto-upgraded — their legacy collection/page layout is mapped onto the v4 node tree on read.

## Inspecting a bundle

```bash
unzip -l marrow-export-mydocs-20260101T120000Z.zip
unzip -p marrow-export-mydocs-20260101T120000Z.zip manifest.json | jq .
```

If you want to verify a backup is restorable without disturbing your live instance, restore it into a fresh database:

```bash
docker compose up -d  # fresh dev DB
cd api && marrow restore /path/to/bundle.zip
```
