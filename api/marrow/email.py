"""Transactional email via the Resend REST API.

Best-effort delivery: ``send_email`` never raises. Callers (e.g. the Stripe
webhook) must not block their success response on email delivery, so failures
are logged and swallowed. When ``RESEND_API_KEY`` is unset (dev / self-hosted),
sends are skipped silently.

Cloudflare Email Routing is inbound-only and the webhook runs in FastAPI on
Fly.io (not a Worker), so the Workers email binding isn't reachable — hence the
plain REST call here.
"""

import logging
import os

import httpx

logger = logging.getLogger(__name__)

_RESEND_ENDPOINT = "https://api.resend.com/emails"
_DEFAULT_FROM = "Marrow <hello@marrow.so>"


def send_email(to: str, subject: str, html: str) -> bool:
    """Send a transactional email. Returns True on success, False otherwise.

    Never raises — intended for best-effort sends from request handlers.
    """
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    if not api_key:
        logger.info("RESEND_API_KEY unset; skipping email to %s (%r)", to, subject)
        return False

    sender = os.getenv("EMAIL_FROM", _DEFAULT_FROM)
    try:
        resp = httpx.post(
            _RESEND_ENDPOINT,
            headers={"Authorization": f"Bearer {api_key}"},
            json={"from": sender, "to": [to], "subject": subject, "html": html},
            timeout=10.0,
        )
        resp.raise_for_status()
        return True
    except Exception:  # noqa: BLE001 — best-effort; log and continue
        logger.exception("Failed to send email to %s (%r)", to, subject)
        return False


def subscription_confirmation_html(org_name: str, tier: str) -> str:
    """Render the subscription confirmation email body."""
    tier_label = tier.title()
    return f"""\
<div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
  <h1 style="font-size: 20px;">You're all set 🎉</h1>
  <p>Your subscription for <strong>{org_name}</strong> is active on the
  <strong>{tier_label}</strong> plan, including a 14-day free trial.</p>
  <p>You can manage your plan any time from your organization settings.</p>
  <p style="color: #888; font-size: 13px;">— The Marrow team</p>
</div>"""
