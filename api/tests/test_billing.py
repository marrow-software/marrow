"""Webhook handler tests — subscription_status transitions + confirmation email."""

import os
import uuid

import psycopg2
import pytest
from alembic.config import Config
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

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


@pytest.fixture
def stub_email(monkeypatch):
    sent: list[dict] = []

    def _fake(to, subject, html):
        sent.append({"to": to, "subject": subject, "html": html})
        return True

    monkeypatch.setattr(billing, "send_email", _fake)
    return sent


def _sub_obj(status: str, price_id: str = "price_business_monthly"):
    return {
        "status": status,
        "items": {"data": [{"price": {"id": price_id, "recurring": {"interval": "month"}}}]},
    }


@pytest.fixture
def known_price(monkeypatch):
    monkeypatch.setattr(
        billing, "_PRICE_TO_TIER", {"price_business_monthly": ("business", "cloud")}
    )


def test_checkout_completed_sets_trialing_and_emails(db, monkeypatch, stub_email, known_price):
    org = _seed_org(db, customer="cus_co")
    monkeypatch.setattr(billing.stripe.Subscription, "retrieve", lambda sid: _sub_obj("trialing"))

    session = {
        "customer": "cus_co",
        "subscription": "sub_co",
        "metadata": {"org_id": str(org.id)},
        "customer_details": {"email": "buyer@example.com"},
    }
    billing._handle_checkout_completed(session, db)
    db.refresh(org)

    assert org.subscription_status == "trialing"
    assert org.tier == "business"
    assert org.stripe_subscription_id == "sub_co"
    assert len(stub_email) == 1
    assert stub_email[0]["to"] == "buyer@example.com"


def test_subscription_updated_maps_status(db, known_price):
    org = _seed_org(db, customer="cus_up", subscription_status="trialing")
    billing._handle_subscription_updated(
        {"id": "sub_up", "customer": "cus_up", **_sub_obj("active")}, db
    )
    db.refresh(org)
    assert org.subscription_status == "active"
    assert org.tier == "business"


def test_subscription_deleted_marks_canceled(db):
    org = _seed_org(db, customer="cus_del", subscription_status="active", tier="business")
    billing._handle_subscription_deleted({"id": "sub_del", "customer": "cus_del"}, db)
    db.refresh(org)
    assert org.subscription_status == "canceled"
    assert org.stripe_subscription_id is None


def test_payment_failed_marks_past_due(db):
    org = _seed_org(db, customer="cus_pf", subscription_status="active")
    billing._handle_payment_failed({"customer": "cus_pf"}, db)
    db.refresh(org)
    assert org.subscription_status == "past_due"


def test_handlers_noop_for_unknown_customer(db):
    # No org with this customer — must not raise.
    billing._handle_payment_failed({"customer": "cus_missing"}, db)
    billing._handle_subscription_deleted({"customer": "cus_missing"}, db)
