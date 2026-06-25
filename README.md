# Marrow

[![CI](https://github.com/marrow-software/marrow/actions/workflows/ci.yml/badge.svg)](https://github.com/marrow-software/marrow/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/marrow-software/marrow)](https://github.com/marrow-software/marrow/releases)
[![License](https://img.shields.io/github/license/marrow-software/marrow)](https://github.com/marrow-software/marrow/blob/main/LICENSE)

**Your knowledge, owned outright. No landlords. No lock-in. No surprises.**

Marrow is a self-hosted, open-source knowledge base built on one non-negotiable principle: if you have your data, you can always come back. Export, wipe, restore. Every time. No exceptions.

📖 **[Read the docs](./docs/)** for installation, deployment, and configuration guides.

---

## Why Marrow exists

Most knowledge tools are built on a quiet assumption: that you'll stay. Notion, Confluence, Loop — they're designed to be sticky, which is another word for hard to leave. Your pages, your attachments, your links, your history — they live in someone else's house. You pay rent. They set the rules.

Marrow is built on the opposite assumption. You should be able to leave at any time, take everything with you, and rebuild elsewhere in minutes. That's not a feature. That's the foundation.

---

## Core principles

These are not aspirations. They are constraints that every architectural and product decision must respect.

1. **Restore guarantee** — A Marrow export bundle is restorable to an exact replica of the original workspace. A failing restore test is a critical bug.
2. **Transparent format** — Markdown, JSON, attachments in a zip. No proprietary blobs.
3. **Append-only history** — Every save creates a revision. Old revisions are never modified or deleted (enforced by a database trigger).
4. **Pluggable storage** — Local filesystem or S3-compatible object storage. Business logic never bypasses the storage adapter.
5. **Self-hosted by default** — Your data stays on infrastructure you control.

See **[Restore guarantee](./docs/src/content/docs/concepts/restore-guarantee.md)** for the full explanation.

---

## Features

- Content organized in a tree: Organizations → Workspaces → Spaces → Folders / Pages
- BlockNote-powered editor with code blocks, tables, page links, and `@` mentions
- Folder views: table, board, and list — rendered from page properties
- Node properties (text, number, date, select, multi-select, checkbox) inherited from parent folders
- Comments (threads, replies, resolve) on any page
- Backlinks — every page knows what links to it
- Stars, watches, and per-user Inbox (notifications for edits and `@` mentions)
- View-only share links for any page or folder (no account required to view)
- Global Home dashboard — recently edited pages, starred items, and Inbox across all workspaces
- Organization onboarding for first-run setup
- File attachments
- Full-text search across a workspace
- Append-only revision history on every save
- One-command export to a transparent zip bundle (full or slim)
- One-command restore from any export bundle (forwards-compatible across versions)
- OIDC authentication with org-level RBAC (owner / editor / viewer)
- Pluggable storage (local filesystem; S3-compatible backends such as Cloudflare R2)

---

## Self-hosting

The recommended production path is Docker Compose. The API image is pulled from GHCR; the web image is built locally from source.

**Prerequisites:** Docker and Docker Compose.

```bash
git clone https://github.com/marrow-software/marrow.git
cd marrow
git checkout v0.3.3          # recommended for production

cp .env.prod.example .env
# edit .env — SECRET_KEY, POSTGRES_PASSWORD, MARROW_API_URL (your public API URL)
# set MARROW_VERSION to the same tag you checked out (e.g. v0.3.3)

docker compose -f docker-compose.prod.yml up -d --build
curl http://localhost:8000/health
# open http://localhost:3000
```

**Auth is required in production.** Set OIDC (preferred for multi-user) or `API_KEY` / `MARROW_API_KEY` for solo use. Without either, all requests are allowed — fine for local dev, never for production. See **[OIDC](./docs/src/content/docs/configuration/oidc.md)** for setup.

**Reverse proxy:** The Compose file does not include TLS termination. In production, put Caddy, Traefik, or nginx in front of the web container. If the API and web run on different hosts, set `CORS_ORIGINS` to the web origin and `COOKIE_DOMAIN` to the parent domain so the session cookie is shared.

**Updating:**

Check out the release tag, set `MARROW_VERSION` in `.env` to the same tag (so the API image and web build stay in sync), then pull and restart:

```bash
git fetch --tags
git checkout v0.3.4          # pick the release you want
# edit .env — set MARROW_VERSION=v0.3.4 to match
docker compose -f docker-compose.prod.yml pull api
docker compose -f docker-compose.prod.yml up -d --build
```

The API image is pulled from GHCR using `MARROW_VERSION`; the web image is rebuilt from the checked-out source. If you skip updating `MARROW_VERSION`, `pull api` keeps resolving the old tag while the web container rebuilds from the new checkout.

Full reference: **[Docker Compose](./docs/src/content/docs/deployment/docker-compose.md)** · **[Environment variables](./docs/src/content/docs/configuration/env-vars.md)**

---

## Development

**Prerequisites:** Python 3.11+, Node.js 20+, Docker.

```bash
git clone https://github.com/marrow-software/marrow.git
cd marrow

# Database
docker compose up -d

# Backend
cd api
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
uvicorn main:app --reload         # http://localhost:8000
```

In a second terminal:

```bash
cd web
npm install
cp .env.local.example .env.local
npm run dev                       # http://localhost:3000
```

For more depth see **[Quickstart](./docs/src/content/docs/getting-started/quickstart.md)**.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Backend | FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL 16 |
| Frontend | Next.js 16, React 19, Tailwind 4, Base UI, BlockNote (`web/`) |
| Auth | OIDC (any provider) + API key fallback |
| Search | PostgreSQL FTS (Meilisearch later) |
| Storage | Local filesystem; S3-compatible object storage |
| CLI | Typer (`marrow export`, `marrow restore`) |

---

## Tests

```bash
cd api && pytest                            # full suite (integration tests use a real DB)
cd api && pytest tests/test_round_trip.py   # the restore-guarantee regression anchor
cd web && npm run lint && npm run build     # frontend
cd docs && npm run build                    # docs site
```

---

## Contributing

Marrow is open source because the philosophy demands it. A sovereign knowledge base built behind closed doors would be a contradiction.

Before writing code, read the **[Restore guarantee](./docs/src/content/docs/concepts/restore-guarantee.md)**. Any contribution that compromises the export/restore round-trip will not be merged.

---

## License

Apache 2.0. Use it, fork it, deploy it, build on it. Just don't tell people their data is theirs if it isn't.

---

*Marrow: the core that holds everything together — portable, durable, yours.*
