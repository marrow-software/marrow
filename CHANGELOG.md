# Changelog

All notable changes to Marrow are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Each release also has fuller narrative notes (highlights, breaking changes, upgrade
steps) on its [GitHub release](https://github.com/marrow-software/marrow/releases).

## [Unreleased]

## [0.6.0] — 2026-08-14

The **Signal** design-system rebuild (Phase 1 of the wayfinder map [#258](https://github.com/marrow-software/marrow/issues/258), spec [#311](https://github.com/marrow-software/marrow/issues/311)). The app's visual foundation and shell are rebuilt to one deliberate system — a restrained spruce accent used only for interaction, a biased neutral surface, a real type ramp, and crisp minimal motion — so the product reads as engineered rather than a stock template. This is a `web/`-only release: no API, schema, route, or export-bundle changes, so self-hosted upgrades need no migration.

### Added
- **Signal token layer** (#312) — `web/app/globals.css` is now the single seam
  carrying identity, type, and motion as named CSS custom properties: the spruce
  accent (`#0f766e` light / `#3aa88f` dark), a biased-neutral surface set, the
  `--text-*`/`--h*` type ramp, the `--s*` spacing scale and `--ctl-*` control
  heights, `--measure`, the `--dur-*`/`--ease-signature` motion tokens, the
  layered `--shadow-signature`, and a light-only `--texture-grain`.
- Token-contract regression guard (`web/scripts/check-tokens.mjs`,
  `npm run test:tokens`, wired into web CI) — fails if a retired identity token
  reappears or a Signal signature token goes missing. (#312)
- Signature feedback set on shell/editor primitives (`ui/{button,input,badge}`,
  shell + comments overlays): flat→signature hover shadow-step, 1px press,
  instant 3px focus ring, `--pop-from` overlay entrance. Reduced motion honored
  throughout. (#315)
- **Spaces switcher flyout** (#316) — a floating switcher (filter box, current +
  other spaces, view-all / create / import) splits *switching* spaces from
  *browsing* the current one; the inline tree below browses the current space
  only.

### Changed
- **Unified sidebar shell** (#313) — the separate icon rail and tree collapse
  into one column: workspace switcher (top) → global-nav strip
  (Home · Search · Inbox · Shared) → current-space tree → account (bottom).
  Search/Inbox surface in place of the tree; ⌘/Ctrl+B toggles the sidebar.
- **Comments dock** (#314) — the comments panel docks as a side column and
  reflows the editor narrower rather than overlaying it; the reflow is the one
  allowed layout animation.
- **Settings in place** (#317) — the org admin surface is a single-column
  settings sidebar with a "Back to [workspace]" row and a full-width main pane,
  threading the origin workspace via `?ws=`, instead of the old orphaned
  two-column screen.
- Fonts rewired to Inter (sans) + JetBrains Mono (restrained mono voice); the
  flat 6px radius replaces the old 10–26px ramp. (#312)

### Removed
- The retired identity: terracotta accent (`#9a3412`/`#e8805c`), the Fraunces
  display serif (and its self-hosted asset + `--font-heading` stack), cream/bone
  tokens, and the wide radius ramp — all gone from the token layer and pinned
  out by the regression guard. (#312)
- The standalone `app-rail.tsx` (absorbed into the unified sidebar) and the
  separate `settings-dialog.tsx` (folded into the account menu). (#313)

## [0.5.0] — 2026-07-30

This release clears the public MVP launch bar (wayfinder map [#258](https://github.com/marrow-software/marrow/issues/258)): every public-facing claim is now true today, explicitly labelled roadmap, or gone ([#288](https://github.com/marrow-software/marrow/issues/288)). It also lands the contributor-licensing (CLA) machinery and the folder/sidebar UX refactor.

### Added
- Folder views stack (#238–#240) — `node_views` CRUD (table/board/list) with a
  presentational renderer and view-settings UI. Product UI is deferred behind a
  future database-page type; the sidebar is a Confluence-style tree (folders
  expand/collapse, pages navigate).
- No-card 14-day trial (#289): Checkout uses
  `payment_method_collection="if_required"` + a trial-end `cancel` behaviour, so a
  card-less trial ends cleanly via `subscription.deleted → canceled` (no dunning).
  A `customer.subscription.trial_will_end` webhook sends one best-effort reminder
  email.
- Contributor licensing: `CLA.md` (adapted Apache ICLA), CLA Assistant Lite gate
  (`.github/workflows/cla.yml`, signatures on the `cla-signatures` side branch),
  and `CONTRIBUTING.md`. (#270, #275)

### Changed
- **Launch honesty pass (#288 / #289–#296)** — one honest sweep across every
  public surface (marketing site, docs, README, `CLAUDE.md`, pricing):
  - Removed the fabricated "Lena Osei / Haven Infrastructure" testimonial;
    fixed all `spmcgraw/marrow` → `marrow-software/marrow` links; nav Product →
    `/product`; self-host terminal now uses the real image
    (`ghcr.io/marrow-software/marrow-api`), ports (8000/3000), and compose flow.
  - Restore-guarantee copy scoped to workspace-content parity (links the scope
    table); named the bundle-v5 gap (comments, share links, folder views);
    removed unbuilt diff-UI / broken-link-detection claims; "every keystroke" →
    "every save".
  - Markdown reframed as an export artifact (pages/history in Postgres);
    deployment copy → "one compose file" naming the two images + database.
  - Docs: fail-closed auth default documented (`MARROW_ALLOW_ANONYMOUS`),
    Cloudflare guide's API half rewritten around Fly.io, env-var reference
    completed, round-trip test described accurately, forward- → backward-
    compatible (v1–v4).
  - Pricing: comparison grid on the deployment axis with Cloud seat bands; every
    price maps to a checkout-accepted tier; SAML / audit log / custom domain /
    uptime SLA → Roadmap or By-contract; cancel-behaviour and restore-guarantee
    FAQs corrected.
  - `CLAUDE.md` reconciled against the tree (live `POST /api/workspaces/`,
    added `/home`, removed the non-existent trash route and `marrow purge-trash`
    CLI, documented Cloud + `STRIPE_SH_*_YEARLY` price env vars).
- Centralized page-save side effects in `persist_page_revision` — single save
  path for revision append, link reconcile, mention delivery, and watch fan-out.
  (#255)
- CLA `CLA.md` bumped to **v1.1**: Section 2a (relicensing grant) aligned to the
  Project Harmony contributor-license template (License option + most-permissive
  outbound option). Marrow may now dual-license future versions under additional
  commercial/proprietary terms, but is bound to keep every version — past and
  future — available under Apache 2.0; the earlier "already-published releases
  only" carve-out is replaced by a perpetual dual-availability guarantee.
  `CONTRIBUTING.md` framing updated to match. The CLA grantee ("We"/"Us") is now
  defined as **Marrow Software LLC** rather than an unnamed maintainer, and a
  **governing-law clause** (State of Oregon, USA) was added as §8. (#281, #286)

### Fixed
- CodeQL: replaced unanchored URL regexes in `landing.spec.ts` with substring
  matches (missing-regexp-anchor).

## [0.4.0] — 2026-07-10

### Added
- Page archiving from the page menu — soft-deletes the page (and warns when nested
  content is trashed); flushes unsaved edits before archiving. (#229)
- `include_trash` option on workspace export (API + export dialog) so soft-deleted
  nodes round-trip when explicitly requested.
- First-run workspace provisioning on onboarding completion — completing `/onboarding`
  creates a default workspace + space so new users land in a writable tree, not an
  empty `/home` picker. (#241)
- Docs: v4 export/restore scope table and planned v5 gaps (comments, share links,
  node views). (#244)
- Docs: prominent API-key solo self-host quickstart (no IdP). (#245)
- Docs: export/restore walkthrough linked from README. (#246)

### Changed
- Solo-first onboarding copy — ownership language instead of team/org vocabulary. (#242)
- Marketing landing — self-host-first CTAs, Apache 2.0 badge, removed false claims
  (offline sync, MIT license). (#243)
- Backlink index export/restore hardened; wiki-links using `/n/{id}` app routes are
  now indexed.

### Fixed
- Archive flow races (unsaved edits, in-flight saves, 404 edge cases).
- Node route links in rail panels (starred, inbox, side drawer).
- Post-gate redirect and onboarding enforcement on workspace routes.
- Docs site TypeScript config resolution after `npm ci`.

## [0.3.3] — 2026-06-21

### Fixed
- Production login 500: the v0.3.2 `/login` page (an async server component reading
  `searchParams`) was statically prerendered with build-time env and crashed on the Workers
  runtime at request time, breaking the `/ → /home → /login` sign-in path. `/login` is now
  `export const dynamic = "force-dynamic"`, so it always renders per request with runtime env.
  (#216 follow-up)

## [0.3.2] — 2026-06-21

### Fixed
- Stripe webhook/reconcile silently dropping subscription updates: in `stripe>=15`,
  `StripeObject` no longer subclasses `dict`, so `.get(...)` on a real webhook/reconcile
  payload raised `AttributeError` — and the webhook swallowed it, so checkout never persisted
  `subscription_status`/`tier`. All Stripe-object reads in `routers/billing.py` now use typed
  attribute access; the webhook logs handler exceptions and still returns 200 so reconcile
  self-heals without Stripe retry storms. Tests use real `StripeObject` fixtures so the bug
  class fails CI. (#217, #218)

### Changed
- `/login` now server-redirects straight to the Auth0 login widget instead of rendering an
  intermediate "Sign in with SSO" page. Signing out lands on a minimal `/login?signedout=1`
  page with a single Sign-in link (no auto-bounce back into Auth0); the backend
  `post_logout_redirect_uri` points there. (#216)

### Added
- Marrowglyph SVG served from `web/public` for Auth0 login-page branding. (#215)

## [0.3.1] — 2026-06-11

### Fixed
- The `/subscribe → /home → /subscribe` redirect loop after a completed Stripe Checkout:
  `/subscribe/success` now actively **reconciles** the subscription from Stripe
  (`POST /api/billing/{org}/reconcile`, owner) instead of waiting on the webhook, and renders
  a terminal Retry/billing-portal/support state on failure — it never forwards to `/home`
  while the org is unsubscribed.
- Silent Stripe webhook failures: every early-return in the webhook handlers now logs a
  warning (missing fields, unknown customer/org, unrecognized price), and the persistence
  logic is shared between the webhook and reconcile paths (`_apply_subscription`).

### Added
- First-run **organization onboarding** (`/onboarding`) — new users name their auto-created
  org before anything else; the post-login gate order is now **onboarding → subscription →
  home**. Orgs can also be renamed in org settings (`PATCH /api/orgs/{id}` accepts `name`).
- `organizations.onboarded_at` (backfilled to `created_at` for existing orgs, so nobody is
  re-onboarded) and `AuthStatus.needs_onboarding`.
- `marrow reset-org-billing <slug>` CLI — resets billing + onboarding state to fresh-signup
  values for repeatable auth/payment testing (never touches Stripe).

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

[0.6.0]: https://github.com/marrow-software/marrow/releases/tag/v0.6.0
[0.5.0]: https://github.com/marrow-software/marrow/releases/tag/v0.5.0
[0.4.0]: https://github.com/marrow-software/marrow/releases/tag/v0.4.0
[0.3.3]: https://github.com/marrow-software/marrow/releases/tag/v0.3.3
[0.3.2]: https://github.com/marrow-software/marrow/releases/tag/v0.3.2
[0.3.1]: https://github.com/marrow-software/marrow/releases/tag/v0.3.1
[0.3.0]: https://github.com/marrow-software/marrow/releases/tag/v0.3.0
[0.2.9]: https://github.com/marrow-software/marrow/releases/tag/v0.2.9
[0.1.1]: https://github.com/marrow-software/marrow/releases/tag/v0.1.1
[0.1.0]: https://github.com/marrow-software/marrow/releases/tag/v0.1.0
