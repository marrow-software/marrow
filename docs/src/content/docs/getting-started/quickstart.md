---
title: Quickstart
description: Run Marrow locally for development.
---

This walks you through running Marrow on your machine for development. For production deployment, see [Docker Compose](/deployment/docker-compose/) or [Cloudflare](/deployment/cloudflare/).

## Solo self-host without OIDC

If you want a **single-user instance with no identity provider** — common for beachhead self-hosters auditing the bundle — use a static API key instead of OIDC.

:::caution[Production security]
An API key grants **superuser access**: it bypasses org RBAC (same as the CLI). Fine for a solo instance you control; **not** for multi-tenant production unless every caller is trusted. Prefer [OIDC](/configuration/oidc/) when multiple people share one deployment.
:::

### Local dev (API + web)

1. Generate a key: `openssl rand -hex 32`
2. **Backend** — in `api/.env`:

   ```text
   API_KEY=your-generated-key-here
   ```

3. **Frontend** — in `web/.env.local`:

   ```text
   MARROW_API_KEY=your-generated-key-here
   ```

4. Start Postgres, API, and web as in [steps 2–4](#2-start-postgresql) below. The browser sends the key automatically; no login screen.

**CLI** talks to Postgres directly (not the HTTP API). With `api/.env` configured and venv active:

```bash
cd api
source .venv/bin/activate
marrow export --workspace mydocs --output ./backup.zip
marrow restore ./backup.zip
```

**HTTP API** calls use the same key as a header:

```bash
curl -H "X-API-Key: your-generated-key-here" http://localhost:8000/api/workspaces/
```

### Docker Compose (solo production)

For a minimal solo stack, set the same key in the root `.env` used by `docker-compose.prod.yml`:

```text
API_KEY=your-generated-key-here
MARROW_API_KEY=your-generated-key-here
```

Leave OIDC vars unset and `MARROW_OIDC_ENABLED` unset/false. See [Docker Compose deployment](/deployment/docker-compose/) for the full bring-up sequence.

Full variable reference: [Environment variables](/configuration/env-vars/).

## Prerequisites

- Python 3.11+
- Node.js 20+
- Docker (for the local PostgreSQL container)

## 1. Clone the repo

```bash
git clone https://github.com/marrow-software/marrow.git
cd marrow
```

## 2. Start PostgreSQL

```bash
docker compose up -d
```

This brings up PostgreSQL 16 on port 5433 (so it doesn't collide with a local Postgres on 5432).

## 3. Backend setup

```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`.

## 4. Frontend setup

In a second terminal:

```bash
cd web
npm install
cp .env.local.example .env.local
npm run dev
```

The frontend runs at `http://localhost:3000`.

## 5. Try it

- Open `http://localhost:3000`. The app root (`/`) redirects to `/home`; in anonymous dev mode (no OIDC), unauthenticated users are sent to `/login` and then `/workspaces`.
- Create a workspace, then a space, then add folders and pages inside that space.
- Type into the BlockNote editor — it auto-saves after 2 seconds and creates a revision on every save.
- Hover over a folder in the sidebar to create child folders and pages via the `+` buttons.
- Try `cd api && marrow export --workspace <slug> --output ./out.zip` and inspect the bundle. Then `marrow restore ./out.zip` into a fresh database to confirm the round-trip.

## Configuration

The default dev setup runs without authentication. To turn on auth, see:

- **[Environment variables](/configuration/env-vars/)** — full reference.
- **[OIDC](/configuration/oidc/)** — sign-in via Google, Keycloak, etc.
