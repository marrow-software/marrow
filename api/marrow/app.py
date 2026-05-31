"""FastAPI application factory."""

import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .dependencies import verify_auth
from .routers import auth, billing, comments, nodes, notifications, organizations, properties, share_links, spaces, users, views, workspaces


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

app = FastAPI(title="Marrow API", version="0.1.0")

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
app.include_router(properties.router, dependencies=_auth)
app.include_router(views.router, dependencies=_auth)
# Share-links router is registered WITHOUT the global auth dependency: the
# public GET /shared/{token} view must be reachable without an account, while
# the management routes carry their own require_node_role / require_share_link_role
# dependencies.
app.include_router(share_links.router)


@app.get("/health")
def health():
    return {"status": "ok"}
