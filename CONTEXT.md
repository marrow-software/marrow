# Marrow domain glossary

Shared vocabulary for architecture and product work. Prefer these names in code, reviews, and ADRs.

## page revision persistence

The module (`api/marrow/page_revisions.py`, `persist_page_revision`) that appends an immutable page revision and reconciles derived indexes on every content save:

- `node_links` via `reconcile_node_links`
- `@`-mention Inbox notifications (delta vs previous revision)
- `watch_event` fan-out (best-effort, nested savepoint)

Caller owns the DB transaction (flush in the module; commit in the router). Both page create and page update content paths go through this module so save side effects stay in one place.

Related constraints: append-only revisions (DB trigger); restore guarantee (user-scoped notifications/watches are never exported).
