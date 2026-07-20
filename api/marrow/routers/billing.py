"""Stripe billing — checkout, portal, webhook, and reconcile endpoints."""

import logging
import os
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..dependencies import AuthContext, get_db
from ..email import send_email, subscription_confirmation_html
from ..models import Organization, OrgRole
from ..rbac import require_org_role
from ..subscriptions import is_org_active

logger = logging.getLogger(__name__)

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


class CheckoutRequest(BaseModel):
    tier: str
    interval: str = "monthly"
    quantity: int = 1


# Map Stripe subscription.status -> our subscription_status enum.
_STRIPE_STATUS_MAP: dict[str, str] = {
    "trialing": "trialing",
    "active": "active",
    "past_due": "past_due",
    "unpaid": "past_due",
    "incomplete": "past_due",
    "paused": "past_due",
    "canceled": "canceled",
    "incomplete_expired": "canceled",
}


def _map_stripe_status(status: str | None) -> str:
    """Translate a Stripe subscription status to our enum (default ``none``)."""
    if not status:
        return "none"
    return _STRIPE_STATUS_MAP.get(status, "none")


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
    body: CheckoutRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_org_role(OrgRole.OWNER)),
):
    """Create a Stripe Checkout session (with a 14-day trial) for a plan."""
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(404, "Organization not found")

    tier = body.tier
    interval = body.interval
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    # Determine price ID
    if tier in _CLOUD_PRICES:
        if interval not in ("monthly", "yearly"):
            raise HTTPException(422, "interval must be 'monthly' or 'yearly'")
        price_id = _CLOUD_PRICES[tier].get(interval, "")
        line_quantity = 1  # flat rate
    elif tier in _SH_PRICES:
        price_id = _SH_PRICES[tier]
        line_quantity = max(1, body.quantity)  # per-seat
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
        subscription_data={"trial_period_days": 14},
        success_url=f"{frontend_url}/subscribe/success?org={org_id}",
        cancel_url=f"{frontend_url}/subscribe?org={org_id}&canceled=1",
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
        return_url=f"{frontend_url}/home",
    )
    return {"url": session.url}


@router.post("/{org_id}/reconcile")
def reconcile_subscription(
    org_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_org_role(OrgRole.OWNER)),
):
    """Pull the org's subscription truth from Stripe and persist it.

    Webhook-independent self-heal: makes a completed Checkout land even when
    the `checkout.session.completed` webhook never arrives.
    """
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(404, "Organization not found")

    def _result(reconciled: bool, reason: str | None = None):
        return {
            "reconciled": reconciled,
            "reason": reason,
            "tier": org.tier,
            "subscription_status": org.subscription_status,
            "has_active_subscription": is_org_active(org.tier, org.subscription_status),
        }

    if not org.stripe_customer_id:
        logger.warning("billing: reconcile for org %s skipped — no Stripe customer", org.id)
        return _result(False, "no_customer")

    subscriptions = stripe.Subscription.list(customer=org.stripe_customer_id, status="all", limit=1)
    data = subscriptions.get("data") or []
    if not data:
        logger.warning(
            "billing: reconcile for org %s found no subscriptions (customer=%s)",
            org.id,
            org.stripe_customer_id,
        )
        return _result(False, "no_subscription")

    if not _apply_subscription(org, data[0], db):
        return _result(False, "unknown_price")
    return _result(True)


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
        _handle_payment_failed(event["data"]["object"], db)

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


def _apply_subscription(
    org: Organization,
    subscription: dict,
    db: Session,
    *,
    subscription_id: str | None = None,
    default_status: str | None = None,
) -> bool:
    """Persist a Stripe subscription's tier/interval/status onto an org.

    Single write path shared by the webhook handlers and the reconcile
    endpoint. Returns False (after logging) when the subscription's price
    isn't one of ours.
    """
    result = _tier_from_subscription(subscription)
    if result is None:
        logger.warning(
            "billing: subscription %s for org %s has an unrecognized price; "
            "check STRIPE_*_PRICE_* configuration",
            subscription_id or subscription.get("id"),
            org.id,
        )
        return False
    tier, billing_interval = result

    org.stripe_subscription_id = subscription_id or subscription.get("id")
    org.tier = tier
    org.billing_interval = billing_interval
    # StripeObject supports .get(); default_status covers checkout, where the
    # subscription was just created with a trial period.
    org.subscription_status = _map_stripe_status(subscription.get("status") or default_status)
    db.commit()
    return True


def _handle_checkout_completed(session: dict, db: Session) -> None:
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")
    org_id = session.get("metadata", {}).get("org_id")
    if not (customer_id and subscription_id and org_id):
        logger.warning(
            "billing: checkout.session.completed missing fields "
            "(customer=%s subscription=%s org_id=%s); org not updated",
            customer_id,
            subscription_id,
            org_id,
        )
        return

    org = db.get(Organization, org_id) or _org_by_customer(customer_id, db)
    if org is None:
        logger.warning(
            "billing: checkout.session.completed matched no org (org_id=%s customer=%s)",
            org_id,
            customer_id,
        )
        return

    subscription = stripe.Subscription.retrieve(subscription_id)
    org.stripe_customer_id = customer_id
    if not _apply_subscription(
        org, subscription, db, subscription_id=subscription_id, default_status="trialing"
    ):
        return

    # Best-effort confirmation email — never blocks the webhook 200.
    recipient = session.get("customer_details", {}).get("email") or session.get("customer_email")
    if recipient:
        send_email(
            to=recipient,
            subject="Your Marrow subscription is active",
            html=subscription_confirmation_html(org.name, org.tier),
        )


def _handle_subscription_updated(subscription: dict, db: Session) -> None:
    customer_id = subscription.get("customer")
    org = _org_by_customer(customer_id, db)
    if org is None:
        logger.warning(
            "billing: customer.subscription.updated matched no org (customer=%s)",
            customer_id,
        )
        return

    _apply_subscription(org, subscription, db)


def _handle_subscription_deleted(subscription: dict, db: Session) -> None:
    customer_id = subscription.get("customer")
    org = _org_by_customer(customer_id, db)
    if org is None:
        logger.warning(
            "billing: customer.subscription.deleted matched no org (customer=%s)",
            customer_id,
        )
        return

    org.tier = "starter"
    org.stripe_subscription_id = None
    org.billing_interval = None
    org.subscription_status = "canceled"
    db.commit()


def _handle_payment_failed(invoice: dict, db: Session) -> None:
    """Mark the org past_due on a failed invoice payment. Stripe keeps retrying."""
    customer_id = invoice.get("customer")
    org = _org_by_customer(customer_id, db)
    if org is None:
        logger.warning(
            "billing: invoice.payment_failed matched no org (customer=%s)",
            customer_id,
        )
        return
    org.subscription_status = "past_due"
    db.commit()
