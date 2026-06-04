# Marrow v0.2 — Production Deployment Runbook

Personal step-by-step guide for deploying the Marrow SaaS product to Cloudflare for the first time. This is internal-only and not published.

**Stack being deployed:**

- `marrow.so` + `www.marrow.so` → marketing site (Cloudflare Pages, static)
- `app.marrow.so` → product app (Cloudflare Workers, OpenNext)
- `api.marrow.so` → FastAPI backend (Cloudflare Containers)
- `docs.marrow.so` → docs site (Cloudflare Pages, static Astro)
- Database: Neon Postgres (free tier)
- Attachments: Cloudflare R2
- Auth: Auth0 (GitHub primary, Google available)
- Billing: Stripe

**Assumed starting state:** DNS for `marrow.so` is already on Cloudflare. GitHub repo is `spmcgraw/marrow`. No existing production deployment.

**How Cloudflare Containers handles secrets:** Secrets set via `wrangler secret put` land in the Worker wrapper's `env`, NOT automatically inside the Docker container. `container-entrypoint.js` explicitly forwards every secret and var to the FastAPI process via `envVars`. This means secrets must be set before (or immediately after) the first deploy, then re-deploy picks them up.

---

## Phase 1 — Account setup ✅ DONE

All steps below were completed prior to this runbook being updated. Notes kept for reference.

### 1. Cloudflare API token ✅

- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` added as GitHub repository secrets.

### 2. Neon Postgres ✅

- Project `marrow-prod` created. Pooled `DATABASE_URL` saved.

### 3. R2 bucket ✅

- Bucket `marrow-attachments` created. `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` saved.

### 4. Auth0 ✅

- Application `Marrow` created (Regular Web Application).
- Callback URL: `https://api.marrow.so/api/auth/callback`
- Logout URL: `https://app.marrow.so`
- GitHub OAuth connection enabled.
- Google OAuth connection enabled (Auth0 dev keys for now; swap for production Google OAuth app before public launch).
- `OIDC_ISSUER` and `OIDC_CLIENT_ID` committed to `api/wrangler.toml`. `OIDC_CLIENT_SECRET` saved.

### 5. Stripe ✅

- Products created: Starter, Business, Growth (cloud + self-hosted).
- All `STRIPE_*_PRICE_*` IDs committed to `api/wrangler.toml`.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (test) saved.
- Webhook secret (`STRIPE_WEBHOOK_SECRET`) must be re-registered after first production deploy (Step 13).

---

## Phase 2 — Wire up Cloudflare config

### 6. Install wrangler and log in ✅

```bash
npm i -g wrangler
wrangler login
```

### 7. Set API wrangler secrets

**Important:** For Cloudflare Containers, `wrangler secret put` may require the Worker to already exist. Try the commands below — if any fail with "Worker not found", skip to Step 9 (create Pages projects), then Step 12 (first deploy), then come back and run these.

Run from `api/`:

```bash
cd /home/spmcgraw/dev/marrow/api

wrangler secret put SECRET_KEY
# Run: openssl rand -hex 32 — paste the output

wrangler secret put DATABASE_URL
# Paste Neon pooled connection string (Step 2)

wrangler secret put R2_ENDPOINT_URL
# https://<account-id>.r2.cloudflarestorage.com (Step 3)

wrangler secret put R2_ACCESS_KEY_ID
# From Step 3

wrangler secret put R2_SECRET_ACCESS_KEY
# From Step 3

wrangler secret put R2_BUCKET
# marrow-attachments

wrangler secret put OIDC_CLIENT_SECRET
# Auth0 Client Secret (Step 4)

wrangler secret put STRIPE_SECRET_KEY
# sk_test_... from .env (swap for sk_live_... when going live)

wrangler secret put LICENSE_SIGNING_KEY
# Run: openssl rand -hex 32 — paste the output
```

`STRIPE_WEBHOOK_SECRET` — skip; set after first deploy (Step 13).

### 8. wrangler.toml non-secret vars ✅ DONE

All non-secret vars (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_REDIRECT_URI`, `SAAS_MODE`, all `STRIPE_*_PRICE_*` IDs, `CORS_ORIGINS`, `FRONTEND_URL`, `COOKIE_DOMAIN`, `STORAGE_BACKEND`) are committed in `api/wrangler.toml`. Nothing to do here.

### 9. Create Cloudflare Pages projects

One-time registration so Cloudflare knows these project names. The actual content is pushed by CI on first deploy.

```bash
# Marketing site
wrangler pages project create marrow-marketing --production-branch main

# Docs site
wrangler pages project create marrow-docs --production-branch main
```

The web Worker (`marrow-web`) is created automatically when CI runs `wrangler deploy` the first time.

### 10. Add DNS records

In Cloudflare dashboard → **marrow.so** zone → **DNS → Records → Add record**:

| Type | Name | Target | Proxy status |
| ------ | ------ | -------- | -------------- |
| CNAME | `@` | `marrow-marketing.pages.dev` | Proxied (orange cloud) |
| CNAME | `www` | `marrow-marketing.pages.dev` | Proxied |
| CNAME | `docs` | `marrow-docs.pages.dev` | Proxied |

Leave `app` and `api` for now — their targets aren't known until after first deploy.

---

## Phase 3 — First deploy

### 11. Merge the v0.2 PR and tag

Everything needed is already committed on `v0.2`. Open the PR (already open at github.com/spmcgraw/marrow/pull/202) → let CI pass → merge to `main`.

Then tag the release:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Watch the **Actions** tab in GitHub. These workflows fire:

- **Release** (`release.yml`) — builds Docker image → pushes to GHCR → deploys API Container → builds OpenNext → deploys web Worker
- **CI** (triggered by push to main) — runs tests + deploys docs to Cloudflare Pages
- **Marketing site** (`marketing.yml`) — builds static export → deploys to Cloudflare Pages

### 12. If Step 7 secrets failed earlier — set them now

After the first deploy the Worker exists. Re-run any `wrangler secret put` commands that failed in Step 7, then re-deploy:

```bash
cd /home/spmcgraw/dev/marrow/api
# Run any wrangler secret put commands that failed earlier
wrangler deploy
```

### 13. Add DNS records for app and api

Once the first deploy succeeds:

- **api subdomain:** Cloudflare dashboard → Workers & Pages → `marrow-api` → Settings → Domains & Routes — note the `.workers.dev` URL. Add a DNS CNAME for `api` pointing there (or it may auto-configure via the Container wrangler.toml).
- **app subdomain:** Workers & Pages → `marrow-web` → Settings → Domains & Routes — shows `marrow-web.<account>.workers.dev`. Add DNS CNAME for `app` pointing there.

### 14. Add custom domains in Cloudflare dashboards

For each project in Workers & Pages:

- **marrow-marketing**: Custom Domains → Add `marrow.so` and `www.marrow.so`
- **marrow-docs**: Custom Domains → Add `docs.marrow.so`
- **marrow-web (Worker)**: Settings → Domains & Routes → Add Route → `app.marrow.so/*`
- **marrow-api (Container)**: Add custom domain `api.marrow.so`

### 15. Register the Stripe webhook

Once `https://api.marrow.so` is live:

1. Stripe dashboard → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://api.marrow.so/api/billing/webhook`
3. Events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Click **Add endpoint** → reveal and copy the **Signing secret** (`whsec_...`).
5. Add it as a secret and re-deploy:

   ```bash
   cd /home/spmcgraw/dev/marrow/api
   wrangler secret put STRIPE_WEBHOOK_SECRET
   wrangler deploy
   ```

---

## Phase 4 — Smoke test and go live

### 16. Verify each URL

- [ ] `https://marrow.so` — marketing homepage loads
- [ ] `https://www.marrow.so` — same
- [ ] `https://app.marrow.so` — redirects to Auth0 login page
- [ ] `https://api.marrow.so/health` — returns `{"status":"ok"}`
- [ ] `https://docs.marrow.so` — Starlight docs site loads

### 17. Sign in and set up the owner org

1. Go to `https://app.marrow.so` → sign in with GitHub.
2. Your personal org is auto-created. Note your org slug (visible in the URL or org settings).
3. In the Neon dashboard → **SQL Editor**, run:

   ```sql
   UPDATE organizations SET tier = 'enterprise' WHERE slug = '<your-org-slug>';
   ```

   This gives the Marrow org all features with no billing requirement.

### 18. End-to-end test

1. Create a workspace → space → folder → page.
2. Type some content, wait 2 seconds — confirm "Saved" indicator appears.
3. Add a comment on the page.
4. Share the page via the share button → copy the link → open in an incognito window (loads without login).
5. Export/restore round-trip:

   ```bash
   cd api
   source .venv/bin/activate
   API_KEY=<your-api-key> marrow export --workspace <slug> --output /tmp/test-bundle.zip
   ```

---

## Ongoing ops notes

- **Logs:** Cloudflare dashboard → Workers & Pages → select app → Logs, or `wrangler tail`.
- **DB migrations:** `alembic upgrade head` runs automatically in the Container start command on each deploy (see `docker-compose.prod.yml`).
- **Updating:** push to `main` or push a new tag — CI handles the rest.
- **Rollback:** revert the merge commit and re-tag, or push a prior tag.
- **R2 storage cost:** free up to 10 GB storage + 1M Class A ops/month.
- **Auth0 MAU limit:** 7,500/month on free tier. Watch Auth0 → Monitoring → Active Users. Upgrade to Developer Pro ($23/mo) when approaching the limit.
- **Swap Stripe to live mode:** replace `sk_test_...` with `sk_live_...` via `wrangler secret put STRIPE_SECRET_KEY`, re-register the webhook pointing at the live endpoint, set `STRIPE_WEBHOOK_SECRET` to the live signing secret, redeploy.
