---
title: Restore guarantee
description: The architectural foundation of Marrow.
---

> A Marrow export bundle must always be restorable to an exact replica of the original workspace.

This is the single non-negotiable promise Marrow makes. Every other architectural decision flows from it.

"Exact replica" means **workspace content parity** — what is in the export bundle restores identically. It does not mean every database row or per-user overlay. See [Export bundle format](/concepts/export-format/) for the on-disk layout and [What round-trips today](#what-round-trips-today) below for the full scope table.

## Why this matters

Most knowledge bases give you an "export" feature that's really a one-way escape hatch — half-broken Markdown, no metadata, no fidelity. The implicit message is: *this data lives here; if you ever leave, you'll lose something.*

Marrow inverts that. Your data is always portable, always whole. You can:

- Move from one Marrow instance to another with no fidelity loss.
- Back up your workspace as a single zip file.
- Inspect the bundle by hand — it's plain Markdown and JSON.
- Restore from a backup taken months earlier, on a different version of Marrow, and trust that the result is the same workspace.

## How the guarantee is enforced

### 1. Append-only revisions

Every save creates a new row in the `revisions` table. Existing revisions are never modified. This is enforced by a PostgreSQL trigger (`revisions_immutable()`) that raises an exception on any `UPDATE` against the table. A migration that removes this trigger is a critical bug.

### 2. Transparent bundle format

Bundles are zip files containing Markdown, JSON, and a `manifest.json`. No proprietary serialization. See [Export bundle format](/concepts/export-format/) for the layout.

### 3. The round-trip test

`api/tests/test_round_trip.py` is a regression anchor: it creates a workspace with one space, a folder/page node tree, revisions, attachments, properties, and links, exports it, wipes the database, restores from the bundle, and asserts **field-level parity over the exported scope** — organization, workspace, space, node, and revision fields all match, and attachment bytes are compared **byte-for-byte** (plus a SHA-256 check). It verifies the exported categories, not every row in the database. This test must pass at all times. It runs in CI on every change.

**You are not required to run export→restore yourself.** The guarantee is enforced by automated tests on every commit, not by customer onboarding. If you want to verify a backup by hand, see [Inspecting a bundle](/concepts/export-format/#inspecting-a-bundle) and the [export/restore walkthrough](/getting-started/export-restore-demo/).

### 4. Legacy bundle compatibility

`marrow restore` accepts bundles from earlier Marrow versions, including bundles produced before the project was renamed (the `freehold-export-*.zip` filename prefix is still recognized). The restore guarantee is **backward-compatible**: a new Marrow reads old bundles, bounded to schema **v1–v4**. (It is not a forward promise — an older Marrow is not expected to read a newer bundle.)

Marrow 0.2 introduces bundle schema **v4**, which carries the new `nodes` tree shape (folders + pages in one self-referential structure) and node soft-delete state. Older v1/v2/v3 bundles still restore: their legacy collection/page structure is auto-upgraded into the node tree on read, so a backup taken on 0.1 restores cleanly on 0.2 with no manual steps.

### 5. Soft-deleted nodes

Deleting a node sets `deleted_at` instead of removing rows — the data goes to trash. By default, exports skip soft-deleted nodes so a "live" backup matches what users see in the UI. Pass `--include-trash` to `marrow export` (or `?include_trash=true` on the API) to include them; the manifest records the choice so restore knows whether to recreate trash entries.

## What round-trips today

Bundle schema **v4** (Marrow 0.2+) is the current export format. The table below is the authoritative scope for what the restore guarantee covers today.

| Category | Included in guarantee | Notes |
| --- | --- | --- |
| **Exported today (v4)** | Node tree (folders + pages), revisions, attachments, `node_properties`, `node_links` (`links.json`), trash state (with `include_trash`) | Verified by `test_round_trip.py` in CI on every commit |
| **Never exported** | Stars (`user_stars`), Inbox notifications (`notifications`), node watches (`node_watches`) | User-scoped; workspace-independent by design |
| **Planned v5** | Comments (`comments`), share links (`share_links`), folder view definitions (`node_views`) | Collaboration metadata — requires bundle v5 before marketing these as fully portable |

**Derived state** — full-text search indices and other computed indexes — is rebuilt on restore, not exported. The bundle carries source content only.

For file layout and manifest fields, see [Export bundle format](/concepts/export-format/#export-scope-v4).

## What this rules out

The guarantee imposes constraints contributors should be aware of:

- **No silent migrations** of revision content. If revision data needs reformatting, it happens at read time, not by editing rows.
- **No proprietary blobs** in the export bundle. Every value must be representable in plain text or standard formats.
- **No hidden state.** Attachments live in the bundle. Search indices are derived state and rebuilt on restore.
- **No "this only works in v1.0+" features.** Adding capability is fine; breaking restore for any older bundle is not.

If you're proposing a change that conflicts with the restore guarantee, the change is wrong.
