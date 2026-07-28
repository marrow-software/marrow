# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Keep this file up to date.** Whenever a meaningful change is made — new routes, schema changes, new components, new environment variables, new constraints, or architectural decisions — update the relevant section here before closing out the task. Treat CLAUDE.md as living documentation.

**When cutting a release:** add a `CHANGELOG.md` entry (Keep a Changelog format) for the new version, and draft the fuller narrative notes on the GitHub release.

**For every feature request:** create a GitHub issue to track it, then create a dedicated git branch off `main` before writing any code. Branch names should follow the pattern `feature/<short-description>` or `fix/<short-description>`. Never implement features directly on `main`.

---

## Project Overview

Marrow is a self-hosted, open-source knowledge base (wiki) built around a non-negotiable **restore guarantee**: a Marrow export bundle must always be restorable to an exact replica of the original workspace. This guarantee is the architectural foundation — every decision flows from it.

Current status: **v0.4.x** — beachhead activation shipped (solo-first onboarding, workspace provisioning on onboard, self-host-first marketing, export/restore docs). Node tree (folders + pages), v4 export/restore, OIDC + org RBAC, BlockNote editor, comments, properties, backlinks, page archiving, SaaS billing gates, and global `/home` landing are implemented and tested. Comments, share links, and folder view definitions are not yet in export bundles (planned bundle v5). **Active product track:** wayfinder map [#258](https://github.com/marrow-software/marrow/issues/258) (and its child tickets) — do not open parallel backlog tracks.

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

**API deployment (SaaS):** The API runs on Fly.io (`marrow-api` app, `iad` region, `shared-cpu-1x` 256MB). Config lives in `api/fly.toml`. Non-secret env vars are in `[env]`; secrets are set via `flyctl secrets set -a marrow-api`. CI deploys with `flyctl deploy --image ghcr.io/marrow-software/marrow-api:<tag> --strategy rolling` using the `FLY_API_TOKEN` GitHub secret. **Migrations run automatically on deploy:** `api/fly.toml` `[deploy] release_command = "alembic upgrade head"` runs in a temporary machine (same image + secrets) before traffic shifts; a failure aborts the deploy. It uses the `DATABASE_URL` secret, which `alembic/env.py` resolves into `sqlalchemy.url`.

**Critical:** `web/Dockerfile` is **not** part of the SaaS deployment path and is **not** built by `release.yml`. It exists solely for self-hosted Docker Compose users. Never add it back to `release.yml`'s image build job — `@opennextjs/cloudflare` devDependencies pull in platform-specific Cloudflare/esbuild binaries that cause `npm ci` to fail in the Node 20 Docker build environment.

**npm version constraint:** `web/Dockerfile` uses `node:20-alpine` (npm v10). If `web/package-lock.json` must be regenerated, use `node:20` / npm v10 — or switch the Dockerfile base to match your local node version. Lock files generated with npm v11+ may omit optional platform-specific packages that npm v10 `npm ci` expects to find.

**OpenNext build constraints (web SaaS):** `web/open-next.config.ts` must exist — `opennextjs-cloudflare build` errors without it. `esbuild` and `wrangler` are peer deps of `@opennextjs/cloudflare` and must stay listed as explicit `devDependencies` in `web/package.json` (they are not auto-installed by `npm ci`). **No Next.js middleware:** Next 16's `proxy.ts` (renamed middleware) runs only on the Node.js runtime, which OpenNext's Cloudflare adapter rejects — so there is intentionally no `proxy.ts`. Route protection is handled without it: server layouts `redirect("/login")` on a 401 (e.g. `app/w/[workspaceId]/layout.tsx`), and `lib/api.ts` redirects to the OIDC login endpoint on any client-side 401. Do not reintroduce `proxy.ts`/`middleware.ts` — it breaks `npm run pages:build`.

**Web runtime config (SaaS vs Docker):** `web/lib/runtime-config.ts` reads `MARROW_API_URL` / `MARROW_API_KEY` / `MARROW_OIDC_ENABLED` server-side from `process.env`, and browser-side from `window.__MARROW_CONFIG__` (injected by `/config.js`, loaded `beforeInteractive` in `app/layout.tsx`). It does **not** read `NEXT_PUBLIC_*`. On the **Workers/OpenNext** deploy, config comes from `web/wrangler.toml [vars]` (OpenNext maps these to `process.env`, feeding SSR) plus the `app/config.js/route.ts` handler, which emits `/config.js` from `process.env` at request time (feeding the browser). On the **Docker self-host** path, `docker-entrypoint.sh` writes a static `public/config.js` at startup, which is served in preference to the route. There is intentionally no checked-in `public/config.js` — a static placeholder would shadow the route on Workers (the ASSETS binding serves static files before worker routes).

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
# R2_ENDPOINT_URL=           # https://<account-id>.r2.cloudflarestorage.com (preferred)
# R2_ACCOUNT_ID=             # alternative to R2_ENDPOINT_URL — endpoint is derived from it
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

# Billing / subscriptions (SaaS only — set SAAS_MODE=true to enforce the gate)
# SAAS_MODE=true
# STRIPE_SECRET_KEY=, STRIPE_WEBHOOK_SECRET= (see api/.env.example)
# Cloud per-seat prices: STRIPE_{STARTER,BUSINESS,GROWTH}_PRICE_{MONTHLY,YEARLY}
# Self-hosted per-seat annual prices: STRIPE_SH_BUSINESS_PRICE_YEARLY, STRIPE_SH_ENTERPRISE_PRICE_YEARLY
#   (both consumed by routers/billing.py's price→tier map; there are no SH monthly prices)
# Transactional email (Resend) — confirmation emails on checkout; best-effort.
# RESEND_API_KEY=re_...
# EMAIL_FROM="Marrow <hello@marrow.so>"
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

# CLI (export/restore/billing) — the Typer app exposes exactly these three commands
cd api && marrow export --workspace <slug> --output <path>
cd api && marrow restore <bundle.zip>
cd api && marrow reset-org-billing <slug>           # reset billing+onboarding state for repeatable testing (#214)
# Note: there is no `marrow purge-trash` command; hard-delete is per-node via DELETE /api/nodes/{id}/purge.

# Product frontend (web/)
cd web && npm run dev
cd web && npm run build
cd web && npm run lint
# web/ has no test script yet — see What's Not Built Yet

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
│   │       ├── 70645242437d_merge_swarm_v0_2_migrations.py
│   │       ├── a1b2c3d4e5f6_add_subscription_status_to_organizations.py  # #208
│   │       └── b8d2e4f6a1c3_add_onboarded_at_to_organizations.py  # #214
│   ├── marrow/                       # Main package
│   │   ├── app.py                    # FastAPI app factory, CORS + session middleware
│   │   ├── auth.py                   # OIDC config, session JWT helpers, cookie params
│   │   ├── db.py                     # SQLAlchemy session management
│   │   ├── dependencies.py           # FastAPI dependency providers (auth, db session, search)
│   │   ├── rbac.py                   # Role-based access control dependency factories
│   │   ├── subscriptions.py          # Subscription gate helpers (is_org_active / is_saas_mode) — #208
│   │   ├── email.py                  # Resend transactional email (send_email) — #208
│   │   ├── models.py                 # SQLAlchemy ORM models (incl. User)
│   │   ├── schemas.py                # Pydantic request/response schemas (incl. AuthStatus)
│   │   ├── fractional_index.py       # Fractional index helpers: between(a,b), after(a)
│   │   ├── search.py                 # SearchBackend ABC + PostgresSearchBackend
│   │   ├── storage.py                # StorageAdapter ABC + LocalFilesystemAdapter
│   │   ├── export.py                 # Export workspace → zip bundle
│   │   ├── restore.py                # Restore workspace ← zip bundle
│   │   ├── provisioning.py           # Default workspace + space for personal org (#241)
│   │   ├── page_revisions.py         # persist_page_revision — save path side effects (#255)
│   │   ├── cli.py                    # Typer CLI (export, restore, reset-org-billing)
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
│   │   ├── test_search.py            # FTS trigger + search scoping tests
│   │   └── test_page_revisions.py    # persist_page_revision save-path integration (#255)
│   └── storage/                      # Default local attachment storage (gitignored)
│
├── web/                              # Next.js frontend
│   ├── open-next.config.ts           # OpenNext Cloudflare adapter config (required by pages:build)
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
│   │           └── page.tsx          # Node route — PageEditor for pages; folders redirect to workspace home (sidebar-only containers)
│   ├── components/
│   │   ├── admin/                    # Admin dashboard section components
│   │   │   ├── mission-control-section.tsx  # Overview cards + workspace list
│   │   │   ├── users-section.tsx     # Member management (reused from org settings)
│   │   │   ├── spaces-section.tsx    # Spaces grouped by workspace
│   │   │   └── stub-section.tsx      # Placeholder for not-yet-built sections
│   │   ├── app-sidebar.tsx           # Tree nav: Spaces → recursive nodes (folders expand/collapse; pages navigate), drag-and-drop, inline create
│   │   ├── folder-views.tsx          # Presentational table/board/list (unused until database page type)
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
│   ├── next.config.ts                # output:'export' static export → out/
│   ├── playwright.config.ts          # Smoke tests vs built out/ (served by `serve`)
│   ├── app/
│   │   ├── layout.tsx                # Root layout: ThemeProvider + pre-hydration data-theme script (no FOUC)
│   │   ├── page.tsx                  # Homepage = SiteNav + <Landing/> + SiteFooter
│   │   ├── product/page.tsx          # Product tour (chrome SiteNav/SiteFooter)
│   │   ├── pricing/                  # Pricing page + tiers.ts (Cloud CTA → app.marrow.so)
│   │   └── globals.css               # Handoff token system (light+dark) + Fraunces/Inter/JetBrains Mono
│   ├── components/
│   │   ├── chrome.tsx                # SiteNav (dual CTA: Sign in + Open Marrow, both → app.marrow.so) + SiteFooter + Button/Eyebrow
│   │   ├── icons.tsx                 # MarrowGlyph (viewBox 0 0 32 32) + MarrowWordmark + feather icon set
│   │   ├── theme-provider.tsx        # data-theme + localStorage("marrow-theme") toggle
│   │   ├── landing/landing.tsx       # Full landing port (hero, manifesto, features, editor peek, comparison, terminal, CTA)
│   │   └── product-demos.tsx         # Static product-tour mocks
│   └── tests/
│       └── landing.spec.ts           # Assertion smoke tests (nav hrefs, glyph, CTA dests, no /signup) — run in marketing.yml
│
├── docs/                             # Astro Starlight docs site (user-facing)
│   ├── agents/                       # Agent skill config (issue tracker, triage, domain) — NOT published
│   ├── astro.config.mjs              # Sidebar nav + site metadata
│   ├── package.json
│   └── src/content/docs/             # Markdown/MDX content (getting-started, deployment, configuration, concepts)
│                                     # Only this tree is built/deployed; docs/agents/ is outside the Starlight collection
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
│   ├── codeql.yml                    # Weekly CodeQL analysis
│   └── cla.yml                       # Gates external PRs on a signed CLA (see Contributor licensing)
│                                     # (CLA signatures live at .github/cla/signatures.json on the
│                                     #  `cla-signatures` branch, NOT on main — see Contributor licensing)
├── CLA.md                            # Marrow Individual CLA (adapted Apache ICLA + §2a relicensing grant)
├── CONTRIBUTING.md                   # Contributor guide + the candour framing around the CLA
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
| organizations | id, slug (unique), name, onboarded_at (nullable — NULL means show first-run /onboarding), members_can_create_spaces (bool, default true) |
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

**Comments**: Page-level only for v1; `node_id` must reference a `type='page'` node, enforced in `routers/comments.py` (the issue explicitly allowed check-or-app-level). One level of replies via `parent_comment_id` (nested replies are rejected with 400). Resolve = setting `resolved_at`. A future `block_id` column can be added additively for block-level comments without a breaking migration. RLS `tenant_isolation` is enabled on `comments` via the node-indirect tenant expression, identical to `revisions`/`attachments`. Comments are **not yet in the export bundle** (planned bundle v5).

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
| PATCH | /api/orgs/{oid} | Update org settings (name, members_can_create_spaces) | owner |
| POST | /api/orgs/{oid}/onboard | First-run onboarding: set org name + stamp onboarded_at | owner |
| GET | /api/orgs/{oid}/members | List members (incl. pending) | viewer |
| POST | /api/orgs/{oid}/members | Invite member by email | owner |
| PATCH | /api/orgs/{oid}/members/{mid} | Change member role | owner |
| DELETE | /api/orgs/{oid}/members/{mid} | Remove member | owner |
| POST | /api/orgs/{oid}/workspaces | Create workspace in org (#129) | editor |
| GET | /api/workspaces/ | List workspaces | viewer |
| POST | /api/workspaces/ | Create workspace (`201`); session users default to their first org, API-key/anon must pass `org_id`. `POST /api/orgs/{oid}/workspaces` is the org-scoped alternative | session |
| GET/DELETE | /api/workspaces/{id} | Get / delete workspace | viewer/owner |
| GET | /api/workspaces/{id}/tree | Full hierarchy (sidebar) | viewer |
| GET | /api/workspaces/{id}/home | Workspace home payload (recent pages etc.) | viewer |
| GET | /api/workspaces/{id}/search?q= | Full-text search across workspace pages | viewer |
| GET | /api/workspaces/{id}/export?slim=false&include_trash=false | Download workspace as zip bundle | viewer |
| GET | /api/workspaces/{id}/export/estimate | Pre-compression byte estimates for full & slim exports | viewer |
| POST | /api/workspaces/restore | Restore a workspace from an uploaded export bundle zip | — |
| GET/POST | /api/workspaces/{id}/spaces/ | List / create spaces | viewer/editor |
| GET/DELETE | /api/workspaces/{id}/spaces/{sid} | Get / delete space | viewer/owner |
| POST | /api/nodes/{id}/restore | Restore a trashed node + subtree (422 if parent still trashed) | editor |
| DELETE | /api/nodes/{id}/purge | Hard-delete a trashed node and its subtree | owner |
| GET/POST | /api/nodes/{node_id}/share-links | List / create view-only share links | viewer/editor |
| DELETE | /api/share-links/{link_id} | Revoke a share link | editor |
| GET | /shared/{token} | **Unauthenticated** read-only view of a shared node (page content or folder subtree) | — |
| GET/POST | /api/nodes/{nid}/comments | List / create page comments (optional `parent_comment_id` for replies) | viewer/editor |
| PATCH | /api/comments/{cid} | Edit body and/or resolve/unresolve (`{"resolved": true\|false}`) | editor |
| DELETE | /api/comments/{cid} | Delete a comment | editor + (author or org owner) |
| GET | /api/users/me/starred | List current user's starred nodes (trashed excluded) | session |
| GET | /api/users/me/recent | Recently edited pages across all the caller's workspaces (#208) | session |
| POST | /api/billing/{oid}/checkout | Create a Stripe Checkout session (JSON body `{tier, interval}`, 14-day trial) | owner |
| POST | /api/billing/{oid}/portal | Create a Stripe Customer Portal session | owner |
| POST | /api/billing/{oid}/reconcile | Pull subscription truth from Stripe and persist it (webhook-independent self-heal) | owner |
| POST | /api/billing/webhook | Stripe webhook — writes `subscription_status`, sends confirmation email | — |
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
> Frontend: API client helpers in `lib/api.ts` (`*NodeView`) and presentational
> `components/folder-views.tsx` exist; **product UI is deferred** until a
> Confluence-like **database page** type hosts table/board/list views.
> Folders in the sidebar are tree containers only (expand/collapse); visiting
> a folder node URL redirects to the workspace home. Export of view definitions
> is planned for bundle v5.

> **Share links (#40):** `share_links` grant view-only public access to a node.
> `GET /shared/{token}` requires no account: a page returns its current
> revision content; a folder returns its visible (non-trashed) subtree
> recursively. Expired links return 410, unknown/revoked return 404. The
> public endpoint relies on RLS treating an unset `app.current_org` as
> unrestricted (same pattern as the API-key/dev path). Share links are **not
> yet in the export bundle** (planned bundle v5).
>
> **Page revision persistence (#255):** `persist_page_revision()` in `marrow/page_revisions.py` is the single save path for appending a page revision. Both `create_node` and `update_node` call it when writing page content. It owns link reconcile, mention delivery, and watch fan-out (watches are best-effort behind a nested savepoint). The router still owns `db.commit()` / IntegrityError → HTTP. See `CONTEXT.md`.
>
> **Watches & notifications (#103/#104):** `notifications` is a user-scoped Inbox feed; `create_notification()` in `marrow/notifications.py` is the single insertion point. `marrow/watches.py` fans out `watch_event` notifications: on a page save (`persist_page_revision`), every watcher of the page **or any ancestor folder** is notified, excluding the acting user. Both tables are deliberately excluded from export/restore (user-scoped, workspace-independent) — the round-trip guarantee is unaffected.
>
> **Search response shape (v0.2):** `SearchResultItem` fields are `node_id`, `name`, `snippet`, `space_id`, `space_name`, `node_path` (list of ancestor folder names, root→leaf), `rank`. The old `page_id`, `title`, `collection_id`, `collection_name` fields are gone.
>
> **Backlinks (#100, 2.6):** `GET /api/nodes/{nid}/backlinks` returns the nodes that link to `{nid}` (min role `viewer`, trashed sources excluded). `marrow/links.py` parses wiki-links (`/pages/{id}` and `/nodes/{id}` hrefs) and reconciles the `node_links` table on every page create/update via `reconcile_node_links()` (invoked from `persist_page_revision`). Export serializes the live DB index via `serialize_node_links()` into `links.json`; restore rebuilds it with `rebuild_node_links()`, honouring `manifest.include_trash` so links involving trashed nodes round-trip when the bundle was exported with `include_trash=True`.
> **Node properties (#42, 2.4):** Folder nodes declare a property schema (key + `value_type` + `options`); every descendant page inherits it (nearest-ancestor wins) and may set its own value. Effective properties resolve at read time via the ancestor folder chain. Property keys+values fold into the page `search_vector` at weight C — a single `marrow_node_search_vector(uuid)` SQL helper computes the full vector and all node search triggers (revision-insert, name-change, and the new `node_properties` change trigger) keep it consistent. Frontend: `property-editor.tsx` renders page value controls. Folder schema
> management UI is deferred until a database page type hosts views. Export/restore bundle **v4** carries a `node_properties` array in `manifest.json`; `export.serialize_node_properties` and the restore loop round-trip folder schemas and page values.

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
├── nodes/
│   ├── {node-id}.md     # human-readable Markdown (page-typed nodes only)
│   └── {node-id}.json   # canonical BlockNote JSON (JSON-format pages only)
├── revisions/
│   └── {node-id}/
│       ├── {revision-id}.md     # Markdown revisions (legacy) or human-readable export
│       └── {revision-id}.json   # BlockNote JSON revisions (canonical)
├── assets/
│   └── {attachment-id}{ext}
└── links.json           # node_links index (internal_links + orphaned_nodes; broken_links always [])
```

Folder nodes appear in `manifest.json` only — no files under `nodes/`. v3 bundles used a `pages/` directory; v4 renamed it to `nodes/`.

**Schema versions**: v1/v2 were Markdown-only. v3 added `.json` as canonical under `pages/`. v4 (Marrow 0.2) carries the `nodes` tree (folders + pages, with `parent_id`, `position`, `deleted_at`, `include_trash`) instead of the old `collections`+`pages` manifest shape; content files live under `nodes/`. Restore supports v1–v4 — older bundles are auto-upgraded onto the node tree on read.
v4 adds a `node_properties` array to `manifest.json` (folder schemas + page values).

**Slim bundles** omit the `revisions/` directory entirely and set `"slim": true` + `"revisions": []` in `manifest.json`. Restore recreates one revision per page from `nodes/` content. CLI: `marrow export --slim`; API: `?slim=true`.

**Trash**: soft-deleted nodes are excluded from exports by default. Pass `marrow export --include-trash` (or `?include_trash=true`) to include them; the manifest records `"include_trash": bool` so restore replays each node's `deleted_at`.

### Authentication

Marrow supports three authentication methods, checked in priority order:

1. **OIDC session cookie** (`marrow_session`): A JWT signed with `SECRET_KEY` (HS256), issued after successful OIDC login. Contains `sub` (user UUID), `email`, `name`, with 24h expiry.
2. **API key** (`X-API-Key` header): Static key matching `API_KEY` env var. Used by CLI and scripts. **Bypasses all RBAC checks** (superuser equivalent).
3. **Anonymous**: When neither OIDC nor API key is configured, all requests are allowed (dev mode). **Bypasses all RBAC checks**.

**OIDC flow**: The backend is the OIDC Relying Party. `GET /api/auth/login` redirects to the IdP. `GET /api/auth/callback` exchanges the code, upserts the user in the `users` table, claims any pending org memberships matching the user's email, auto-creates a personal org if the user has no memberships (workspace + space are provisioned on first `POST /api/orgs/{oid}/onboard`, not at login — explicit org-create and restore paths do not auto-provision), sets an httpOnly session cookie, and redirects the browser to `{FRONTEND_URL}/auth/callback` for client-side gate routing. The `COOKIE_DOMAIN` env var controls the cookie domain (set to `localhost` for dev so the cookie is shared between `:3000` and `:8000`).

**RBAC**: Org membership with roles (owner/editor/viewer) enforced on all data routes. Role is resolved by following the resource chain (node → space → workspace → org → membership). Dependency factories in `rbac.py` handle resolution for each resource level.

**Key files**: `auth.py` (config, JWT helpers), `dependencies.py` (`verify_auth` + `AuthContext`), `rbac.py` (role enforcement dependencies), `routers/auth.py` (login/callback/me/logout), `routers/organizations.py` (org CRUD + member management).

### Subscriptions & Billing (#208, #214)

Post-login flow: **login → onboarding gate → subscription gate → `/home` or sole workspace (`/w/{id}`)**.

- **First-run provisioning** (#241): When the user completes first-run onboarding (`POST /api/orgs/{oid}/onboard`), `provision_default_workspace_and_space()` creates one workspace (`Main`, slug `main-{org_id.hex}`) and one default space if the org has none. Login auto-creates the personal org only — no workspace until onboard, preventing pre-onboarding bypass. Explicit `POST /api/orgs` and `marrow restore` do not auto-provision.
- **Onboarding gate** runs whenever the user owns an org with `onboarded_at` unset (not gated on `SAAS_MODE`). The **subscription gate** is SaaS-only (`SAAS_MODE` off skips subscribe).
- **Gate model** — "active subscription" is a property of the **org** (`marrow/subscriptions.py`, the single source of truth). `is_org_active(tier, subscription_status)` is True when `SAAS_MODE` is off (self-hosted is never gated), the tier is `enterprise`, or `subscription_status ∈ {trialing, active}`. `is_saas_mode()` reads `SAAS_MODE` dynamically.
- **`organizations.subscription_status`** (`none | trialing | active | past_due | canceled`, default `none`) is written by the Stripe webhook **and** the reconcile endpoint — both go through the shared `_apply_subscription(org, subscription)` write path in `routers/billing.py`. `OrganizationRead` exposes `tier`, `subscription_status`, and the computed `has_active_subscription`. `AuthStatus.has_payable_unsubscribed_org` and `AuthStatus.needs_onboarding` (computed in `/api/auth/me` over the user's *owned* orgs) let the post-login gates be one round trip. **Billing and onboarding fields are never exported** (the restore round-trip is unaffected).
- **Reconcile** (#214): `POST /api/billing/{oid}/reconcile` (owner) pulls the org's latest subscription from Stripe (`Subscription.list(customer=…, status="all", limit=1)`) and persists it — the webhook-independent self-heal that `/subscribe/success` relies on. Every webhook early-return logs a `logger.warning` (missing fields, unknown customer/org, unrecognized price); failures are never silent.
- **Onboarding** (#214): `organizations.onboarded_at` is NULL only for the auto-created personal org (explicitly created and restored orgs are stamped immediately; existing rows were backfilled to `created_at`). `POST /api/orgs/{oid}/onboard {name}` sets name + `onboarded_at` atomically. `marrow reset-org-billing <slug>` resets billing + onboarding state for repeatable testing (never touches Stripe) — see `references/deploy-runbook.md` for the incognito test process.
- **Webhook** (`routers/billing.py`): `checkout.session.completed` → status from the Stripe subscription (trial → `trialing`) + confirmation email; `customer.subscription.updated` → mapped status; `…deleted` → `canceled`; `customer.subscription.trial_will_end` → single best-effort trial-ending reminder email (`trial_ending_html`, no status change); `invoice.payment_failed` → `past_due`. `/checkout` takes a **JSON body** (`{tier, interval}`) and creates a **no-card 14-day trial** (`payment_method_collection="if_required"` + `subscription_data.trial_settings.end_behavior.missing_payment_method="cancel"` — a card-less trial ends cleanly on day 14 via `subscription.deleted → canceled`, no dunning) (#289). Redirects to `/subscribe/success?org=` / `/subscribe?org=&canceled=1`.
- **Email** (`marrow/email.py`): `send_email(to, subject, html)` via the Resend REST API, sender `hello@marrow.so`. Best-effort — never raises, never blocks the webhook 200; skipped when `RESEND_API_KEY` is unset.
- **Gate enforcement (frontend)**: `app/auth/callback` routes in order — `/onboarding` (owner of an un-onboarded org) → `/subscribe` (owner of an unsubscribed org) → `postGateRedirectPath()` (`/w/{id}` when the user has exactly one workspace, else `/home`; never throws). `app/home/layout.tsx` and `app/w/[workspaceId]/layout.tsx` re-assert onboarding + subscription gates (defense in depth); workspace layout gates on *that* workspace's org (owner → `/subscribe?org=`, member → notice).
- **Success page (#214)**: `app/subscribe/success` calls `reconcileSubscription(orgId)` with bounded retries; active → `postGateRedirectPath()`, exhausted retries → a terminal "couldn't confirm payment" state with Retry + billing-portal + support links. It **never** auto-forwards to `/home` while the org is inactive (that's what caused the `/subscribe → /home → /subscribe` loop).
- **Onboarding page (#214)**: `app/onboarding/page.tsx` pre-fills the org name, submits via `completeOnboarding`, then continues to `/subscribe` or `postGateRedirectPath()` per the subscription gate. Org settings has a Name field (`updateOrg({name})`).

### Frontend Patterns

- **API client** (`lib/api.ts`): all server calls go through `apiFetch<T>()` which injects auth headers and handles errors
- **Auto-save**: `PageEditor` debounces saves 2 seconds after last keystroke; shows Saving… / Saved / Error status
- **Content format**: new saves store BlockNote JSON (`content_format='json'`); legacy Markdown revisions are loaded via `tryParseMarkdownToBlocks` for backward compat
- **Editor features**: code blocks (Shiki syntax highlighting), tables (`TableHandlesController`), `@` member mentions (custom inline-content spec carrying `userId` + `displayName`, fed by `listOrgMembers`), `/page` slash item that opens a page picker and inserts a WikiLink (`searchWorkspace`)
- **Sidebar create flows**: hover-to-reveal `+` buttons (FilePlus / FolderPlus) on each folder and space header create new nodes via `createNode()` with `parent_id` set; slug auto-generated via `slugify()`. Folders expand/collapse only (Confluence-style tree); pages navigate to the editor. Tree open/closed state persists in `localStorage` keyed by `marrow.tree.open.<userId>.<workspaceId>`.
- **Sidebar drag-and-drop**: `@dnd-kit/core` drives reparenting and reordering of folders/pages. New positions are computed via `fractional-indexing.generateKeyBetween()` and PATCHed to `/api/nodes/{id}` with `parent_id` + `position`. Cross-workspace drops and descendant-cycle drops are rejected with a `sonner` toast. Server is the source of truth — failures rollback via `router.refresh()`.
- **Comments**: `useComments(nodeId)` hook (`hooks/use-comments.ts`) owns thread state; `CommentsDrawer` renders threads/composer/resolve and `CommentBubbleFab` shows the unread badge. Unread = comments created after the viewer's last drawer visit, tracked client-side in `localStorage` (`marrow:comment-visit:<nodeId>`) — deliberately simple v1 heuristic, no backend visit table
- **Inbox**: `rail-panels/inbox-panel.tsx` lists notifications with kind-specific icons/copy and an empty state; `WorkspaceShell` fetches the unread count on mount and `AppRail` renders an unread badge on the Inbox tab. Backend delivery lives in `api/marrow/notifications.py` — `@`-mention saves on page nodes notify newly-mentioned users (only mentions new vs. the prior revision; the actor is never self-notified). Notifications are user-scoped and deliberately excluded from export/restore.
- **Global Home (#208)**: `app/home/` is the post-login default — `layout.tsx` enforces the auth + subscription gate and renders `components/global-chrome.tsx` (a slim top bar with workspace switcher + user menu, **not** `WorkspaceShell`); `page.tsx` composes self-contained widgets in `components/home/widgets.tsx` (Recently edited via `getMyRecent`, Starred, Inbox summary, Workspace switcher) — each kept standalone for the future widgets-dashboard backlog. The `/workspaces` picker is a switcher, not the landing. `/subscribe` + `/subscribe/success` drive checkout (`createCheckoutSession`).
- **Folder / views UX**: Folders are **sidebar-only** containers (no folder landing page; folder URLs redirect to workspace home). Table/board/list views and folder schema editors are **deferred** to a future Confluence-like **database page** type. Backend `node_views` / property schema APIs remain.
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

## Contributor licensing (CLA)

External contributions require a signed CLA before merge. Decided in [#270](https://github.com/marrow-software/marrow/issues/270), built in [#275](https://github.com/marrow-software/marrow/issues/275).

- **`CLA.md`** (v1.1) — the Apache ICLA v2.0, adapted. Sections 1 and 3–7 are near-verbatim Apache text. **Section 2a is modeled on Project Harmony** (its License option + most-permissive outbound option, per the [#286](https://github.com/marrow-software/marrow/issues/286) precedent research): a perpetual, irrevocable license with multi-tier sublicensing to relicense contributions under any terms (incl. commercial/proprietary), **conditioned on Us always also licensing them under Apache 2.0**. So Marrow can *dual-license* future versions but can never remove the Apache 2.0 track — for past *or* future releases. Contributor keeps copyright. This deliberately gives up the proprietary-only "fire escape" and **over-delivers** on the [#260](https://github.com/marrow-software/marrow/issues/260) promise (all versions stay Apache, not just published ones), moving §2a onto vetted template ground. Individual-only; no corporate CCLA until a company actually contributes.
- **`.github/workflows/cla.yml`** — `contributor-assistant/github-action`, SHA-pinned. Runs on `pull_request_target` (fork PRs need a write-capable token) and **never checks out PR code**. Signatures are committed to `.github/cla/signatures.json` **in this repo** — deliberately not a third-party gist, same principle as the export bundle — but on the **`cla-signatures` branch, not `main`**. The `Requirements` ruleset makes `main` PR-only with no bypass actors, so the workflow's `GITHUB_TOKEN` cannot push there; GitHub Actions is not installable as a bypass actor on this org, so the alternative was a PAT or deploy key (a credential to rotate) for no real gain. **Do not repoint `branch:` at `main`** without first solving that write path — every signature will silently fail.
- **`CONTRIBUTING.md`** — states plainly that Marrow is solo-maintained, that the CLA preserves a commercial *dual-license* option on *future* versions (a paid/proprietary track **alongside** Apache, never replacing it), and that every version — past and future — stays available under Apache 2.0. Names the rug-pull concern directly and explains that §2a deliberately stops short of the close-the-source move HashiCorp/Elastic/Redis made.

**Constraints when touching any of this:**

- The sign-off phrase (`I have read the CLA Document and I hereby sign the CLA`) appears in the workflow `if:` condition, `custom-pr-sign-comment`, `CLA.md`, and `CONTRIBUTING.md`. **All four must match exactly** — a typo in one silently breaks the gate.
- Use literal block scalars (`|`) for the custom PR comments, never folded (`>`): folded style collapses blank lines and the bot comment renders as one run-on paragraph.
- **§2a has not been reviewed by a lawyer** ([#281](https://github.com/marrow-software/marrow/issues/281)). It was aligned to the vetted Project Harmony template in v1.1 ([#286](https://github.com/marrow-software/marrow/issues/286)), the grantee is now defined as **Marrow Software LLC** (§1), and a **governing-law clause** (Oregon, USA — §8) was added, closing the substantive gaps #281 raised. What remains is an optional confirmatory lawyer pass before promoting the CLA / leaning on relicensing commercially — not a blocker.

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
- Database page type (Confluence-like host for table/board/list views + folder property schema UI — deferred; not on the current wayfinder launch bar)

---

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `marrow-software/marrow` (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical roles map 1:1 to tracker labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
