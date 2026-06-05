# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Keep this file up to date.** Whenever a meaningful change is made — new routes, schema changes, new components, new environment variables, new constraints, or architectural decisions — update the relevant section here before closing out the task. Treat CLAUDE.md as living documentation.

**For every feature request:** create a GitHub issue to track it, then create a dedicated git branch off `main` before writing any code. Branch names should follow the pattern `feature/<short-description>` or `fix/<short-description>`. Never implement features directly on `main`.

---

## Project Overview

Marrow is a self-hosted, open-source knowledge base (wiki) built around a non-negotiable **restore guarantee**: a Marrow export bundle must always be restorable to an exact replica of the original workspace. This guarantee is the architectural foundation — every decision flows from it.

Current status: **v0.1 MVP** — core hierarchy, append-only revisions, export/restore, file attachments, and a working Next.js frontend are all implemented and tested.

---

## Tech Stack

- **Backend**: FastAPI (Python 3.11+), located in `api/`
- **Database**: PostgreSQL 16 (docker-compose maps to port 5433)
- **Migrations**: Alembic
- **Auth**: OIDC authentication (any IdP) with API key fallback — see `api/marrow/auth.py`
- **Search**: PostgreSQL full-text search; Meilisearch/OpenSearch later
- **Frontend**: Next.js 16 (React 19), located in `web/` (app) and `web-marketing/` (public marketing site — Landing/Product/Pricing, shared chrome)
- **Frontend (product app)**: Next.js 16 (React 19), located in `web/` — serves `app.marrow.so`
- **Frontend (marketing site)**: Next.js 16, located in `web-marketing/` — serves `marrow.so` + `www.marrow.so` via Cloudflare Pages
- **Storage**: Pluggable adapter interface — local filesystem and Cloudflare R2 are implemented
- **CLI**: Typer (`marrow export` / `marrow restore`)

### Deployment paths — two distinct targets

| Target | `web/` deploy | `api/` deploy | Triggered by |
|--------|--------------|---------------|--------------|
| **SaaS** (`marrow.so`) | OpenNext → Cloudflare Worker (`wrangler deploy`) | Docker image → Fly.io (`flyctl deploy`) | `v*` git tag |
| **Self-hosted Docker** | `web/Dockerfile` → standalone Next.js image | `api/Dockerfile` → FastAPI image | manual / `docker-compose.prod.yml` |

**API deployment (SaaS):** The API runs on Fly.io (`marrow-api` app, `iad` region, `shared-cpu-1x` 256MB). Config lives in `api/fly.toml`. Non-secret env vars are in `[env]`; secrets are set via `flyctl secrets set -a marrow-api`. CI deploys with `flyctl deploy --image ghcr.io/spmcgraw/marrow-api:<tag> --strategy rolling` using the `FLY_API_TOKEN` GitHub secret.

**Critical:** `web/Dockerfile` is **not** part of the SaaS deployment path and is **not** built by `release.yml`. It exists solely for self-hosted Docker Compose users. Never add it back to `release.yml`'s image build job — `@opennextjs/cloudflare` devDependencies pull in platform-specific Cloudflare/esbuild binaries that cause `npm ci` to fail in the Node 20 Docker build environment.

**npm version constraint:** `web/Dockerfile` uses `node:20-alpine` (npm v10). If `web/package-lock.json` must be regenerated, use `node:20` / npm v10 — or switch the Dockerfile base to match your local node version. Lock files generated with npm v11+ may omit optional platform-specific packages that npm v10 `npm ci` expects to find.

---

## Development Setup

```bash
# Start PostgreSQL
docker compose up -d

# Backend
cd api
python -m venv venv && source venv/bin/activate
pip install -e ".[dev]"           # installs from pyproject.toml including dev deps
cp .env.example .env              # configure DB connection, storage, API key, CORS
alembic upgrade head              # run migrations
uvicorn main:app --reload         # starts on http://localhost:8000

# Frontend
cd web
npm install
cp .env.local.example .env.local  # optionally override MARROW_API_URL / MARROW_API_KEY
npm run dev                       # starts on http://localhost:3000
```

### Environment Variables

**Backend (`api/.env`)**:

```env
DATABASE_URL=postgresql://marrow:marrow@localhost:5433/marrow
SECRET_KEY=changeme
STORAGE_PATH=./storage       # resolves relative to api/ directory
API_KEY=                     # optional; if set, enforces X-API-Key header on all routes
CORS_ORIGINS=http://localhost:3000

# Cloudflare R2 storage (optional — set STORAGE_BACKEND=r2 to use R2 instead of local disk)
# STORAGE_BACKEND=r2
# R2_ACCOUNT_ID=             # your Cloudflare account ID
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_BUCKET=

# OIDC Authentication (optional — omit OIDC_ISSUER to disable)
# OIDC_ISSUER=https://accounts.google.com
# OIDC_CLIENT_ID=
# OIDC_CLIENT_SECRET=
# OIDC_REDIRECT_URI=http://localhost:8000/api/auth/callback
# FRONTEND_URL=http://localhost:3000
# COOKIE_DOMAIN=localhost    # shared domain for session cookie (dev: localhost)
```

**Frontend (`web/.env.local`)**:

Read at runtime (not build time) — the container generates `/public/config.js` from these at startup, so the prebuilt image works for any deployment without rebuilding. In dev (`npm run dev`), defaults work; only set these to override.

```env
# MARROW_API_URL=http://localhost:8000   # browser-visible API origin
# MARROW_API_KEY=                        # must match API_KEY in backend .env if set
# MARROW_OIDC_ENABLED=                   # "true" when OIDC is configured on the backend
```

---

## Common Commands

```bash
# Backend tests (integration — require a running database)
cd api && pytest
cd api && pytest tests/path/to/test_file.py::test_function

# Backend linting/formatting
cd api && ruff check .
cd api && ruff format .

# Database migrations
cd api && alembic revision --autogenerate -m "description"
cd api && alembic upgrade head
cd api && alembic downgrade -1

# CLI (export/restore/trash)
cd api && marrow export --workspace <slug> --output <path>
cd api && marrow restore <bundle.zip>
cd api && marrow purge-trash --older-than-days 30   # hard-delete old trashed nodes (cron'able)

# Product frontend (web/)
cd web && npm run dev
cd web && npm run build
cd web && npm run lint
cd web && npm test

# Marketing site (web-marketing/) — runs on port 3001 in dev
cd web-marketing && npm run dev
cd web-marketing && npm run build
cd web-marketing && npm run lint
cd web-marketing && npm run pages:build   # Cloudflare Pages adapter build
```

---

## Repository Layout

```text
marrow/
├── api/                              # FastAPI backend
│   ├── main.py                       # Entry point (re-exports app from marrow.app)
│   ├── pyproject.toml                # Dependencies and CLI entry point (`marrow`)
│   ├── alembic.ini
│   ├── .env.example
│   ├── alembic/
│   │   └── versions/
│   │       ├── 69d839126d73_create_core_schema.py
│   │       ├── d3981f696939_add_full_text_search.py
│   │       ├── 35eb203afc65_add_users_table.py
│   │       ├── 0999ffe7b838_add_organizations_and_rbac.py
│   │       ├── c333d20a46d9_add_content_format_to_revisions.py
│   │       ├── bd52bac0673f_node_tree_schema_collapse_collections_.py
│   │       ├── 2b5326d2d299_add_rls_tenant_isolation.py
│   │       ├── fdf65c08ffa8_add_node_fts_triggers_and_gin_index.py
│   │       ├── c58f38d0a5aa_add_billing_columns_to_organizations.py
│   │       ├── e3f7a92b1d05_add_members_can_create_spaces_to_orgs.py
│   │       ├── 63d0b2f71a42_add_notifications_table.py
│   │       ├── 94d64b4e6869_add_node_watches_table.py
│   │       ├── 2187bd1a529d_add_node_properties_table.py
│   │       ├── 305b120ceb16_add_comments_table.py
│   │       ├── 3ee68ab5ba33_add_node_views_table.py
│   │       ├── 5441fe9ca011_add_share_links_table.py
│   │       ├── ac1e5d8ab0f8_add_node_links_backlink_index.py
│   │       ├── cd990242773c_add_user_stars_table.py
│   │       └── 70645242437d_merge_swarm_v0_2_migrations.py
│   ├── marrow/                       # Main package
│   │   ├── app.py                    # FastAPI app factory, CORS + session middleware
│   │   ├── auth.py                   # OIDC config, session JWT helpers, cookie params
│   │   ├── db.py                     # SQLAlchemy session management
│   │   ├── dependencies.py           # FastAPI dependency providers (auth, db session, search)
│   │   ├── rbac.py                   # Role-based access control dependency factories
│   │   ├── models.py                 # SQLAlchemy ORM models (incl. User)
│   │   ├── schemas.py                # Pydantic request/response schemas (incl. AuthStatus)
│   │   ├── fractional_index.py       # Fractional index helpers: between(a,b), after(a)
│   │   ├── search.py                 # SearchBackend ABC + PostgresSearchBackend
│   │   ├── storage.py                # StorageAdapter ABC + LocalFilesystemAdapter
│   │   ├── export.py                 # Export workspace → zip bundle
│   │   ├── restore.py                # Restore workspace ← zip bundle
│   │   ├── cli.py                    # Typer CLI (export, restore commands)
│   │   └── routers/
│   │       ├── auth.py               # OIDC login/callback/me/logout + personal org creation
│   │       ├── organizations.py      # Org CRUD, member management (invite, role, remove)
│   │       ├── workspaces.py
│   │       ├── spaces.py
│   │       ├── nodes.py               # Node CRUD, revisions, attachments, star/unstar (#124, #102)
│   │       ├── share_links.py         # View-only sharing links + public /shared/{token} (#40)
│   │       ├── comments.py            # Page-level comments: CRUD, resolve, replies (#101)
│   │       ├── users.py               # GET /api/users/me/starred (#102)
│   │       └── properties.py          # Node property schemas + values (#42)
│   │       ├── nodes.py              # Node CRUD, revisions, attachments (#124)
│   │       └── views.py             # Node views CRUD (table/board/list, #44)
│   │       # Node CRUD/tree routes land in #124 (2.0b); old collection/page routers
│   │       # were removed by the v0.2 schema migration (#123).
│   ├── tests/
│   │   ├── test_fractional_index.py  # Unit tests for fractional_index helpers
│   │   ├── test_models_smoke.py
│   │   ├── test_migration_cycle.py
│   │   ├── test_auth.py              # Auth dependency, JWT, and auth router tests
│   │   ├── test_rbac.py              # Role enforcement matrix (owner/editor/viewer × CRUD)
│   │   ├── test_export.py
│   │   ├── test_restore.py
│   │   ├── test_round_trip.py        # Critical regression anchor
│   │   └── test_search.py            # FTS trigger + search scoping tests
│   └── storage/                      # Default local attachment storage (gitignored)
│
├── web/                              # Next.js frontend
│   ├── proxy.ts                      # Route protection (redirects to /login when OIDC enabled)
│   ├── app/
│   │   ├── page.tsx                  # Root → redirects to /workspaces
│   │   ├── layout.tsx                # Root layout with theme provider
│   │   ├── login/page.tsx            # SSO login page (shown when OIDC enabled)
│   │   ├── auth/callback/page.tsx    # Post-OIDC callback landing page
│   │   ├── orgs/[orgId]/settings/page.tsx  # Org member management UI
│   │   ├── orgs/[orgId]/admin/page.tsx     # Admin dashboard — renders section via ?section=
│   │   ├── orgs/[orgId]/admin/layout.tsx   # Admin shell: left nav + owner-only gate
│   │   ├── workspaces/page.tsx       # Workspace list + creation
│   │   └── w/[workspaceId]/
│   │       ├── layout.tsx            # Workspace shell with sidebar + auth status
│   │       ├── page.tsx              # Welcome screen / empty state
│   │       └── n/[nodeId]/[[...slug]]/
│   │           └── page.tsx          # Node route — renders PageEditor (type='page') or FolderView (type='folder'). Slug suffix is optional and decorative.
│   ├── components/
│   │   ├── admin/                    # Admin dashboard section components
│   │   │   ├── mission-control-section.tsx  # Overview cards + workspace list
│   │   │   ├── users-section.tsx     # Member management (reused from org settings)
│   │   │   ├── spaces-section.tsx    # Spaces grouped by workspace
│   │   │   └── stub-section.tsx      # Placeholder for not-yet-built sections
│   │   ├── app-sidebar.tsx           # Tree nav: Spaces → recursive nodes (folders/pages), drag-and-drop, inline create
│   │   ├── folder-view.tsx           # Folder landing page: breadcrumb + children list
│   │   ├── search-dialog.tsx         # Cmd+K search dialog
│   │   ├── export-dialog.tsx         # Export workspace dialog (full / slim, size estimate)
│   │   ├── restore-dialog.tsx        # Restore workspace from bundle dialog (drag-and-drop upload)
│   │   ├── share-dialog.tsx          # Create/list/revoke view-only share links for a node (#40)
│   │   ├── page-editor.tsx           # Title + markdown textarea, auto-save, attachments, revisions
│   │   └── ui/                       # Shadcn/Base UI components
│   ├── lib/
│   │   ├── api.ts                    # apiFetch helper + all API client functions
│   │   ├── types.ts                  # TypeScript interfaces mirroring API schemas
│   │   ├── fractional-index.ts       # Wrappers around fractional-indexing npm package
│   │   └── utils.ts
│   └── hooks/
│
├── web-marketing/                    # Next.js marketing site (marrow.so + www)
│   ├── wrangler.toml                 # Cloudflare Pages config (project: marrow-marketing)
│   ├── next.config.ts                # Standard Next.js config (Docker / local)
│   ├── next.config.pages.ts          # Cloudflare Pages build config (next-on-pages)
│   ├── app/
│   │   ├── layout.tsx                # Root layout + metadata
│   │   ├── page.tsx                  # Homepage (Nav + Hero + Features + Footer)
│   │   └── globals.css               # Design tokens + Google Fonts import
│   └── components/
│       ├── nav.tsx                   # Top nav with GitHub + Docs + "Open app" links
│       ├── hero.tsx                  # Above-the-fold hero section
│       ├── features.tsx              # Feature grid (only existing features)
│       └── footer.tsx                # Footer with links
│
├── docs/                             # Astro Starlight docs site (user-facing)
│   ├── astro.config.mjs              # Sidebar nav + site metadata
│   ├── package.json
│   └── src/content/docs/             # Markdown/MDX content (getting-started, deployment, configuration, concepts)
│
├── references/                       # Internal-only reference docs (PRDs, brand)
│   └── design-tokens.md              # Marrow's brand reference — NOT published
│
├── api/Dockerfile                    # Multi-stage Python 3.12 image — built by release.yml, deployed to Fly.io
├── api/fly.toml                      # Fly.io config for the API (SaaS deploy path)
├── web/Dockerfile                    # Multi-stage Node 20 image (Next.js standalone) — self-hosted Docker Compose ONLY
│                                     # NOT built by release.yml; web SaaS deploy uses OpenNext → Cloudflare Workers
├── web/wrangler.toml                 # Cloudflare Workers config for the web app (OpenNext)
├── docker-compose.yml                # Dev: PostgreSQL 16 only (port 5433)
├── docker-compose.prod.yml           # Prod: db + api + web stack (self-hosted path)
├── .env.prod.example                 # Prod env vars (root, used by compose)
├── .github/workflows/
│   ├── ci.yml                        # PR + push: api lint+test, web build, docs build
│   ├── marketing.yml                 # web-marketing/ path-filtered CI + Cloudflare Pages deploy
│   ├── release.yml                   # tags only: build/push API image to GHCR, deploy API → Fly.io + web → Cloudflare Workers
│   └── codeql.yml                    # Weekly CodeQL analysis
├── CLAUDE.md                         # This file
├── README.md
└── LICENSE                           # Apache 2.0
```

---

## Architecture

### Data Model

```text
organizations → org_memberships (user roles: owner/editor/viewer)
             → workspaces → spaces → nodes (self-referential tree; type ∈ {folder, page})
                                            → revisions  (append-only, pages only)
                                            → attachments
                              audit_events (future)
                              tasks / task_integrations (future)
```

**Tables** (all use UUIDs, timezone-aware timestamps):

| Table | Key columns |
| --- | --- |
| organizations | id, slug (unique), name, members_can_create_spaces (bool, default true) |
| org_memberships | id, org_id (FK), user_id (FK, nullable for pending), email, role (owner/editor/viewer) |
| workspaces | id, org_id (FK), slug (unique), name |
| spaces | id, workspace_id (FK cascade), slug (unique per workspace), name |
| nodes | id, space_id (FK cascade), parent_id (self-FK cascade, nullable for space-root), type ('folder'\|'page'), name, slug, position (TEXT — fractional index), description (folders), current_revision_id (deferred FK, pages), search_vector (tsvector, pages), deleted_at (nullable) |
| revisions | id, node_id (FK cascade — must reference type='page'), content (TEXT), content_format ('markdown'\|'json') — **immutable via PG trigger** |
| attachments | id, node_id (FK cascade), filename, hash (SHA256), size_bytes |
| node_links | id, source_node_id (FK cascade), target_node_id (FK cascade), unique (source, target) — backlink index, reconciled on every page save |
| comments | id, node_id (FK cascade, page-only — app-enforced), author_user_id (FK SET NULL, nullable), parent_comment_id (self-FK cascade, nullable for replies), body (TEXT), resolved_at (nullable), created_at, updated_at |
| node_properties | id, node_id (FK cascade), key, value (nullable), value_type, options (JSON list — select types), updated_at; unique (node_id, key); value_type ∈ {text, number, date, select, multi-select, checkbox} |
| node_views | id, folder_node_id (FK cascade → nodes), name, view_type ('table'\|'board'\|'list'), position (TEXT), config (JSONB: sorts/filters/group_by/visible_properties) |
| users | id, oidc_issuer, oidc_subject (unique together), email, name, last_login_at |
| share_links | id, node_id (FK cascade), token (unique), created_by (FK users, SET NULL), expires_at (nullable), created_at |
| user_stars | id, user_id (FK cascade), node_id (FK cascade), created_at — unique on (user_id, node_id); per-user, **never exported** |
| notifications | id, user_id (FK cascade), kind (mention\|comment_reply\|share_request\|watch_event), payload (JSONB), read_at (nullable), created_at — user-scoped Inbox feed; **never exported** |
| node_watches | id, user_id (FK cascade), node_id (FK cascade), unique on (user_id, node_id) — **not exported** |

**Node shape constraint**: A CHECK constraint (`nodes_shape_by_type`) enforces that folder rows have `current_revision_id` and `search_vector` NULL, while page rows have `description` NULL. A second CHECK on `revisions` (`revisions_node_is_page`) ensures revisions only reference page-typed nodes.

**Slug uniqueness**: Two partial unique indexes — `(space_id, slug) WHERE parent_id IS NULL AND deleted_at IS NULL` for space-root nodes, and `(parent_id, slug) WHERE parent_id IS NOT NULL AND deleted_at IS NULL` for nested nodes. Soft-deleted rows are excluded so trash doesn't block re-creating a slug.

**Revision immutability**: A PL/pgSQL trigger (`revisions_immutable()`) raises an exception on any `UPDATE` against the `revisions` table. This enforces the append-only constraint at the database level.

**Deferred FK**: `nodes.current_revision_id → revisions.id` is a deferred constraint, allowing a node and its first revision to be created in a single transaction.

**Comments**: Page-level only for v1; `node_id` must reference a `type='page'` node, enforced in `routers/comments.py` (the issue explicitly allowed check-or-app-level). One level of replies via `parent_comment_id` (nested replies are rejected with 400). Resolve = setting `resolved_at`. A future `block_id` column can be added additively for block-level comments without a breaking migration. RLS `tenant_isolation` is enabled on `comments` via the node-indirect tenant expression, identical to `revisions`/`attachments`. Comments are **not yet in the export bundle** — they ride along with the node-aware export/restore rewrite (bundle v4, #132/#133); until then `export.py`/`restore.py` remain pre-existing broken stubs for the v0.2 transition.

### API Routes Summary

All routes are prefixed with `/api`. Authentication is enforced via session cookie (OIDC), `X-API-Key` header, or anonymous access (when neither is configured). Auth routes are unauthenticated.

| Method | Path | Description | Min Role |
| --- | --- | --- | --- |
| GET | /health | Health check | — |
| GET | /api/auth/login | Redirect to OIDC provider | — |
| GET | /api/auth/callback | OIDC callback — exchanges code, sets session cookie, claims pending memberships | — |
| GET | /api/auth/me | Current auth status and user info | — |
| POST | /api/auth/logout | Clear session cookie | — |
| GET/POST | /api/orgs | List user's orgs / create org | session |
| GET | /api/orgs/{oid} | Get org details | viewer |
| PATCH | /api/orgs/{oid} | Update org settings (members_can_create_spaces) | owner |
| GET | /api/orgs/{oid}/members | List members (incl. pending) | viewer |
| POST | /api/orgs/{oid}/members | Invite member by email | owner |
| PATCH | /api/orgs/{oid}/members/{mid} | Change member role | owner |
| DELETE | /api/orgs/{oid}/members/{mid} | Remove member | owner |
| POST | /api/orgs/{oid}/workspaces | Create workspace in org (#129) | editor |
| GET | /api/workspaces/ | List workspaces | viewer |
| POST | /api/workspaces/ | **410 Gone** — use POST /api/orgs/{oid}/workspaces | — |
| GET/DELETE | /api/workspaces/{id} | Get / delete workspace | viewer/owner |
| GET | /api/workspaces/{id}/tree | Full hierarchy (sidebar) | viewer |
| GET | /api/workspaces/{id}/search?q= | Full-text search across workspace pages | viewer |
| GET | /api/workspaces/{id}/export?slim=false | Download workspace as zip bundle | viewer |
| GET | /api/workspaces/{id}/export/estimate | Pre-compression byte estimates for full & slim exports | viewer |
| POST | /api/workspaces/restore | Restore a workspace from an uploaded export bundle zip | — |
| GET/POST | /api/workspaces/{id}/spaces/ | List / create spaces | viewer/editor |
| GET/DELETE | /api/workspaces/{id}/spaces/{sid} | Get / delete space | viewer/owner |
| GET | /api/workspaces/{id}/trash | List top-level trashed nodes | viewer |
| POST | /api/nodes/{id}/restore | Restore a trashed node + subtree (422 if parent still trashed) | editor |
| DELETE | /api/nodes/{id}/purge | Hard-delete a trashed node and its subtree | owner |
| GET/POST | /api/nodes/{node_id}/share-links | List / create view-only share links | viewer/editor |
| DELETE | /api/share-links/{link_id} | Revoke a share link | editor |
| GET | /shared/{token} | **Unauthenticated** read-only view of a shared node (page content or folder subtree) | — |
| GET/POST | /api/nodes/{nid}/comments | List / create page comments (optional `parent_comment_id` for replies) | viewer/editor |
| PATCH | /api/comments/{cid} | Edit body and/or resolve/unresolve (`{"resolved": true\|false}`) | editor |
| DELETE | /api/comments/{cid} | Delete a comment | editor + (author or org owner) |
| GET | /api/users/me/starred | List current user's starred nodes (trashed excluded) | session |
| POST | /api/nodes/{nid}/star | Star a node (idempotent) | viewer |
| DELETE | /api/nodes/{nid}/star | Unstar a node | viewer |
| GET | /api/nodes/{nid}/watching | Whether the current user watches this node | viewer |
| POST | /api/nodes/{nid}/watch | Watch a node (idempotent) | viewer |
| DELETE | /api/nodes/{nid}/watch | Stop watching a node | viewer |
| GET | /api/users/me/notifications?unread_only= | List own Inbox notifications + unread_count | session |
| PATCH | /api/notifications/{nid} | Mark a notification read | session |
| POST | /api/users/me/notifications/read-all | Mark all own notifications read | session |
| GET | /api/nodes/{id}/property-schema | List a folder's property schema defs | viewer |
| PUT/DELETE | /api/nodes/{id}/property-schema/{key} | Define/update / remove a folder schema property | editor |
| GET | /api/nodes/{id}/properties | Effective properties for a page (inherited + own) | viewer |
| PUT/DELETE | /api/nodes/{id}/properties/{key} | Set / clear a page's property value | editor |
| GET/POST | /api/nodes/{node_id}/views | List / create views on a folder node | viewer/editor |
| GET | /api/views/{view_id} | Get a single view | viewer |
| PATCH/DELETE | /api/views/{view_id} | Update / delete a view | editor |

> **Node views (#44, 2.5):** A folder node can have any number of saved
> `node_views` (table / board / list). `config` is JSONB holding `sorts`,
> `filters`, `group_by` (board columns), and `visible_properties` (table
> columns). Views render the folder's descendant *page* nodes using their
> properties (#42). Views are presentation-only — CRUD never touches nodes.
> `rbac.require_view_role` resolves view → folder node → org for role checks.
> Frontend: `lib/api.ts` `*NodeView` helpers + `components/folder-views.tsx`
> (presentational switcher; wiring into the node-aware sidebar lands with the
> frontend node rewrite). Export of view definitions lands with bundle v4 (#132).

> **Share links (#40):** `share_links` grant view-only public access to a node.
> `GET /shared/{token}` requires no account: a page returns its current
> revision content; a folder returns its visible (non-trashed) subtree
> recursively. Expired links return 410, unknown/revoked return 404. The
> public endpoint relies on RLS treating an unset `app.current_org` as
> unrestricted (same pattern as the API-key/dev path). Export/restore
> integration ("bundle v4") is **deferred**: `export.py`/`restore.py` still
> reference removed Page/Collection classes and NameError at runtime until the
> #132/#133 rewrites land — share links should be added to the bundle there.
>
> **Note (#123 → #125):** v0.1's collection-scoped and global page routes were removed by the schema migration. Node CRUD/tree/attachment/revision routes land in #124 (2.0b) under `/api/nodes/...` and `/api/spaces/{sid}/nodes`. The workspace `/search` endpoint is node-aware as of #125 (2.0c). The `/tree`, `/export`, and `/restore` endpoints are still wired but their handlers will NameError at runtime until the node-aware rewrites land in #124, #132, and #133.
>
> **Watches & notifications (#103/#104):** `notifications` is a user-scoped Inbox feed; `create_notification()` in `marrow/notifications.py` is the single insertion point. `marrow/watches.py` fans out `watch_event` notifications: on a page save (`update_node` revision create), every watcher of the page **or any ancestor folder** is notified, excluding the acting user. Both tables are deliberately excluded from export/restore (user-scoped, workspace-independent) — the round-trip guarantee is unaffected.
>
> **Search response shape (v0.2):** `SearchResultItem` fields are `node_id`, `name`, `snippet`, `space_id`, `space_name`, `node_path` (list of ancestor folder names, root→leaf), `rank`. The old `page_id`, `title`, `collection_id`, `collection_name` fields are gone.
>
> **Backlinks (#100, 2.6):** `GET /api/nodes/{nid}/backlinks` returns the nodes that link to `{nid}` (min role `viewer`, trashed sources excluded). `marrow/links.py` parses wiki-links and reconciles the `node_links` table on every page create/update via `reconcile_node_links()`. Export/restore calls `serialize_node_links()` / `rebuild_node_links()` to persist the index in `links.json`.
> **Node properties (#42, 2.4):** Folder nodes declare a property schema (key + `value_type` + `options`); every descendant page inherits it (nearest-ancestor wins) and may set its own value. Effective properties resolve at read time via the ancestor folder chain. Property keys+values fold into the page `search_vector` at weight C — a single `marrow_node_search_vector(uuid)` SQL helper computes the full vector and all node search triggers (revision-insert, name-change, and the new `node_properties` change trigger) keep it consistent. Frontend: `web/components/property-editor.tsx` renders chips/date pickers/dropdowns/checkboxes below the page title. Export/restore bundle bumped to **v4** (`node_properties` array in `manifest.json`); the v4 export/restore *handlers* still depend on the #132/#133 node-aware rewrite to run end-to-end, but the property serialization (`export.serialize_node_properties`) and restore loop are in place and symmetric.

### Storage Adapter Interface

```python
class StorageAdapter(ABC):
    def read(self, attachment_id: str, filename: str) -> bytes: ...
    def write(self, attachment_id: str, filename: str, data: bytes) -> None: ...
```

`LocalFilesystemAdapter` stores files at `{STORAGE_PATH}/{attachment_id}/{filename}`. New backends implement this interface without touching any other code.

### Export Bundle Format

```text
marrow-export-{workspace-slug}-{timestamp}.zip          # full
marrow-export-{workspace-slug}-slim-{timestamp}.zip     # slim
├── manifest.json        # workspace + org metadata, full node tree, schema version (v4)
├── pages/
│   ├── {node-id}.md     # human-readable Markdown (page-typed nodes)
│   └── {node-id}.json   # canonical BlockNote JSON (JSON-format pages only)
├── revisions/
│   └── {node-id}/
│       ├── {revision-id}.md     # Markdown revisions (legacy) or human-readable export
│       └── {revision-id}.json   # BlockNote JSON revisions (canonical)
├── assets/
│   └── {attachment-id}{ext}
└── links.json           # internal links, broken links, orphaned pages
```

**Schema versions**: v1/v2 were Markdown-only. v3 added `.json` as canonical. v4 (Marrow 0.2) carries the `nodes` tree (folders + pages, with `parent_id`, `position`, `deleted_at`) instead of the old `collections`+`pages` shape. Restore supports v1–v4 — older bundles are auto-upgraded onto the node tree on read.
v1/v2 bundles had only `.md` files. v3 adds `.json` as canonical for JSON-format revisions.
v4 adds a `node_properties` array to `manifest.json` (folder schemas + page values).
Restore supports v1, v2, v3, and v4 bundles.

**Slim bundles** omit the `revisions/` directory entirely and set `"slim": true` + `"revisions": []` in `manifest.json`. Restore recreates one revision per page from `pages/` content. CLI: `marrow export --slim`; API: `?slim=true`.

**Trash**: soft-deleted nodes are excluded from exports by default. Pass `marrow export --include-trash` (or `?include_trash=true`) to include them; the manifest records `"include_trash": bool` so restore replays each node's `deleted_at`.

### Authentication

Marrow supports three authentication methods, checked in priority order:

1. **OIDC session cookie** (`marrow_session`): A JWT signed with `SECRET_KEY` (HS256), issued after successful OIDC login. Contains `sub` (user UUID), `email`, `name`, with 24h expiry.
2. **API key** (`X-API-Key` header): Static key matching `API_KEY` env var. Used by CLI and scripts. **Bypasses all RBAC checks** (superuser equivalent).
3. **Anonymous**: When neither OIDC nor API key is configured, all requests are allowed (dev mode). **Bypasses all RBAC checks**.

**OIDC flow**: The backend is the OIDC Relying Party. `GET /api/auth/login` redirects to the IdP. `GET /api/auth/callback` exchanges the code, upserts the user in the `users` table, claims any pending org memberships matching the user's email, auto-creates a personal org if the user has no memberships, and sets an httpOnly session cookie. The `COOKIE_DOMAIN` env var controls the cookie domain (set to `localhost` for dev so the cookie is shared between `:3000` and `:8000`).

**RBAC**: Org membership with roles (owner/editor/viewer) enforced on all data routes. Role is resolved by following the resource chain (node → space → workspace → org → membership). Dependency factories in `rbac.py` handle resolution for each resource level.

**Key files**: `auth.py` (config, JWT helpers), `dependencies.py` (`verify_auth` + `AuthContext`), `rbac.py` (role enforcement dependencies), `routers/auth.py` (login/callback/me/logout), `routers/organizations.py` (org CRUD + member management).

### Frontend Patterns

- **API client** (`lib/api.ts`): all server calls go through `apiFetch<T>()` which injects auth headers and handles errors
- **Auto-save**: `PageEditor` debounces saves 2 seconds after last keystroke; shows Saving… / Saved / Error status
- **Content format**: new saves store BlockNote JSON (`content_format='json'`); legacy Markdown revisions are loaded via `tryParseMarkdownToBlocks` for backward compat
- **Editor features**: code blocks (Shiki syntax highlighting), tables (`TableHandlesController`), `@` member mentions (custom inline-content spec carrying `userId` + `displayName`, fed by `listOrgMembers`), `/page` slash item that opens a page picker and inserts a WikiLink (`searchWorkspace`)
- **Sidebar create flows**: hover-to-reveal `+` buttons (FilePlus / FolderPlus) on each folder and space header create new nodes via `createNode()` with `parent_id` set; slug auto-generated via `slugify()`. Tree open/closed state persists in `localStorage` keyed by `marrow.tree.open.<userId>.<workspaceId>`.
- **Sidebar drag-and-drop**: `@dnd-kit/core` drives reparenting and reordering of folders/pages. New positions are computed via `fractional-indexing.generateKeyBetween()` and PATCHed to `/api/nodes/{id}` with `parent_id` + `position`. Cross-workspace drops and descendant-cycle drops are rejected with a `sonner` toast. Server is the source of truth — failures rollback via `router.refresh()`.
- **Comments**: `useComments(nodeId)` hook (`hooks/use-comments.ts`) owns thread state; `CommentsDrawer` renders threads/composer/resolve and `CommentBubbleFab` shows the unread badge. Unread = comments created after the viewer's last drawer visit, tracked client-side in `localStorage` (`marrow:comment-visit:<nodeId>`) — deliberately simple v1 heuristic, no backend visit table
- **Inbox**: `rail-panels/inbox-panel.tsx` lists notifications with kind-specific icons/copy and an empty state; `WorkspaceShell` fetches the unread count on mount and `AppRail` renders an unread badge on the Inbox tab. Backend delivery lives in `api/marrow/notifications.py` — `@`-mention saves on page nodes notify newly-mentioned users (only mentions new vs. the prior revision; the actor is never self-notified). Notifications are user-scoped and deliberately excluded from export/restore.
- **UI library**: Base UI (`@base-ui/react`) with Tailwind CSS 4 — uses `render` prop pattern, not `asChild`
- **Theme**: `next-themes` wraps the root layout

---

## Core Constraints

These constraints are non-negotiable and must be respected in all contributions:

1. **Restore guarantee**: `marrow restore <bundle.zip>` must reproduce a workspace exactly from any valid export bundle. A failing restore test is a critical bug.
2. **Append-only revisions**: saves always create new revisions; existing revisions are never modified or deleted. The database trigger enforces this — do not remove it.
3. **Transparent export format**: export bundles must remain human-readable without tooling (Markdown + JSON, no proprietary blobs).
4. **Pluggable storage**: business logic must not bypass the storage adapter interface. Never call filesystem APIs directly from routers or models.

---

## Test Strategy

Tests in `api/tests/` are **integration tests** — they hit a real database. A fresh test database is created per run and dropped after.

- `test_round_trip.py` is the critical regression anchor: it does a full create → export → wipe → restore → verify cycle. This test must pass at all times.
- `FakeStorageAdapter` (in-memory) is used in tests so no filesystem is needed.
- Run `pytest` from `api/` with the venv active and a running PostgreSQL instance.

---

## What's Not Built Yet

- Meilisearch upgrade for fuzzy/typo-tolerant search (PostgreSQL FTS is implemented)
- Workspace-level / per-node access control (OIDC + org RBAC are implemented; finer-grained ACLs are not)
- Audit log / audit_events table
- Task management and integrations
- K8s and systemd deployment guides (Docker Compose is documented)
- Page templates
