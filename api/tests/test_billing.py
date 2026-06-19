"""Webhook handler tests — subscription_status transitions + confirmation email."""

import logging
import os
import uuid

import psycopg2
import pytest
from alembic.config import Config
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.requests import Request

from alembic import command
from marrow.models import Organization
from marrow.routers import billing

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://marrow:marrow@localhost:5433/marrow")


def _base_dsn() -> str:
    return DATABASE_URL.rsplit("/", 1)[0]


def _alembic_cfg(url: str) -> Config:
    os.environ["DATABASE_URL"] = url
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


@pytest.fixture(scope="module")
def db_url():
    db_name = f"marrow_billing_{uuid.uuid4().hex[:8]}"
    admin = psycopg2.connect(f"{_base_dsn()}/postgres")
    admin.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    with admin.cursor() as cur:
        cur.execute(f'CREATE DATABASE "{db_name}"')
    admin.close()

    url = f"{_base_dsn()}/{db_name}"
    command.upgrade(_alembic_cfg(url), "head")
    yield url

    admin = psycopg2.connect(f"{_base_dsn()}/postgres")
    admin.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    with admin.cursor() as cur:
        cur.execute(f'DROP DATABASE "{db_name}" WITH (FORCE)')
    admin.close()


@pytest.fixture(scope="module")
def engine(db_url):
    eng = create_engine(db_url)
    yield eng
    eng.dispose()


@pytest.fixture()
def db(engine):
    conn = engine.connect()
    tx = conn.begin()
    session = Session(bind=conn)
    yield session
    session.close()
    tx.rollback()
    conn.close()


@pytest.fixture(autouse=True)
def _enable_billing_logger():
    # Alembic's fileConfig (run by the db_url fixture) disables pre-existing
    # loggers, which would silently swallow the records caplog asserts on.
    logging.getLogger("marrow.routers.billing").disabled = False


def _seed_org(db: Session, *, customer="cus_test", **overrides) -> Organization:
    org = Organization(
        slug=f"org-{uuid.uuid4().hex[:6]}",
        name="Acme",
        stripe_customer_id=customer,
        **overrides,
    )
    db.add(org)
    db.flush()
    return org


def _stripe_obj(payload: dict):
    return billing.stripe.StripeObject.construct_from(payload, None)


@pytest.fixture
def stub_email(monkeypatch):
    sent: list[dict] = []

    def _fake(to, subject, html):
        sent.append({"to": to, "subject": subject, "html": html})
        return True

    monkeypatch.setattr(billing, "send_email", _fake)
    return sent


def _sub_obj(status: str, price_id: str = "price_business_monthly"):
    return _stripe_obj(
        {
            "id": "sub_test",
            "object": "subscription",
            "status": status,
            "items": {
                "object": "list",
                "data": [
                    {
                        "object": "subscription_item",
                        "price": {
                            "object": "price",
                            "id": price_id,
                            "recurring": {"interval": "month"},
                        },
                    }
                ],
            },
        }
    )


@pytest.fixture
def known_price(monkeypatch):
    monkeypatch.setattr(
        billing, "_PRICE_TO_TIER", {"price_business_monthly": ("business", "cloud")}
    )


def test_checkout_completed_sets_trialing_and_emails(db, monkeypatch, stub_email, known_price):
    org = _seed_org(db, customer="cus_co")
    monkeypatch.setattr(billing.stripe.Subscription, "retrieve", lambda sid: _sub_obj("trialing"))

    session = _stripe_obj(
        {
            "object": "checkout.session",
            "customer": "cus_co",
            "subscription": "sub_co",
            "metadata": {"org_id": str(org.id)},
            "customer_details": {"email": "buyer@example.com"},
        }
    )
    billing._handle_checkout_completed(session, db)
    db.refresh(org)

    assert org.subscription_status == "trialing"
    assert org.tier == "business"
    assert org.stripe_subscription_id == "sub_co"
    assert len(stub_email) == 1
    assert stub_email[0]["to"] == "buyer@example.com"


def test_subscription_updated_maps_status(db, known_price):
    org = _seed_org(db, customer="cus_up", subscription_status="trialing")
    sub = _sub_obj("active")
    sub.id = "sub_up"
    sub.customer = "cus_up"
    billing._handle_subscription_updated(sub, db)
    db.refresh(org)
    assert org.subscription_status == "active"
    assert org.tier == "business"


def test_subscription_deleted_marks_canceled(db):
    org = _seed_org(db, customer="cus_del", subscription_status="active", tier="business")
    billing._handle_subscription_deleted(
        _stripe_obj({"id": "sub_del", "object": "subscription", "customer": "cus_del"}), db
    )
    db.refresh(org)
    assert org.subscription_status == "canceled"
    assert org.stripe_subscription_id is None


def test_payment_failed_marks_past_due(db):
    org = _seed_org(db, customer="cus_pf", subscription_status="active")
    billing._handle_payment_failed(
        _stripe_obj({"id": "in_pf", "object": "invoice", "customer": "cus_pf"}), db
    )
    db.refresh(org)
    assert org.subscription_status == "past_due"


def test_handlers_noop_for_unknown_customer(db):
    # No org with this customer — must not raise.
    billing._handle_payment_failed(
        _stripe_obj({"id": "in_missing", "object": "invoice", "customer": "cus_missing"}), db
    )
    billing._handle_subscription_deleted(
        _stripe_obj({"id": "sub_missing", "object": "subscription", "customer": "cus_missing"}),
        db,
    )


# ---------------------------------------------------------------------------
# Webhook observability — every early-return must log (#214)
# ---------------------------------------------------------------------------


def test_checkout_completed_missing_fields_logs(db, caplog):
    with caplog.at_level("WARNING", logger="marrow.routers.billing"):
        billing._handle_checkout_completed(_stripe_obj({"object": "checkout.session"}), db)
    assert any("missing fields" in r.message for r in caplog.records)


def test_checkout_completed_unknown_org_logs(db, caplog):
    session = _stripe_obj(
        {
            "object": "checkout.session",
            "customer": "cus_ghost",
            "subscription": "sub_ghost",
            "metadata": {"org_id": str(uuid.uuid4())},
        }
    )
    with caplog.at_level("WARNING", logger="marrow.routers.billing"):
        billing._handle_checkout_completed(session, db)
    assert any("matched no org" in r.message for r in caplog.records)


def test_subscription_updated_unknown_customer_logs(db, caplog):
    with caplog.at_level("WARNING", logger="marrow.routers.billing"):
        billing._handle_subscription_updated(
            _stripe_obj({"id": "sub_x", "object": "subscription", "customer": "cus_missing"}), db
        )
    assert any("matched no org" in r.message for r in caplog.records)


def test_unknown_price_logs(db, caplog, monkeypatch):
    org = _seed_org(db, customer="cus_badprice")
    monkeypatch.setattr(billing, "_PRICE_TO_TIER", {})
    with caplog.at_level("WARNING", logger="marrow.routers.billing"):
        sub = _sub_obj("active")
        sub.id = "sub_bp"
        applied = billing._apply_subscription(org, sub, db)
    assert applied is False
    assert any("unrecognized price" in r.message for r in caplog.records)


def test_payment_failed_unknown_customer_logs(db, caplog):
    with caplog.at_level("WARNING", logger="marrow.routers.billing"):
        billing._handle_payment_failed(
            _stripe_obj({"id": "in_missing", "object": "invoice", "customer": "cus_missing"}), db
        )
    assert any("matched no org" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# Reconcile — pull subscription truth from Stripe (#214)
# ---------------------------------------------------------------------------


def _stub_subscription_list(monkeypatch, data):
    calls = []

    def _fake_list(**kwargs):
        calls.append(kwargs)
        return _stripe_obj({"object": "list", "data": data})

    monkeypatch.setattr(billing.stripe.Subscription, "list", _fake_list)
    return calls


def test_reconcile_writes_subscription_from_stripe(db, monkeypatch, known_price):
    monkeypatch.setenv("SAAS_MODE", "true")
    org = _seed_org(db, customer="cus_rec")
    sub = _sub_obj("trialing")
    sub.id = "sub_rec"
    calls = _stub_subscription_list(monkeypatch, [sub])

    result = billing.reconcile_subscription(org.id, db=db, auth=None)
    db.refresh(org)

    assert calls == [{"customer": "cus_rec", "status": "all", "limit": 1}]
    assert result["reconciled"] is True
    assert result["has_active_subscription"] is True
    assert org.subscription_status == "trialing"
    assert org.tier == "business"
    assert org.billing_interval == "monthly"
    assert org.stripe_subscription_id == "sub_rec"


def test_reconcile_without_customer_is_clean_noop(db, monkeypatch, caplog):
    monkeypatch.setenv("SAAS_MODE", "true")
    org = _seed_org(db, customer=None)

    with caplog.at_level("WARNING", logger="marrow.routers.billing"):
        result = billing.reconcile_subscription(org.id, db=db, auth=None)
    db.refresh(org)

    assert result["reconciled"] is False
    assert result["reason"] == "no_customer"
    assert result["has_active_subscription"] is False
    assert org.subscription_status == "none"
    assert any("no Stripe customer" in r.message for r in caplog.records)


def test_reconcile_with_no_subscriptions(db, monkeypatch, caplog):
    monkeypatch.setenv("SAAS_MODE", "true")
    org = _seed_org(db, customer="cus_empty")
    _stub_subscription_list(monkeypatch, [])

    with caplog.at_level("WARNING", logger="marrow.routers.billing"):
        result = billing.reconcile_subscription(org.id, db=db, auth=None)

    assert result["reconciled"] is False
    assert result["reason"] == "no_subscription"
    assert any("found no subscriptions" in r.message for r in caplog.records)


def test_reconcile_with_unknown_price(db, monkeypatch):
    monkeypatch.setenv("SAAS_MODE", "true")
    org = _seed_org(db, customer="cus_unk")
    monkeypatch.setattr(billing, "_PRICE_TO_TIER", {})
    sub = _sub_obj("active")
    sub.id = "sub_unk"
    _stub_subscription_list(monkeypatch, [sub])

    result = billing.reconcile_subscription(org.id, db=db, auth=None)
    db.refresh(org)

    assert result["reconciled"] is False
    assert result["reason"] == "unknown_price"
    assert org.subscription_status == "none"


@pytest.mark.asyncio
async def test_stripe_webhook_logs_handler_errors_and_returns_200(db, monkeypatch, caplog):
    event = _stripe_obj(
        {
            "id": "evt_checkout",
            "object": "event",
            "type": "checkout.session.completed",
            "data": {"object": {"object": "checkout.session"}},
        }
    )
    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda payload, sig_header, webhook_secret: event,
    )

    def _boom(session, db):
        raise RuntimeError("subscription persistence failed")

    monkeypatch.setattr(billing, "_handle_checkout_completed", _boom)

    async def receive():
        return {"type": "http.request", "body": b"{}", "more_body": False}

    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/billing/webhook",
            "headers": [(b"stripe-signature", b"sig_test")],
        },
        receive,
    )

    with caplog.at_level("ERROR", logger="marrow.routers.billing"):
        response = await billing.stripe_webhook(request, db=db)

    assert response.status_code == 200
    assert any("Stripe webhook handler failed" in r.message for r in caplog.records)
