"""FastAPI application factory."""

import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .dependencies import verify_auth
from .routers import auth, billing, comments, nodes, notifications, organizations, share_links, spaces, users, workspaces


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes", "on")


# Refuse to start unconfigured. Anonymous mode bypasses all RBAC, so it must
# only be enabled via explicit opt-in (MARROW_ALLOW_ANONYMOUS=true) — typically
# only in local dev. Production deploys must set OIDC_ISSUER or API_KEY.
_oidc_enabled = bool((os.getenv("OIDC_ISSUER") or "").strip())
_api_key_set = bool((os.getenv("API_KEY") or "").strip())
_allow_anonymous = _truthy(os.getenv("MARROW_ALLOW_ANONYMOUS"))
if not (_oidc_enabled or _api_key_set or _allow_anonymous):
    raise RuntimeError(
        "Refusing to start: no authentication is configured. "
        "Set OIDC_ISSUER (preferred), API_KEY, or MARROW_ALLOW_ANONYMOUS=true "
        "(local dev only — bypasses all access control)."
    )

# Allow the origin list to be overridden via env var for non-local deployments.
_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

_secret_key = os.getenv("SECRET_KEY", "changeme")


def _ensure_default_org_and_workspace() -> None:
    """Create a 'Default' org and workspace if none exist (API_KEY-only mode)."""
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session

    from .dependencies import _engine
    from .models import Organization, Workspace
    from .routers.auth import _unique_org_slug, _unique_workspace_slug

    with Session(_engine) as db:
        if db.query(Organization).first() is not None:
            return
        org_slug = _unique_org_slug(db, "default")
        org = Organization(slug=org_slug, name="Default")
        db.add(org)
        db.flush()
        ws_slug = _unique_workspace_slug(db, "default")
        db.add(Workspace(org_id=org.id, slug=ws_slug, name="Default"))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()  # another process won the race — that's fine


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    # In API_KEY-only mode (no OIDC), lazily provision the Default org+workspace
    # so operators don't need to call the API before using the web UI.
    if _api_key_set and not _oidc_enabled:
        _ensure_default_org_and_workspace()
    yield


app = FastAPI(title="Marrow API", version="0.1.0", lifespan=lifespan)

# SessionMiddleware is required by authlib for OAuth state management.
app.add_middleware(SessionMiddleware, secret_key=_secret_key)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth router is registered WITHOUT the global auth dependency so that
# unauthenticated users can initiate the login flow.
app.include_router(auth.router)

# All other routers require authentication.
_auth = [Depends(verify_auth)]

app.include_router(organizations.router, dependencies=_auth)
# Billing router is registered without global auth — the webhook must be unauthenticated
# (Stripe calls it directly), and checkout/portal endpoints carry their own require_org_role deps.
app.include_router(billing.router)
app.include_router(workspaces.router, dependencies=_auth)
app.include_router(spaces.router, dependencies=_auth)
app.include_router(nodes.router, dependencies=_auth)
app.include_router(comments.router, dependencies=_auth)
app.include_router(users.router, dependencies=_auth)
app.include_router(notifications.router, dependencies=_auth)
# Share-links router is registered WITHOUT the global auth dependency: the
# public GET /shared/{token} view must be reachable without an account, while
# the management routes carry their own require_node_role / require_share_link_role
# dependencies.
app.include_router(share_links.router)


@app.get("/health")
def health():
    return {"status": "ok"}
