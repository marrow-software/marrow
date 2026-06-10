# Changelog

All notable changes to Marrow are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Each release also has fuller narrative notes (highlights, breaking changes, upgrade
steps) on its [GitHub release](https://github.com/marrow-software/marrow/releases).

## [0.3.0] — 2026-06-09

### Added
- Unified post-login flow: **login → subscription gate → global Home/For You**.
- Subscription checkout — in-app `/subscribe` page (Starter/Business/Growth, monthly↔yearly,
  Enterprise "Contact sales") starts a Stripe Checkout session with a 14-day trial; a
  `/subscribe/success` page polls until the subscription is active, then lands you in the app.
- Global **Home/For You** (`/home`) — the new post-login default, aggregating recently edited
  pages, starred items, and Inbox unread across *all* workspaces, plus a workspace switcher in
  a lightweight global chrome. The `/workspaces` picker is demoted to a switcher.
- `organizations.subscription_status` (`none | trialing | active | past_due | canceled`) — set
  by the Stripe webhook; an org is "active" when status ∈ {trialing, active}, tier is
  enterprise, or self-hosted (`SAAS_MODE` off).
- Subscription confirmation email via Resend (`hello@marrow.so`), best-effort on
  `checkout.session.completed`.
- `GET /api/users/me/recent` — recently edited pages across every workspace the caller can access.

### Changed
- `POST /api/billing/{org}/checkout` now takes a JSON body (`tier`/`interval`) instead of query
  params, adds a 14-day trial, and uses real `/subscribe/success` + `/subscribe` redirect URLs.
- `OrganizationRead` exposes `tier`, `subscription_status`, and `has_active_subscription`;
  `AuthStatus` adds `has_payable_unsubscribed_org` so the post-login gate is a single round trip.

## [0.2.9] — 2026-06-06

The v0.2 milestone: the collections/pages model collapses into a unified node tree, a
suite of collaboration features lands, and Marrow launches as a hosted service.

### Added
- Comments — page-level threads with replies and resolve.
- Backlinks — every page tracks what links to it; wiki-links reconciled on save.
- Stars, watches, and a per-user Inbox (notifications for edits and `@`-mentions).
- Node properties — text, number, date, select, multi-select, checkbox — declared on a
  folder and inherited by descendant pages; folded into full-text search.
- Folder views — render a folder's pages as a table, board, or list with sorts, filters,
  and grouping.
- View-only share links — public, account-free access to a page or folder subtree;
  expiring and revocable.
- Editor: `@` member mentions, `/page` slash command for wiki-links, code blocks with
  syntax highlighting, and tables.
- Cloudflare R2 storage adapter for attachments (alongside local filesystem).
- Marketing site (`marrow.so`) and a user-facing docs site.
- Org RBAC (owner / editor / viewer) enforced across all routes, admin dashboard,
  multi-workspace switcher, and a Home landing screen.
- Stripe billing with Starter / Business / Growth / Enterprise tiers.

### Changed
- **Data model:** Organizations → Workspaces → Spaces → **Folders / Pages** (nodes).
  Folders and pages are both `nodes` (`type = 'folder' | 'page'`); the Collections table
  was removed. Old collection-scoped and global page routes replaced by
  `/api/spaces/{id}/nodes` and `/api/nodes/...`.
- **Export bundle bumped to v4** (carries the node tree and node properties). Restore
  still accepts v1–v4 bundles; older bundles auto-upgrade onto the node tree on read.
- **Deployment (SaaS):** API moved off Cloudflare Containers to **Fly.io**; web app moved
  to **Cloudflare Workers** via `@opennextjs/cloudflare`; marketing and docs on
  **Cloudflare Pages**; database on **Neon**. Self-hosted Docker Compose is unchanged.

### Fixed
- Migrations now run automatically on deploy via Fly's `[deploy] release_command`.
- Web runtime config (API URL, OIDC flag) is supplied to the Workers deploy via wrangler
  `[vars]` plus a `/config.js` route handler.
- R2 storage adapter accepts `R2_ENDPOINT_URL` and fails with a clear error instead of a
  `KeyError` at import.
- OIDC discovery URL no longer double-slashes when `OIDC_ISSUER` has a trailing slash.
- Marketing site deploys from the static export (`out/`).

## [0.1.1] — 2026-04-30

### Added
- Multi-arch container images (`linux/amd64` + `linux/arm64`) for `marrow-api` and
  `marrow-web`.

### Changed
- The web container reads browser config at runtime (from `MARROW_*` env vars written into
  `/public/config.js` at startup) instead of inlining `NEXT_PUBLIC_*` at build time, so the
  same prebuilt image works on any deployment without rebuilding.

## [0.1.0] — 2026-04-29

Initial release — a self-hosted, open-source knowledge base built around a non-negotiable
restore guarantee.

### Added
- Restore guarantee — `marrow restore` reproduces a workspace exactly from any export
  bundle (round-trip test enforced in CI).
- Append-only revisions, enforced at the database layer.
- OIDC SSO (any IdP) with API-key fallback and anonymous dev mode.
- Org-level RBAC (owner / editor / viewer).
- Pluggable storage adapter (local filesystem).
- Markdown + JSON export bundles, human-readable without tooling.
- PostgreSQL full-text search.
- BlockNote rich-text editor.

[0.2.9]: https://github.com/marrow-software/marrow/releases/tag/v0.2.9
[0.1.1]: https://github.com/marrow-software/marrow/releases/tag/v0.1.1
[0.1.0]: https://github.com/marrow-software/marrow/releases/tag/v0.1.0
