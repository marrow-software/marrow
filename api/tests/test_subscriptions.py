"""Unit tests for subscription gating logic and status mapping (no DB)."""

import uuid
from datetime import datetime, timezone

import pytest

from marrow.routers.billing import _map_stripe_status
from marrow.schemas import OrganizationRead
from marrow.subscriptions import is_org_active, is_saas_mode


@pytest.fixture
def saas_on(monkeypatch):
    monkeypatch.setenv("SAAS_MODE", "true")


@pytest.fixture
def saas_off(monkeypatch):
    monkeypatch.delenv("SAAS_MODE", raising=False)


def test_is_saas_mode_reads_env_dynamically(monkeypatch):
    monkeypatch.setenv("SAAS_MODE", "true")
    assert is_saas_mode() is True
    monkeypatch.setenv("SAAS_MODE", "false")
    assert is_saas_mode() is False
    monkeypatch.delenv("SAAS_MODE", raising=False)
    assert is_saas_mode() is False


def test_self_hosted_is_always_active(saas_off):
    assert is_org_active("starter", "none") is True
    assert is_org_active("starter", "canceled") is True


def test_enterprise_is_always_active(saas_on):
    assert is_org_active("enterprise", "none") is True
    assert is_org_active("enterprise", "canceled") is True


@pytest.mark.parametrize(
    "status,expected",
    [
        ("none", False),
        ("trialing", True),
        ("active", True),
        ("past_due", False),
        ("canceled", False),
    ],
)
def test_saas_active_by_status(saas_on, status, expected):
    assert is_org_active("starter", status) is expected


@pytest.mark.parametrize(
    "stripe_status,expected",
    [
        ("trialing", "trialing"),
        ("active", "active"),
        ("past_due", "past_due"),
        ("unpaid", "past_due"),
        ("incomplete", "past_due"),
        ("paused", "past_due"),
        ("canceled", "canceled"),
        ("incomplete_expired", "canceled"),
        (None, "none"),
        ("something_new", "none"),
    ],
)
def test_map_stripe_status(stripe_status, expected):
    assert _map_stripe_status(stripe_status) == expected


def _org_kwargs(**overrides):
    base = dict(
        id=uuid.uuid4(),
        slug="acme",
        name="Acme",
        created_at=datetime.now(timezone.utc),
        tier="starter",
        subscription_status="none",
    )
    base.update(overrides)
    return base


def test_organization_read_has_active_subscription(saas_on):
    none_org = OrganizationRead(**_org_kwargs(subscription_status="none"))
    assert none_org.has_active_subscription is False

    trial_org = OrganizationRead(**_org_kwargs(subscription_status="trialing"))
    assert trial_org.has_active_subscription is True

    ent_org = OrganizationRead(**_org_kwargs(tier="enterprise", subscription_status="none"))
    assert ent_org.has_active_subscription is True


def test_organization_read_active_when_saas_off(saas_off):
    org = OrganizationRead(**_org_kwargs(subscription_status="none"))
    assert org.has_active_subscription is True
