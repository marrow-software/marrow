---
title: Environment variables
description: Full reference for Marrow's backend and frontend environment variables.
---

Marrow has two `.env` files: one for the FastAPI backend (`api/.env`) and one for the Next.js frontend (`web/.env.local`). When deploying with `docker-compose.prod.yml`, both are sourced from a single root `.env` (see `.env.prod.example`).

## Backend (`api/.env`)

### Required

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string. Example: `postgresql://marrow:marrow@localhost:5433/marrow`. **Not required if** `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_HOST` are set instead — the API assembles the DSN from those (URL-encoding the password safely). The prod compose file uses this `POSTGRES_*` fallback, so it never sets `DATABASE_URL`. |
| `SECRET_KEY` | — | Signing key for the session JWT. **Use a long random string in production** (e.g. `openssl rand -hex 32`). |
| **An auth method** | — | The API **refuses to start** unless one of `OIDC_ISSUER`, `API_KEY`, or `MARROW_ALLOW_ANONYMOUS=true` is set. See [Authentication](#authentication) below. Omitting all three crash-loops the container on boot. |

### Storage

| Variable | Default | Description |
| --- | --- | --- |
| `STORAGE_BACKEND` | `local` | `local` (filesystem) or `r2` (Cloudflare R2). |
| `STORAGE_PATH` | `./storage` | Directory where attachments are stored (local backend). Relative paths resolve from `api/`. Inside the API container, this is `/data/storage` and is backed by a Docker volume. |
| `R2_ENDPOINT_URL` | unset | R2 S3 endpoint, e.g. `https://<account-id>.r2.cloudflarestorage.com` (preferred). Required when `STORAGE_BACKEND=r2` unless `R2_ACCOUNT_ID` is set. |
| `R2_ACCOUNT_ID` | unset | Alternative to `R2_ENDPOINT_URL` — the endpoint is derived from it. |
| `R2_ACCESS_KEY_ID` | unset | R2 access key (R2 backend). |
| `R2_SECRET_ACCESS_KEY` | unset | R2 secret key (R2 backend). |
| `R2_BUCKET` | unset | R2 bucket name (R2 backend). |

### Authentication

Marrow is **fail-closed**: it refuses to start unless at least one of `OIDC_ISSUER`, `API_KEY`, or `MARROW_ALLOW_ANONYMOUS=true` is configured. An unconfigured API exits on boot rather than silently serving every request. At request time, auth is resolved in priority order: OIDC session cookie → `X-API-Key` header → anonymous (only when `MARROW_ALLOW_ANONYMOUS=true`).

`OIDC_ISSUER` is the recommended production path — it's the only one that gives per-user identity and RBAC. See the [OIDC (optional)](#oidc-optional) group below.

| Variable | Default | Description |
| --- | --- | --- |
| `API_KEY` | unset | Static credential for the `X-API-Key` header, used by the CLI and scripts (`marrow export`/`restore`) and by direct HTTP callers. **Bypasses all RBAC** (superuser equivalent) — it is not a user login. The web app still routes through `/login`. |
| `MARROW_ALLOW_ANONYMOUS` | unset (off) | Set to `true` to allow unauthenticated requests. **Bypasses all access control** — every caller gets superuser access with no identity. Intended only for a localhost-bound dev instance; keep it **off in production**. When on, the no-identity app lands on `/workspaces`. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of allowed origins. |

### OIDC (optional)

Set `OIDC_ISSUER` to enable. All other OIDC vars are required when enabled.

| Variable | Description |
| --- | --- |
| `OIDC_ISSUER` | OIDC discovery URL, e.g. `https://accounts.google.com`. |
| `OIDC_CLIENT_ID` | Client ID from your IdP. |
| `OIDC_CLIENT_SECRET` | Client secret from your IdP. |
| `OIDC_REDIRECT_URI` | Where the IdP redirects after login. Must match what's registered. Example: `http://localhost:8000/api/auth/callback`. |
| `FRONTEND_URL` | Base URL of the web app. Used as the post-login redirect target. |
| `COOKIE_DOMAIN` | Domain for the `marrow_session` cookie. For dev: `localhost`. For prod with split subdomains: `.marrow.so`. |

See [OIDC](/configuration/oidc/) for setup walkthroughs.

### Billing & email (SaaS / Cloud only)

These apply only to the hosted Cloud deployment (`SAAS_MODE=true`). Self-hosted instances leave them unset — billing is never gated off-SaaS.

| Variable | Default | Description |
| --- | --- | --- |
| `SAAS_MODE` | unset (off) | `true` enforces the subscription gate. Off for self-hosted. |
| `STRIPE_SECRET_KEY` | unset | Stripe API secret key. |
| `STRIPE_WEBHOOK_SECRET` | unset | Signing secret for verifying Stripe webhook payloads. |
| `STRIPE_*_PRICE_*` | unset | Per-tier price IDs — `STRIPE_STARTER/BUSINESS/GROWTH_PRICE_MONTHLY|YEARLY` (Cloud flat rate) and `STRIPE_SH_BUSINESS/ENTERPRISE_PRICE_YEARLY` (self-hosted per-seat). |
| `RESEND_API_KEY` | unset | Resend API key for transactional email. Best-effort — if unset, sends are skipped and never block a webhook. |
| `EMAIL_FROM` | `Marrow <hello@marrow.so>` | Sender for transactional email. |

For the exhaustive, always-current list (including any newly added keys), see [`api/.env.example`](https://github.com/marrow-software/marrow/blob/main/api/.env.example) — it is the source of truth this page tracks.

## Frontend (`web/.env.local` for dev, container env for prod)

These are read at **runtime**, not build time. The container generates a small `/config.js` file from these env vars at startup, so the same prebuilt image works in any deployment without rebuilding.

| Variable | Default | Description |
| --- | --- | --- |
| `MARROW_API_URL` | `http://localhost:8000` | URL the browser uses to reach the API. Must be reachable from end-user browsers. |
| `MARROW_API_KEY` | unset | If `API_KEY` is set on the backend, set this to match. |
| `MARROW_OIDC_ENABLED` | unset | Set to `true` when OIDC is configured on the backend. Enables the `/login` route. Route protection is handled without middleware — server layouts `redirect("/login")` on a 401 and the client API helper redirects to the OIDC login endpoint on any 401 (there is deliberately no Next.js middleware). |
| `INTERNAL_API_URL` | same as `MARROW_API_URL` | URL Next.js uses for SSR fetches inside the Docker network. Set to `http://api:8000` in the prod compose file. |

## Production compose root `.env`

When using `docker-compose.prod.yml`, both files are replaced by a single root `.env`. Additional vars used only by the Compose file:

| Variable | Default | Description |
| --- | --- | --- |
| `MARROW_VERSION` | `v0.4.0` (compose default) | GHCR API image tag. Set to the same git release tag you checked out; update in `.env` whenever you upgrade. Also labels the locally built web image. |
| `POSTGRES_USER` | `marrow` | Postgres username. |
| `POSTGRES_DB` | `marrow` | Postgres database name. |
| `POSTGRES_PASSWORD` | — | **Required.** Postgres password. |
| `API_PORT` | `8000` | Host port the API binds to. |
| `WEB_PORT` | `3000` | Host port the web binds to. |
