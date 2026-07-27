---
title: Export and restore walkthrough
description: Audit a v4 export bundle and verify round-trip with the CLI.
---

This walkthrough is a **founder-produced proof asset** for beachhead users who want to verify Marrow's portability claim before trusting it with real data. It walks export → bundle inspection → restore, and links to the authoritative [restore guarantee scope table](/concepts/restore-guarantee/#what-round-trips-today).

:::note[You do not need to do this on day one]
The restore guarantee is enforced by `test_round_trip.py` in CI on every commit — not by customer onboarding. This guide is for auditors who want to read the zip by hand.
:::

## What this demo covers (v4)

| In the bundle | Not in v4 (see scope table) |
| --- | --- |
| Node tree, revisions, attachments | Comments |
| `node_properties` in `manifest.json` | Share links |
| `links.json` backlink index | Folder view definitions |
| Trash state (with `--include-trash`) | Stars, Inbox, watches (user-scoped) |

Full scope: [What round-trips today](/concepts/restore-guarantee/#what-round-trips-today) · [Export bundle format](/concepts/export-format/#export-scope-v4).

## Prerequisites

- Marrow running locally ([Quickstart](/getting-started/quickstart/))
- A workspace with at least one page and an attachment (optional but recommended)
- `jq` installed (`brew install jq` on macOS)

## 1. Export a workspace

From the `api/` directory with venv active and `DATABASE_URL` pointing at your dev database:

```bash
cd api
source .venv/bin/activate
marrow export --workspace <workspace-slug> --output /tmp/marrow-demo.zip
```

Replace `<workspace-slug>` with the slug shown in the UI or returned by `GET /api/workspaces/`. The CLI writes a timestamped zip; `--output` sets the path.

To include soft-deleted nodes (trash):

```bash
marrow export --workspace <workspace-slug> --include-trash --output /tmp/marrow-demo-with-trash.zip
```

## 2. Inspect the bundle

List top-level entries:

```bash
unzip -l /tmp/marrow-demo.zip
```

You should see:

```text
manifest.json
nodes/
revisions/          # omitted in --slim exports
assets/
links.json
```

Read the manifest (schema version, node tree, properties):

```bash
unzip -p /tmp/marrow-demo.zip manifest.json | jq '.schema_version, .workspace, (.nodes | length), (.node_properties | length)'
```

Peek at a page's canonical JSON (BlockNote) and human Markdown:

```bash
# Pick a page node id from manifest.json → .nodes[]
unzip -p /tmp/marrow-demo.zip "nodes/<page-node-id>.json" | jq '.[0].type'
unzip -p /tmp/marrow-demo.zip "nodes/<page-node-id>.md" | head
```

Inspect internal links:

```bash
unzip -p /tmp/marrow-demo.zip links.json | jq '.internal_links | length'
```

Attachments land under `assets/` named by attachment ID. Folder nodes appear **only** in `manifest.json` — they have no files under `nodes/`.

See [Export bundle format](/concepts/export-format/) for the full layout reference.

## 3. Restore into a fresh database

Restore proves the bundle is self-contained. Use a **disposable** database so you do not overwrite live data.

### Option A — wipe dev Postgres (simplest)

```bash
# Stop API first if it holds connections.
# `-v` drops the Postgres volume so the database is genuinely empty —
# without it the old rows survive and restore collides on existing slugs.
docker compose down -v
docker compose up -d
cd api && alembic upgrade head

marrow restore /tmp/marrow-demo.zip
```

The CLI prints the restored workspace slug. Open the web app and confirm pages, folders, attachments, and properties match.

### Option B — separate database URL

```bash
createdb marrow_restore_test   # requires local Postgres client
DATABASE_URL=postgresql://marrow:marrow@localhost:5433/marrow_restore_test \
  alembic upgrade head
DATABASE_URL=postgresql://marrow:marrow@localhost:5433/marrow_restore_test \
  marrow restore /tmp/marrow-demo.zip
```

## 4. Verify parity

After restore, spot-check:

1. **Tree shape** — folders and pages in the same hierarchy; positions preserved.
2. **Page content** — open a JSON-format page; BlockNote content should match pre-export.
3. **Properties** — folder schema and page values on inherited properties.
4. **Backlinks** — pages that linked to each other still show backlinks in the UI.
5. **Attachments** — download an attachment from a restored page.

If anything differs, that is a **critical bug** against the restore guarantee — please [file an issue](https://github.com/marrow-software/marrow/issues/new).

## 5. What is intentionally excluded

Do not expect these to survive export→restore in **v4**:

- **Comments** on pages — planned for bundle v5
- **Share links** — planned for bundle v5
- **Folder view definitions** (table/board/list configs) — planned for bundle v5
- **Stars, Inbox notifications, watches** — user-scoped; never exported by design

Using those features in the UI is fine; they simply are not in the portable bundle yet. See the [scope table](/concepts/restore-guarantee/#what-round-trips-today).

## Next steps

- [Restore guarantee](/concepts/restore-guarantee/) — architectural foundation and CI enforcement
- [Docker Compose](/deployment/docker-compose/) — run the same flow on a production-style stack
- [Environment variables](/configuration/env-vars/) — API-key auth for single-user deployments
