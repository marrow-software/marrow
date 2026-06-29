---
title: Docker Compose deployment
description: Run Marrow in production with Docker Compose.
---

The repo ships two Compose files:

- `docker-compose.yml` — local dev. Just PostgreSQL on port 5433.
- `docker-compose.prod.yml` — full stack: Postgres + API + web. Production-style.

## 1. Configure

```bash
cp .env.prod.example .env
```

Edit `.env`. The required values:

| Variable | Why |
| --- | --- |
| `SECRET_KEY` | Signs the session JWT. Use a long random string. |
| `POSTGRES_PASSWORD` | Postgres user password. |
| `MARROW_API_URL` | The URL the browser will call to reach the API (e.g. `https://api.example.com`). |

See [Environment variables](/configuration/env-vars/) for the full reference, including OIDC and CORS.

:::caution[Postgres password gotcha]
`POSTGRES_PASSWORD` is only applied the first time the database volume is initialized. If you change it later, the existing user keeps the **old** password and the API will fail with `password authentication failed for user "marrow"`.

To start over:

```bash
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d
```

`-v` removes the volume — only safe before you have real data.
:::

## 2. Check out a release and start

Pin a release tag so the API image and web source match:

```bash
git fetch --tags
git checkout v0.3.3          # recommended for production
```

Set `MARROW_VERSION` in `.env` to the same tag (e.g. `v0.3.3`), then:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This:

1. Brings up PostgreSQL with a persistent volume (`postgres_data`).
2. Pulls the API image from GHCR (`ghcr.io/marrow-software/marrow-api:${MARROW_VERSION}`) and runs `alembic upgrade head` then `uvicorn`.
3. Builds the web image from `./web` in the checked-out tree. The browser-visible config (`MARROW_API_URL`, `MARROW_API_KEY`, `MARROW_OIDC_ENABLED`) is read from container env at startup and written into `/config.js` — no rebuild needed when only those vars change.

The API exposes port 8000 and the web exposes port 3000 by default. Override with `API_PORT` / `WEB_PORT`.

## 3. Verify

```bash
curl http://localhost:8000/health
```

Open `http://localhost:3000` — you should see the workspace list.

## Volumes

Two volumes hold all state:

- `postgres_data` — the database.
- `api_storage` — uploaded attachments (mounted at `/data/storage` inside the API container).

Back up both for a complete restore. Or use `marrow export` for portable bundles — see [Restore guarantee](/concepts/restore-guarantee/).

## Reverse proxy

The Compose file does not include a reverse proxy. In production, terminate TLS in front of the web container with Caddy, Traefik, or nginx, and point `MARROW_API_URL` at the public API hostname.

If the API and web are on different subdomains, set `CORS_ORIGINS` to the web origin and `COOKIE_DOMAIN` to the parent domain (e.g. `.example.com`) so the session cookie is shared.

## Updating

Check out the new release, update `MARROW_VERSION` in `.env` to the same tag, then pull the API image and rebuild the web container:

```bash
git fetch --tags
git checkout v0.3.3          # pick the release you want
# edit .env — set MARROW_VERSION=v0.3.3 to match
docker compose -f docker-compose.prod.yml pull api
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations run automatically on API container start.

If you skip updating `MARROW_VERSION`, `pull api` keeps resolving the old pinned tag while the web container rebuilds from the newly checked-out source — API and web versions can diverge.

:::danger[Upgrading from v0.1 → v0.2]
v0.2.0 ships a one-shot, **breaking** schema migration: the old `collections` and `pages` tables collapse into a single self-referential `nodes` tree (folders + pages). The migration runs automatically on the next container start, but it rewrites primary keys and cascades on existing data.

**Before you pull:**

1. **Back up the database.** With the stack up: `docker compose -f docker-compose.prod.yml exec db pg_dump -U marrow marrow | gzip > marrow-pre-v0.2.sql.gz`
2. **Back up the storage volume.** `docker run --rm -v marrow_api_storage:/data -v "$PWD":/backup alpine tar czf /backup/api_storage-pre-v0.2.tgz -C /data .` (adjust the volume name if you renamed the project).
3. Also keep a fresh `marrow export` bundle for each workspace as a portable, version-agnostic fallback.

Downgrading back to v0.1 after the migration runs is not supported — restore from the SQL/volume backups (or from an export bundle into a fresh v0.1 stack).
:::
