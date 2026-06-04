# Marrow

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
4. **Pluggable storage** — Local filesystem or Cloudflare R2. Business logic never bypasses the storage adapter.
5. **Self-hosted by default** — Your data stays on infrastructure you control.

See **[Restore guarantee](./docs/src/content/docs/concepts/restore-guarantee.md)** for the full explanation.

---

## What Marrow is (v0.2)

- Content organized in a tree: Organizations → Workspaces → Spaces → Folders / Pages
- BlockNote-powered editor with code blocks, tables, page links, and `@` mentions
- Folder views: table, board, and list — rendered from page properties
- Node properties (text, number, date, select, multi-select, checkbox) inherited from parent folders
- Comments (threads, replies, resolve) on any page
- Backlinks — every page knows what links to it
- Stars, watches, and per-user Inbox (notifications for edits and `@` mentions)
- View-only share links for any page or folder (no account required to view)
- File attachments
- Full-text search across a workspace
- Append-only revision history on every save
- One-command export to a transparent zip bundle (full or slim)
- One-command restore from any export bundle (forwards-compatible across versions)
- OIDC authentication with org-level RBAC (owner / editor / viewer)
- Pluggable storage (local filesystem; Cloudflare R2)

---

## Quickstart (development)

**Prerequisites:** Python 3.11+, Node.js 20+, Docker.

```bash
git clone https://github.com/spmcgraw/marrow.git
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

## Production deployment

- **[Docker Compose](./docs/src/content/docs/deployment/docker-compose.md)** — recommended. Build images, configure `.env`, `docker compose -f docker-compose.prod.yml up`.
- **[Cloudflare](./docs/src/content/docs/deployment/cloudflare.md)** — Workers + Containers + Neon + R2. The full Cloudflare stack is supported as of v0.2.

See **[Environment variables](./docs/src/content/docs/configuration/env-vars.md)** for the full config reference and **[OIDC](./docs/src/content/docs/configuration/oidc.md)** for sign-in setup.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Backend | FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL 16 |
| Product app | Next.js 16, React 19, Tailwind 4, Base UI, BlockNote (`web/`) |
| Marketing site | Next.js 16, static export to Cloudflare Pages (`web-marketing/`) |
| Auth | OIDC (any provider, Auth0 recommended for multi-provider) + API key fallback |
| Search | PostgreSQL FTS (Meilisearch later) |
| Storage | Local filesystem; Cloudflare R2 |
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
