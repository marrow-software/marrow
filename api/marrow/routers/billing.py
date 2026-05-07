"""Stripe billing — checkout, portal, and webhook endpoints."""

import os
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db, verify_auth
from ..models import Organization, OrgMembership
from ..rbac import require_org_role
from ..models import OrgRole

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
_webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
_saas_mode = os.getenv("SAAS_MODE", "").strip().lower() in ("1", "true", "yes", "on")

# Cloud flat-rate prices per tier × interval
_CLOUD_PRICES: dict[str, dict[str, str]] = {
    "starter": {
        "monthly": os.getenv("STRIPE_STARTER_PRICE_MONTHLY", ""),
        "yearly": os.getenv("STRIPE_STARTER_PRICE_YEARLY", ""),
    },
    "business": {
        "monthly": os.getenv("STRIPE_BUSINESS_PRICE_MONTHLY", ""),
        "yearly": os.getenv("STRIPE_BUSINESS_PRICE_YEARLY", ""),
    },
    "growth": {
        "monthly": os.getenv("STRIPE_GROWTH_PRICE_MONTHLY", ""),
        "yearly": os.getenv("STRIPE_GROWTH_PRICE_YEARLY", ""),
    },
}

# Self-hosted per-seat annual prices
_SH_PRICES: dict[str, str] = {
    "business": os.getenv("STRIPE_SH_BUSINESS_PRICE_YEARLY", ""),
    "enterprise": os.getenv("STRIPE_SH_ENTERPRISE_PRICE_YEARLY", ""),
}

# Reverse map: price_id → (tier, mode)
_PRICE_TO_TIER: dict[str, tuple[str, str]] = {}
for _tier, _intervals in _CLOUD_PRICES.items():
    for _price_id in _intervals.values():
        if _price_id:
            _PRICE_TO_TIER[_price_id] = (_tier, "cloud")
for _tier, _price_id in _SH_PRICES.items():
    if _price_id:
        _PRICE_TO_TIER[_price_id] = (_tier, "self_hosted")

# Seat caps per tier (None = unlimited)
TIER_SEAT_LIMITS: dict[str, int | None] = {
    "starter": 10,
    "business": 50,
    "growth": 250,
    "enterprise": None,
}

router = APIRouter(prefix="/api/billing", tags=["billing"])


def _get_or_create_customer(org: Organization) -> str:
    """Return the Stripe customer ID for an org, creating one if needed."""
    if org.stripe_customer_id:
        return org.stripe_customer_id
    customer = stripe.Customer.create(
        name=org.name,
        metadata={"org_id": str(org.id), "org_slug": org.slug},
    )
    return customer.id


@router.post("/{org_id}/checkout")
def create_checkout_session(
    org_id: UUID,
    tier: str,
    interval: str = "monthly",
    quantity: int = 1,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_org_role(OrgRole.OWNER)),
):
    """Create a Stripe Checkout session for a Cloud or self-hosted plan."""
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(404, "Organization not found")

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    # Determine price ID
    if tier in _CLOUD_PRICES:
        if interval not in ("monthly", "yearly"):
            raise HTTPException(422, "interval must be 'monthly' or 'yearly'")
        price_id = _CLOUD_PRICES[tier].get(interval, "")
        line_quantity = 1  # flat rate
    elif tier in _SH_PRICES:
        price_id = _SH_PRICES[tier]
        line_quantity = max(1, quantity)  # per-seat
    else:
        raise HTTPException(422, f"Unknown tier: {tier}")

    if not price_id:
        raise HTTPException(500, f"Price ID for {tier}/{interval} is not configured")

    customer_id = _get_or_create_customer(org)
    org.stripe_customer_id = customer_id
    db.commit()

    session = stripe.checkout.Session.create(
        customer=customer_id,
        line_items=[{"price": price_id, "quantity": line_quantity}],
        mode="subscription",
        success_url=f"{frontend_url}/orgs/{org_id}/billing?success=1",
        cancel_url=f"{frontend_url}/orgs/{org_id}/billing?canceled=1",
        metadata={"org_id": str(org_id)},
    )
    return {"url": session.url}


@router.post("/{org_id}/portal")
def create_portal_session(
    org_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_org_role(OrgRole.OWNER)),
):
    """Create a Stripe Customer Portal session for managing the subscription."""
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(404, "Organization not found")
    if not org.stripe_customer_id:
        raise HTTPException(400, "No active subscription found for this organization")

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    session = stripe.billing_portal.Session.create(
        customer=org.stripe_customer_id,
        return_url=f"{frontend_url}/orgs/{org_id}/billing",
    )
    return {"url": session.url}


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Stripe webhook events. Signature verified before processing."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, _webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid Stripe signature")

    if event["type"] == "checkout.session.completed":
        _handle_checkout_completed(event["data"]["object"], db)
    elif event["type"] == "customer.subscription.updated":
        _handle_subscription_updated(event["data"]["object"], db)
    elif event["type"] == "customer.subscription.deleted":
        _handle_subscription_deleted(event["data"]["object"], db)
    elif event["type"] == "invoice.payment_failed":
        # Log only — do not downgrade on first failure; Stripe retries
        pass

    return JSONResponse({"received": True})


def _org_by_customer(customer_id: str, db: Session) -> Organization | None:
    return db.execute(
        select(Organization).where(Organization.stripe_customer_id == customer_id)
    ).scalar_one_or_none()


def _tier_from_subscription(subscription: dict) -> tuple[str, str] | None:
    """Return (tier, interval) from the first line item's price ID, or None."""
    items = subscription.get("items", {}).get("data", [])
    if not items:
        return None
    price_id = items[0]["price"]["id"]
    interval = items[0]["price"]["recurring"]["interval"]  # 'month' or 'year'
    tier_info = _PRICE_TO_TIER.get(price_id)
    if not tier_info:
        return None
    tier, _ = tier_info
    billing_interval = "yearly" if interval == "year" else "monthly"
    return tier, billing_interval


def _handle_checkout_completed(session: dict, db: Session) -> None:
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")
    org_id = session.get("metadata", {}).get("org_id")
    if not (customer_id and subscription_id and org_id):
        return

    org = db.get(Organization, org_id) or _org_by_customer(customer_id, db)
    if org is None:
        return

    subscription = stripe.Subscription.retrieve(subscription_id)
    result = _tier_from_subscription(subscription)
    if result is None:
        return
    tier, billing_interval = result

    org.stripe_customer_id = customer_id
    org.stripe_subscription_id = subscription_id
    org.tier = tier
    org.billing_interval = billing_interval
    db.commit()


def _handle_subscription_updated(subscription: dict, db: Session) -> None:
    customer_id = subscription.get("customer")
    subscription_id = subscription.get("id")
    org = _org_by_customer(customer_id, db)
    if org is None:
        return

    result = _tier_from_subscription(subscription)
    if result is None:
        return
    tier, billing_interval = result

    org.stripe_subscription_id = subscription_id
    org.tier = tier
    org.billing_interval = billing_interval
    db.commit()


def _handle_subscription_deleted(subscription: dict, db: Session) -> None:
    customer_id = subscription.get("customer")
    org = _org_by_customer(customer_id, db)
    if org is None:
        return

    org.tier = "starter"
    org.stripe_subscription_id = None
    org.billing_interval = None
    db.commit()
