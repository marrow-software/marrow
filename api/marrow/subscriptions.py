"""Subscription gating helpers — the single source of truth for whether an
organization counts as having an active subscription.

An org is **active** when:
  * SaaS mode is off (self-hosted is never gated), OR
  * its tier is ``enterprise`` (always-active), OR
  * its ``subscription_status`` is ``trialing`` or ``active``.

``is_saas_mode`` reads the env var dynamically (not cached at import) so tests
can toggle ``SAAS_MODE`` per case.
"""

import os

# Statuses that grant access. ``trialing`` counts as active so a Checkout with
# a trial lands the user in the app immediately.
ACTIVE_STATUSES = frozenset({"trialing", "active"})


def is_saas_mode() -> bool:
    return os.getenv("SAAS_MODE", "").strip().lower() in ("1", "true", "yes", "on")


def is_org_active(tier: str | None, subscription_status: str | None) -> bool:
    """Whether an org has access (see module docstring)."""
    if not is_saas_mode():
        return True
    if tier == "enterprise":
        return True
    return subscription_status in ACTIVE_STATUSES
