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

---

## Phase 1 — Account setup (do this before touching any code)

### 1. Cloudflare API token

You need a token that CI can use to deploy. This is a one-time setup.

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → click your avatar (top right) → **My Profile** → **API Tokens**.
2. Click **Create Token**.
3. Click **Use template** next to *Edit Cloudflare Workers*.
4. Scroll down to **Zone Resources** — change "All zones" to "Include → Specific zone → marrow.so".
5. Click **Continue to summary** → **Create Token**.
6. **Copy the token now** — you won't see it again.
7. In GitHub: go to `github.com/spmcgraw/marrow` → **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `CLOUDFLARE_API_TOKEN` — paste the token value.
8. Back in Cloudflare: on the right sidebar of any page you'll see **Account ID** (a 32-char hex string). Copy it.
9. GitHub → add another secret: `CLOUDFLARE_ACCOUNT_ID` — paste your account ID.

### 2. Neon Postgres (free tier)

1. Go to [neon.tech](https://neon.tech) → **Sign up** (GitHub login works).
2. Click **New Project** → name it `marrow-prod` → region: choose closest to your users (US East is fine for now).
3. Neon will create a default database. Click **Connect**.
4. Under **Connection string**, make sure **Pooled connection** is selected (not direct).
5. Copy the full string — it looks like:
   ```
   postgresql://neondb_owner:<password>@ep-<something>.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
6. Keep this safe — this is your `DATABASE_URL`.

### 3. R2 bucket

1. In Cloudflare dashboard → **R2 Object Storage** (left sidebar).
2. Click **Create bucket** → name: `marrow-attachments` → **Create bucket**.
3. Click **Manage R2 API Tokens** (top right of R2 page).
4. Click **Create API Token**.
   - Token name: `marrow-api`
   - Permissions: **Object Read & Write**
   - Bucket: Specific bucket → `marrow-attachments`
   - TTL: No expiry
5. Click **Create API Token**. On the confirmation screen, note:
   - **Access Key ID** (looks like `abc123...`)
   - **Secret Access Key** (shows once — copy it)
   - **Endpoint URL** (looks like `https://abc123.r2.cloudflarestorage.com`)

### 4. Auth0 — GitHub + Google sign-in

1. Go to [auth0.com](https://auth0.com) → **Sign up** (free tier is fine).
2. During onboarding, choose **I'm building a web app** → pick any tech stack (doesn't matter).
3. Once in the dashboard, go to **Applications → Applications** → **Create Application**.
   - Name: `Marrow`
   - Type: **Regular Web Applications**
   - Click **Create**.
4. You're now on the app's Settings tab. Fill in:
   - **Allowed Callback URLs:** `https://api.marrow.so/api/auth/callback`
   - **Allowed Logout URLs:** `https://app.marrow.so`
   - Scroll down and click **Save Changes**.
5. At the top of Settings, note:
   - **Domain** (e.g. `dev-abc123.us.auth0.com`) — this is your `OIDC_ISSUER` value (add a trailing `/`)
   - **Client ID** — this is `OIDC_CLIENT_ID`
   - **Client Secret** (click Reveal) — this is `OIDC_CLIENT_SECRET`

6. **Enable GitHub login:**
   - Auth0 sidebar → **Authentication → Social**.
   - Find **GitHub** → click it → toggle **Enable**.
   - You need a GitHub OAuth app. Go to [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps → New OAuth App**:
     - Application name: `Marrow (Auth0)`
     - Homepage URL: `https://marrow.so`
     - Authorization callback URL: `https://<your-auth0-domain>/login/callback` (use the domain from step 5)
     - Click **Register application** → note the **Client ID** and generate a **Client Secret**.
   - Back in Auth0, paste the GitHub Client ID and Secret → **Save**.
   - Click **Applications** tab (inside the GitHub social connection) → enable **Marrow**.

7. **Enable Google login:**
   - Auth0 sidebar → **Authentication → Social** → **Google / Gmail → Enable**.
   - Auth0's own dev keys work for testing. For production, create a Google OAuth app at [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create → OAuth 2.0 Client. Redirect URI: `https://<auth0-domain>/login/callback`.
   - Click **Applications** tab → enable **Marrow**.

### 5. Stripe

1. Go to [stripe.com](https://stripe.com) → sign up.
2. Start in **Test mode** (toggle in top right — keep it on until you're ready for real payments).
3. Create your products. Go to **Products → Add product**:
   - **Starter** — flat rate, $X/mo and $Y/yr (two prices per product). Repeat for **Business** and **Growth**.
4. For each price you create, copy the **Price ID** (starts with `price_`). You'll need:
   - `STRIPE_STARTER_PRICE_MONTHLY`
   - `STRIPE_STARTER_PRICE_YEARLY`
   - `STRIPE_BUSINESS_PRICE_MONTHLY`
   - `STRIPE_BUSINESS_PRICE_YEARLY`
   - `STRIPE_GROWTH_PRICE_MONTHLY`
   - `STRIPE_GROWTH_PRICE_YEARLY`
5. Go to **Developers → API keys** → copy the **Secret key** (`sk_test_...`). This is `STRIPE_SECRET_KEY`.
6. Webhook secret comes after Phase 2 deploy (Step 12 below).

---

## Phase 2 — Wire up the Cloudflare config

### 6. Install wrangler and log in

On your local machine:

```bash
npm i -g wrangler
wrangler login
# This opens a browser — authorize with your Cloudflare account.
```

### 7. Configure API wrangler secrets

From the `api/` directory, run each of these. `wrangler` will prompt you to paste the value:

```bash
cd /home/spmcgraw/dev/marrow/api

wrangler secret put SECRET_KEY
# Paste a long random string — run: openssl rand -hex 32

wrangler secret put DATABASE_URL
# Paste your Neon pooled connection string from Step 2

wrangler secret put R2_ENDPOINT_URL
# Paste: https://<account-id>.r2.cloudflarestorage.com (from Step 3)

wrangler secret put R2_ACCESS_KEY_ID
# Paste from Step 3

wrangler secret put R2_SECRET_ACCESS_KEY
# Paste from Step 3

wrangler secret put R2_BUCKET
# Type: marrow-attachments

wrangler secret put OIDC_CLIENT_SECRET
# Paste the Auth0 Client Secret from Step 4

wrangler secret put STRIPE_SECRET_KEY
# Paste from Step 5
```

**STRIPE_WEBHOOK_SECRET** — skip for now; you'll add it after the first deploy (Step 12).

### 8. Fill in api/wrangler.toml non-secret vars

Open `api/wrangler.toml` and replace the placeholder values in the `[vars]` section:

```toml
OIDC_ISSUER       = "https://<your-auth0-domain>/"  # from Step 4, trailing slash!
OIDC_CLIENT_ID    = "<auth0-client-id>"              # from Step 4
# All other vars (CORS_ORIGINS, COOKIE_DOMAIN, etc.) are already set correctly.
# Fill in the Stripe price IDs from Step 5:
STRIPE_STARTER_PRICE_MONTHLY  = "price_..."
STRIPE_STARTER_PRICE_YEARLY   = "price_..."
# ... etc
```

### 9. Create the Cloudflare Pages projects

These are one-time registrations that tell Cloudflare the project names exist. The actual content gets pushed by CI.

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
|------|------|--------|--------------|
| CNAME | `@` | `marrow-marketing.pages.dev` | Proxied (orange cloud) |
| CNAME | `www` | `marrow-marketing.pages.dev` | Proxied |
| CNAME | `app` | *(leave blank for now — fill in after first web Worker deploy)* | Proxied |
| CNAME | `docs` | `marrow-docs.pages.dev` | Proxied |

The `api` subdomain gets a CNAME added automatically when you deploy the Container via `wrangler deploy`. Verify it appeared after the first deploy.

After CI deploys `marrow-web`, find your Workers subdomain in the Cloudflare dashboard → **Workers & Pages → marrow-web → Settings → Domains & Routes** — it'll show something like `marrow-web.<account>.workers.dev`. Add that as the CNAME target for `app.marrow.so`.

### 11. Add custom domains in Cloudflare dashboards

After the first successful CI deploy, for each project:
- **marrow-marketing**: Cloudflare → Workers & Pages → marrow-marketing → Custom Domains → Add `marrow.so` and `www.marrow.so`
- **marrow-docs**: Custom Domains → Add `docs.marrow.so`
- **marrow-web (Worker)**: Settings → Domains & Routes → Add Route → `app.marrow.so/*`
- **marrow-api (Container)**: Already configured by `wrangler deploy` via `api/wrangler.toml`

---

## Phase 3 — Deploy

### 12. Commit, merge, and tag

Make sure `api/wrangler.toml` changes (the `[vars]` section you filled in) are committed:

```bash
git add api/wrangler.toml
git commit -m "chore: configure prod wrangler vars for v0.2 launch"
```

Then open a PR from `v0.2` → `main`, let CI pass, and merge. Tag the release:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Watch the **Actions** tab in GitHub. Two workflows run:
- **Release** — builds API image → pushes to GHCR → deploys API Container → builds web Worker → deploys Worker
- **CI** (triggered by push to main) — runs tests + deploys docs

Marketing deploys via **Marketing site** workflow (also triggered by the merge).

### 13. Register the Stripe webhook

Once the API is live:
1. Stripe dashboard → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://api.marrow.so/api/billing/webhook`
3. Events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Click **Add endpoint** → reveal and copy the **Signing secret** (`whsec_...`).
5. Add it as a wrangler secret:
   ```bash
   cd api
   wrangler secret put STRIPE_WEBHOOK_SECRET
   ```
6. Re-deploy the API so it picks up the new secret:
   ```bash
   wrangler deploy
   ```

---

## Phase 4 — Smoke test and go live

### 14. Verify each URL

- [ ] `https://marrow.so` — marketing homepage loads
- [ ] `https://www.marrow.so` — redirects or loads (same as above)
- [ ] `https://app.marrow.so` — redirects to the Auth0 login page
- [ ] `https://api.marrow.so/health` — returns `{"status":"ok"}`
- [ ] `https://docs.marrow.so` — Starlight docs site loads

### 15. Sign in and set up the owner org

1. Go to `https://app.marrow.so` → sign in with GitHub.
2. Your personal org is auto-created. Note your org slug (visible in the URL: `/orgs/<slug>/...` or in org settings).
3. In the Neon dashboard → **SQL Editor**, run:
   ```sql
   UPDATE organizations SET tier = 'enterprise' WHERE slug = '<your-org-slug>';
   ```
   This gives the Marrow org all features with no billing requirement.

### 16. End-to-end test

1. Create a workspace → create a space → create a folder → create a page.
2. Type some content, wait 2 seconds — check the "Saved" indicator appears.
3. Add a comment on the page.
4. Share the page via the share button → copy the link → open it in an incognito window (should load without login).
5. Run the export/restore round-trip from your machine:
   ```bash
   cd api
   source .venv/bin/activate
   API_KEY=<your-api-key> marrow export --workspace <slug> --output /tmp/test-bundle.zip
   # inspect /tmp/test-bundle.zip
   ```

---

## Ongoing ops notes

- **Logs:** Cloudflare dashboard → Workers & Pages → select app → Logs (real-time) or use `wrangler tail`.
- **DB migrations:** future schema migrations run automatically via the `alembic upgrade head` command in the API Container's start command (see `docker-compose.prod.yml` → `api.command`). The Container wrangler.toml runs the same on deploy.
- **Updating:** push to `main` (or push a new tag) — CI handles the rest.
- **Rollback:** push a prior tag or revert the merge commit and re-tag.
- **R2 storage cost:** free up to 10 GB storage + 1M Class A ops/month. Monitor usage in Cloudflare → R2 dashboard.
- **Auth0 MAU limit:** 7,500/month on free tier. Watch the Auth0 dashboard → Monitoring → Active Users. Upgrade to Developer Pro ($23/mo) when you approach the limit.
