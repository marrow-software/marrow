---
title: Export bundle format
description: The on-disk layout of a Marrow export bundle.
---

A Marrow export bundle is a zip file with a transparent, human-readable structure. You can unzip it and read it without any Marrow tooling.

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
├── pages/
│   ├── {node-id}.md
│   └── {node-id}.json
├── revisions/
│   └── {node-id}/
│       ├── {revision-id}.md
│       └── {revision-id}.json
├── assets/
│   └── {attachment-id}{ext}
├── links.json
└── trash/              # only present when exported with --include-trash
    └── {node-id}.json
```

### `manifest.json`

Contains workspace and org metadata, all entity IDs, and the bundle schema version. Schema is currently **v4**. Restore supports v1, v2, v3, and v4 (v3 bundles are auto-upgraded to v4 on restore).

### `pages/`

Current state of every page node.

- `{node-id}.md` — Markdown render of the current revision (always present).
- `{node-id}.json` — canonical BlockNote JSON (present when the current revision is JSON-format).

The Markdown is for humans. The JSON is what gets restored byte-for-byte.

Folder nodes have no content files. Their metadata (name, slug, position, description) lives entirely in `manifest.json`.

### `revisions/`

The full append-only history. Each page node has a subfolder containing every revision. Same `.md` + `.json` convention as `pages/`.

**Slim bundles** omit this directory entirely. The manifest sets `"slim": true` and `"revisions": []`. Restore recreates a single revision per page from the `pages/` content.

CLI: `marrow export --slim`. API: `?slim=true`.

**Trash**: soft-deleted nodes are excluded by default. Pass `--include-trash` (CLI) or `?include_trash=true` (API) to include them in the bundle. Restore skips trash nodes unless the flag was set at export time.

### `assets/`

Every attachment, named by attachment ID with the original extension.

### `links.json`

Internal node-to-node links, broken links, and orphaned pages. Used to reconstruct cross-references on restore.

## Bundle schema versions

| Version | Introduced | Notes |
| --- | --- | --- |
| v1 | Initial | Markdown-only revisions. |
| v2 | — | Added `links.json`. |
| v3 | v0.1 | Added `.json` files alongside `.md` for canonical BlockNote content. |
| v4 | v0.2 (current) | Node-tree model: manifest includes full folder/page hierarchy; `--include-trash` support. |

Restore is backward-compatible: any older bundle restores cleanly into a current Marrow workspace. v3 bundles are auto-upgraded to v4 on restore.

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
