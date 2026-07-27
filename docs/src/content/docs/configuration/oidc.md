---
title: OIDC authentication
description: Wire Marrow up to an OIDC provider for sign-in.
---

Marrow's backend acts as an OIDC Relying Party. Any compliant provider works. This page covers **Auth0** (recommended for multi-provider sign-in), **Google**, and **Keycloak**.

## How it works

1. User hits `GET /api/auth/login`. Backend redirects to the IdP.
2. IdP redirects back to `GET /api/auth/callback?code=…`.
3. Backend exchanges the code for tokens, upserts the user in the `users` table, claims any pending org memberships matching the email, auto-creates a personal org if the user has none, and sets the `marrow_session` cookie (httpOnly JWT, 24h).
4. Subsequent requests carry the cookie; routes use it for RBAC.

## Backend config

Add these to `api/.env` (or your prod env):

```env
OIDC_ISSUER=https://accounts.google.com
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_REDIRECT_URI=https://api.example.com/api/auth/callback
FRONTEND_URL=https://app.example.com
COOKIE_DOMAIN=.example.com
SECRET_KEY=<long random string>
CORS_ORIGINS=https://app.example.com
```

And on the frontend (web container env, or `web/.env.local` for dev):

```env
MARROW_API_URL=https://api.example.com
MARROW_OIDC_ENABLED=true
```

`MARROW_OIDC_ENABLED` enables the `/login` page. Route protection is handled without middleware — server layouts `redirect("/login")` on a 401 and the client API helper redirects to the OIDC login endpoint on any 401 (there is deliberately no Next.js middleware). Without `MARROW_OIDC_ENABLED` the frontend assumes anonymous mode.

## Cookie domain

The session cookie is set on `COOKIE_DOMAIN`. For the cookie to be sent from the web app to the API:

- **Same domain** (e.g. both on `localhost`): `COOKIE_DOMAIN=localhost`.
- **Split subdomains** (e.g. `app.example.com` + `api.example.com`): `COOKIE_DOMAIN=.example.com` (note the leading dot).

If the cookie isn't being sent on API calls, this is almost always the misconfiguration.

## Provider setup

### Auth0 (recommended — supports GitHub + Google simultaneously)

Marrow's backend connects to a single `OIDC_ISSUER`. Auth0 sits in front of multiple social providers and presents one OIDC endpoint to Marrow, so users can sign in with either GitHub or Google.

**Auth0 free tier: 7,500 monthly active users.**

1. Create an account at [auth0.com](https://auth0.com). Create a **Regular Web Application** (not SPA or Machine-to-Machine).
2. In **Applications → Settings**:
   - Allowed Callback URLs: `https://api.example.com/api/auth/callback`
   - Allowed Logout URLs: `https://app.example.com`
3. Note your **Domain** (e.g. `myapp.us.auth0.com`), **Client ID**, and **Client Secret**.
4. **Enable GitHub** — Authentication → Social → GitHub:
   - Create a [GitHub OAuth app](https://github.com/settings/developers). Homepage URL: your app URL. Callback URL: `https://<auth0-domain>/login/callback`.
   - Paste the GitHub client ID and secret into Auth0.
5. **Enable Google** — Authentication → Social → Google. Auth0's dev keys are fine for testing; replace with your own Google OAuth credentials for production.
6. Set these env vars / secrets:
   ```env
   OIDC_ISSUER=https://<auth0-domain>/   # trailing slash required
   OIDC_CLIENT_ID=<auth0-client-id>
   OIDC_CLIENT_SECRET=<auth0-client-secret>
   ```

### Google

1. [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Credentials**.
2. Create an OAuth 2.0 Client ID for **Web application**.
3. Add Authorized redirect URIs: `https://api.example.com/api/auth/callback` (and `http://localhost:8000/api/auth/callback` for dev).
4. Copy the Client ID and Client Secret into `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`.
5. Set `OIDC_ISSUER=https://accounts.google.com`.

### Keycloak

1. In your realm, **Clients** → **Create client**.
2. Client type: **OpenID Connect**. Client ID: `marrow`.
3. Enable **Client authentication**. Set **Valid redirect URIs** to your callback URL.
4. **Credentials** tab → copy the secret to `OIDC_CLIENT_SECRET`.
5. `OIDC_ISSUER=https://keycloak.example.com/realms/<realm>`.

### Other providers

Any OIDC-compliant provider works. The `OIDC_ISSUER` URL must serve a valid `/.well-known/openid-configuration`.

## Inviting members

Once OIDC is on, invite teammates by email from the org settings page (`/orgs/<id>/settings`). The invite creates a pending membership; when the user logs in via OIDC with that email, the membership is automatically claimed. See `routers/auth.py` for the claim flow.
