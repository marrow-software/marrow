---
title: Cloudflare deployment
description: Deploy Marrow to Cloudflare Workers + Containers, with Auth0 for OIDC, Neon for Postgres, and R2 for attachments.
---

The full Cloudflare stack is supported as of **v0.2**. This guide walks through a first-time production deployment.

## Topology

| Component | Service |
| --- | --- |
| Product app (`app.marrow.so`) | Cloudflare Workers (`@opennextjs/cloudflare`) |
| Marketing site (`marrow.so`) | Cloudflare Pages (static export) |
| Docs site (`docs.marrow.so`) | Cloudflare Pages (static Astro) |
| Backend API (`api.marrow.so`) | Cloudflare Containers (image from GHCR) |
| Database | [Neon](https://neon.tech) Postgres (free tier) |
| Attachments | Cloudflare R2 |
| Auth | [Auth0](https://auth0.com) (GitHub + Google social connections) |
| DNS | Cloudflare DNS (`marrow.so`) |

## Prerequisites

- A Cloudflare account with Workers and Containers enabled.
- `wrangler` CLI installed and authenticated (`npm i -g wrangler && wrangler login`).
- A Neon project with a Postgres database.
- An Auth0 account (free tier: 7,500 MAU).
- A Stripe account (for billing).
- GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set in your repo.

## 1. Cloudflare API token

In the Cloudflare dashboard → **Profile → API Tokens → Create Token**, use the *Edit Cloudflare Workers* template and add:
- `Zone:DNS:Edit`
- `Pages:Edit`

Save the token as the `CLOUDFLARE_API_TOKEN` GitHub secret. Your account ID (visible in the right sidebar of the dashboard) goes in `CLOUDFLARE_ACCOUNT_ID`.

## 2. Neon Postgres

Create a project at [neon.tech](https://neon.tech). Copy the **pooled** connection string — it looks like:

```
postgresql://neondb_owner:<password>@<host>.neon.tech/neondb?sslmode=require
```

This becomes the `DATABASE_URL` wrangler secret.

## 3. R2 bucket

```bash
wrangler r2 bucket create marrow-attachments
```

Then create an R2 API token in the Cloudflare dashboard → **R2 → Manage R2 API Tokens** with *Object Read & Write* on the `marrow-attachments` bucket. Note the Access Key ID, Secret Access Key, and endpoint URL (`https://<account-id>.r2.cloudflarestorage.com`).

## 4. Auth0 (GitHub + Google sign-in)

Auth0 acts as a single OIDC issuer and lets users sign in with GitHub or Google.

1. Create an account at [auth0.com](https://auth0.com). Create a **Regular Web Application**.
2. In **Settings**:
   - Allowed Callback URLs: `https://api.marrow.so/api/auth/callback`
   - Allowed Logout URLs: `https://app.marrow.so`
3. **Enable GitHub** — Authentication → Social → GitHub. Create a [GitHub OAuth app](https://github.com/settings/developers):
   - Homepage URL: `https://marrow.so`
   - Callback URL: `https://<your-auth0-domain>/login/callback`
4. **Enable Google** — Authentication → Social → Google (Auth0 dev keys work for testing; swap in your own Google OAuth app for production).
5. Note your **Domain** (`<tenant>.us.auth0.com`), **Client ID**, and **Client Secret**.

## 5. Stripe

Create products and prices for your tiers in the [Stripe dashboard](https://stripe.com). After the API is deployed, register a webhook at `https://api.marrow.so/api/billing/webhook` for events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.

## 6. Configure API wrangler secrets

Run from the `api/` directory:

```bash
wrangler secret put SECRET_KEY            # 64-char random string
wrangler secret put DATABASE_URL          # Neon pooled connection string
wrangler secret put R2_ENDPOINT_URL       # https://<account-id>.r2.cloudflarestorage.com
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put R2_BUCKET             # marrow-attachments
wrangler secret put OIDC_CLIENT_SECRET    # Auth0 client secret
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET # from Stripe webhook step above
```

## 7. Update api/wrangler.toml vars

Edit `api/wrangler.toml` and fill in the non-secret vars:

```toml
[vars]
OIDC_ISSUER       = "https://<your-auth0-domain>/"   # trailing slash required
OIDC_CLIENT_ID    = "<auth0-client-id>"
OIDC_REDIRECT_URI = "https://api.marrow.so/api/auth/callback"
CORS_ORIGINS      = "https://app.marrow.so"
FRONTEND_URL      = "https://app.marrow.so"
COOKIE_DOMAIN     = ".marrow.so"
STORAGE_BACKEND   = "r2"
SAAS_MODE         = "true"
STRIPE_STARTER_PRICE_MONTHLY  = "price_..."
STRIPE_STARTER_PRICE_YEARLY   = "price_..."
STRIPE_BUSINESS_PRICE_MONTHLY = "price_..."
STRIPE_BUSINESS_PRICE_YEARLY  = "price_..."
STRIPE_GROWTH_PRICE_MONTHLY   = "price_..."
STRIPE_GROWTH_PRICE_YEARLY    = "price_..."
```

## 8. Create Cloudflare Pages projects

```bash
# Marketing site
wrangler pages project create marrow-marketing --production-branch main

# Docs site
wrangler pages project create marrow-docs --production-branch main
```

The web Worker project is created automatically on first deploy.

## 9. DNS records

In the Cloudflare dashboard → **marrow.so → DNS**, add:

| Name | Type | Target | Proxy |
|------|------|--------|-------|
| `@` (root) | CNAME | `marrow-marketing.pages.dev` | Proxied |
| `www` | CNAME | `marrow-marketing.pages.dev` | Proxied |
| `app` | CNAME | `marrow-web.<account>.workers.dev` | Proxied |
| `docs` | CNAME | `marrow-docs.pages.dev` | Proxied |

The `api.marrow.so` subdomain is configured automatically when you run `wrangler deploy` from `api/`.

Then add each subdomain as a custom domain in the respective Pages / Workers dashboard.

## 10. Deploy

Merge your branch to `main` and tag the release:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

GitHub Actions (`release.yml`) will:
1. Build and push the API container image to GHCR.
2. Deploy the API via `wrangler deploy` (Cloudflare Containers).
3. Build the web app with OpenNext and deploy it as a Cloudflare Worker.

The marketing workflow (`marketing.yml`) deploys the static site on any push to `main` that touches `web-marketing/`.

## 11. Post-deploy: Marrow org billing exemption

After your first sign-in at `app.marrow.so`, your personal org is auto-created. Set it to the enterprise tier (all features, no billing) via the Neon SQL editor:

```sql
UPDATE organizations SET tier = 'enterprise' WHERE slug = '<your-org-slug>';
```

## See also

- [Environment variables](/configuration/env-vars/)
- [OIDC authentication](/configuration/oidc/)
