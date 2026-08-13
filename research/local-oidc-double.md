# Research: A local OIDC IdP double for offline dev (#323)

Child of wayfinder map #322. Question: survey the options for a **local OIDC IdP
double** a Marrow dev can run via `docker-compose` to replicate the production
Auth0/OIDC login flow **fully offline**, and recommend the best fit.

> **File location note:** the repo has no existing convention for research notes
> (`docs/agents/` holds agent *skill config* — issue-tracker/triage/domain — not
> investigations, and there is no `research/` dir yet). Per the ticket's fallback
> I created `research/` and put this file at `research/local-oidc-double.md`.

---

## 1. What Marrow's RP actually requires (ground truth from the code)

Read `api/marrow/auth.py` and `api/marrow/routers/auth.py`. Marrow is the OIDC
**Relying Party**; the double must satisfy exactly this contract and no more:

| Requirement | Where in code | Note |
|---|---|---|
| **OIDC discovery document** at `{issuer}/.well-known/openid-configuration` | `auth.py:74` — authlib `server_metadata_url=f"{config.issuer}/.well-known/openid-configuration"` | authlib fetches this server-side to learn authorize/token/jwks/userinfo endpoints. The double MUST serve it. |
| **Authorization-code grant** | `routers/auth.py:51` `authorize_redirect`, `:62` `authorize_access_token` | Standard `code` flow; authlib also sends a `nonce` and validates it. |
| **Scopes** `openid email profile` | `auth.py:75` `client_kwargs={"scope": "openid email profile"}` | The double must honour these scopes and return the matching claims. |
| **`sub` claim (required)** | `routers/auth.py:69,73-74` — 400 "did not return a subject" if missing | Stored as `users.oidc_subject`; only needs to be **stable + unique per user**. Opaque is fine. |
| **`email` claim** | `routers/auth.py:70` `email = userinfo.get("email", "")` | Used for user record + pending-membership claiming (`:100-106`). Empty string tolerated but breaks invite-claim. |
| **`name` claim** (fallbacks `preferred_username`, then `email`) | `routers/auth.py:71` | Display name only. |
| **id_token OR userinfo endpoint** | `routers/auth.py:65-67` — reads `token["userinfo"]`, else calls `oauth.oidc.userinfo()` | authlib populates `userinfo` from the **id_token** when claims are present; otherwise the double must serve a working `/userinfo`. Either path works. |
| **id_token as a string** | `routers/auth.py:140` stored in session for logout | Must be a normal signed JWT. |
| **`end_session_endpoint`** (RP-initiated logout) | `routers/auth.py:259-267` | **Optional.** Logout re-fetches discovery; if `end_session_endpoint` is absent it silently falls back to local cookie-clear (`:274-275`). Missing it costs nothing in dev. |
| Issuer trailing slash stripped | `auth.py:44-46` | Set `OIDC_ISSUER` without a trailing slash. |
| Cookie `secure` flag derived from redirect URI scheme | `auth.py:128` `secure = config.redirect_uri.startswith("https://")` | On `http://localhost` the session cookie is non-Secure → works over plain HTTP. |

**Swap surface** — to point Marrow at a double, a dev only changes four env vars
(`api/.env`, per CLAUDE.md → Environment Variables): `OIDC_ISSUER`,
`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`
(`http://localhost:8000/api/auth/callback`), plus `FRONTEND_URL` /
`COOKIE_DOMAIN=localhost`. **No RP code change is needed for any conformant OIDC
provider** — authlib is fully discovery-driven. So "fidelity" reduces to: does the
double serve a real discovery doc, run the code grant, and return `sub`/`email`/`name`?

Sources: `api/marrow/auth.py:44-77,87-139`; `api/marrow/routers/auth.py:43-74,139-148,219-277`.

---

## 2. The candidates

### A. Dex (`dexidp/dex`)

Dex is a CoreOS/CNCF OpenID Connect provider — "generally used as a building
block to drive authentication for other apps" — configured **exclusively from a
config file** ([dexidp.io/docs/getting-started](https://dexidp.io/docs/getting-started/)).

- **Discovery + code grant:** yes. Clients "query dex's discovery endpoint" and
  users "are redirected from a client app to dex to login" — standard code flow,
  `responseTypes: ["code"]` is the default
  ([config.yaml.dist](https://raw.githubusercontent.com/dexidp/dex/master/config.yaml.dist)).
- **Static local users, no external store:** the built-in **local connector**
  (`enablePasswordDB: true` + `staticPasswords`) "manages user credentials
  directly … eliminating the need for an external user store"
  ([dexidp.io/docs/connectors/local](https://dexidp.io/docs/connectors/local/)).
  Each entry carries `email`, `hash` (bcrypt), `username`, `name`,
  `preferred_username`, `emailVerified`, `userID` — i.e. **exactly the
  sub/email/name claims Marrow reads**. Claims map cleanly: `email` scope →
  `email`/`email_verified`, `profile` scope → `name`/`preferred_username`
  ([custom-scopes-claims-clients](https://dexidp.io/docs/configuration/custom-scopes-claims-clients/)).
  `sub` is opaque (derived from `userID` + connector id) but stable — fine for
  `users.oidc_subject`.
- **Static clients:** `staticClients: [{id, secret, redirectURIs: [...]}]` — set
  the redirect URI to `http://localhost:8000/api/auth/callback`
  ([config.yaml.dist](https://raw.githubusercontent.com/dexidp/dex/master/config.yaml.dist)).
- **docker-compose fit:** tiny Go static binary; official image `dexidp/dex:latest`,
  in-memory storage (`storage: {type: memory}`), config mounted as a single
  volume, sub-second startup, fully offline. Docker's **own** first-party guide
  "Mocking OAuth services in testing with Dex" ships this exact pattern:
  ```yaml
  services:
    dex:
      image: dexidp/dex:latest
      ports: ["5556:5556"]
      volumes: [./config.yaml:/etc/dex/config.yaml]
  ```
  with `enablePasswordDB: true` + `staticPasswords` for predefined test users
  ([docs.docker.com/guides/dex](https://docs.docker.com/guides/dex/)).
- **Config-as-code / reproducible seeding:** the whole IdP — users and clients —
  is one committed `config.yaml`. Reproducible across machines by construction.

### B. Keycloak (`quay.io/keycloak/keycloak`)

Full-featured Red Hat IdP (Java/Quarkus).

- **Fidelity:** the highest of the three — real login page, consent, sessions,
  full discovery, code grant, `end_session_endpoint`, standard `sub`/`email`/`name`
  claims. Closest to "a real Auth0."
- **Seeding:** realm-as-code via realm import. Modern approach: mount a
  `realm-export.json` into `/opt/keycloak/data/import` and start with
  `start-dev --import-realm` (the old `KEYCLOAK_IMPORT` env var is deprecated)
  ([keycloak.org/server/containers](https://www.keycloak.org/server/containers),
  [keycloak/keycloak#10216](https://github.com/keycloak/keycloak/issues/10216)).
  Exported realm JSON does include users, so dev logins are reproducible — but the
  file is large, verbose, and password hashes/secrets are awkward to hand-author
  vs. Dex's four-line user block.
- **docker-compose fit:** heaviest option — a JVM/Quarkus image (hundreds of MB)
  with multi-second (often 20-40s) cold start even in `start-dev`. Runs offline
  once pulled. Overkill for a solo dev's "log in as me" loop.

### C. Lightweight mock — `oauth2-mock-server` (axa-group) and similar

`oauth2-mock-server` is "a development and test oriented OAuth2 mock server," is
OIDC-conformant, and exposes discovery, JWKS, the code flow (incl. PKCE),
`/userinfo`, and even `end_session`
([github.com/axa-group/oauth2-mock-server](https://github.com/axa-group/oauth2-mock-server/blob/master/README.md),
[npm](https://www.npmjs.com/package/oauth2-mock-server)).

- **Fidelity of the *protocol*:** good — discovery + signed tokens with correct
  `iss`/`aud`, so authlib's validation passes and Marrow's RP works unchanged.
- **Fidelity of the *flow*:** **low.** By design "the server performs **no
  validation of incoming requests** — any client ID, secret, username, or password
  is accepted," and it **auto-issues a token for any login** rather than showing a
  login screen. There is effectively **no interactive login and no user picker**.
- **Declarative multi-user seeding:** weak. Claims are customised via **event
  hooks in a JS/TS test suite** (`Events.BeforeTokenSigning`,
  `server.issuer.buildToken()`) — "per-test customization … rather than static
  configuration." The standalone `npx oauth2-mock-server` CLI just serves defaults
  (a single default subject); seeding several named dev users declaratively is not
  its model. The README does not document a Docker image.
- **Verdict:** excellent as an **automated-test** OIDC stub embedded in a Node test
  process. As a *dev-loop* IdP double in docker-compose — where you want to click
  "log in", pick a known user, and get a stable `sub`/`email`/`name` — it is a poor
  fit. (Other mocks in this class — MockServer's OIDC mock, mockd, oidc-provider-mock
  — share the same "stub, not IdP" character.)

---

## 3. Scorecard against the ticket's five axes

| Axis | Dex | Keycloak | oauth2-mock-server |
|---|---|---|---|
| **1. Fidelity to Auth0 flow** (discovery, code grant, sub/email/name) — RP code unchanged? | High. Real discovery, code flow, interactive login, correct claims. **RP unchanged** (env-only swap). | Highest. Real login/consent/sessions, full claims. **RP unchanged.** | Protocol conformant, RP unchanged — but **no real login flow**; auto-issues tokens. |
| **2. docker-compose fit** (size, startup, offline, config-as-code) | Best. ~single Go binary, sub-second start, in-memory storage, one config file, fully offline. Docker's own guide uses it. | Worst. JVM image, slow cold start, heavier. Offline once pulled. | Small, but no documented Docker image; built to run inside a Node test process. |
| **3. Declarative user seeding** | Best. `staticPasswords` block in committed `config.yaml`; users + clients as code. | Good but heavy. `realm-export.json` (`--import-realm`); verbose, awkward to hand-edit. | Weak. Hooks in test code; CLI serves a single default sub. |
| **4. Social-connection realism** (prod pain = Auth0 Google connection) | Can *shape* it (a `mockCallback`/OAuth connector or just name a user "Google"), but a plain `staticPasswords` username/password realm is the pragmatic dev target. | Can configure an actual "Google" identity-provider entry — but wiring it offline needs a second mock upstream; diminishing returns. | No meaningful social simulation. |
| **5. `COOKIE_DOMAIN=localhost` / localhost redirect URIs** | Clean on `http://localhost` (see §4). | Same localhost caveats; also cookie-heavy own session. | Clean, but moot given the flow gap. |

---

## 4. The real docker-compose gotcha: issuer host must match on **both** sides

This applies to **Dex and Keycloak equally** and is the single thing most likely
to bite. authlib validates the id_token's `iss` against the discovery `issuer`,
and the OIDC issuer string is baked into the discovery document
(e.g. Dex `issuer: http://127.0.0.1:5556/dex`, echoed as the token `iss`
— [config.yaml.dist](https://raw.githubusercontent.com/dexidp/dex/master/config.yaml.dist),
[dexidp.io/docs/guides/kubernetes](https://dexidp.io/docs/guides/kubernetes/)).

The problem: in docker-compose the **backend** reaches the IdP by service name
(`http://dex:5556`) for server-side discovery, but the **browser** must reach the
*same issuer URL* at `http://localhost:5556` for the authorize redirect. If the two
disagree, either the browser redirect 404s or `iss` validation fails. Fixes:

- Pick **one** issuer host and use it everywhere. The clean trick: name the compose
  service `dex` **and** publish the port, then set `OIDC_ISSUER=http://dex:5556/dex`
  and add `dex` to the developer's `/etc/hosts` (or use compose `extra_hosts` /
  browse via the service name) so `dex` resolves to `localhost` in the browser too.
  Marrow already relies on this class of trick — CLAUDE.md sets
  `COOKIE_DOMAIN=localhost` "so the cookie is shared between `:3000` and `:8000`."
- Or run the IdP on the host network / a fixed `localhost:PORT` that both the
  browser and the backend container can reach identically (backend →
  `host.docker.internal`, browser → `localhost`, **but** the issuer string must
  still be byte-identical, so this needs `extra_hosts: host.docker.internal:host-gateway`
  aliased consistently).

**Cookie/localhost specifics for Marrow:** `OIDC_REDIRECT_URI` stays
`http://localhost:8000/api/auth/callback` — because it's `http`, `auth.py:128`
leaves the session cookie **non-Secure**, and `SameSite=Lax` (`auth.py:132`)
permits the top-level redirect back from the IdP. `COOKIE_DOMAIN=localhost` keeps
`:3000`/`:8000` sharing the cookie. None of this needs changing for a local double;
just register the double's redirect URI as `http://localhost:8000/api/auth/callback`
in `staticClients` (Dex) / the realm client (Keycloak).

---

## 5. Social-connection realism — what's actually lost, and does it matter

The prod pain named in the ticket is **Auth0's Google social connection**. Be
concrete about what a local double can and cannot reproduce:

- **What's genuinely Auth0/Google-specific and *cannot* be faithfully reproduced
  offline:** Google's real consent screen; Google-issued profile fields
  (`picture`, `given_name`/`family_name`, `hd` hosted-domain); Auth0's *linking*
  of a Google identity to an Auth0 user and the resulting **`sub` shape**
  (`google-oauth2|<id>` vs a database-connection `auth0|<id>`). If any Marrow
  behaviour ever keyed off the `sub` prefix or Google-only claims, a plain local
  realm would miss it. **Marrow does not** — it treats `sub` as an opaque stable
  string (`routers/auth.py:81,90`) and reads only `sub`/`email`/`name`. So the
  fidelity loss is **immaterial to Marrow's RP**.
- **What a plain username/password realm *does* faithfully reproduce** (which is
  all Marrow's code cares about): a working discovery doc, the authorization-code
  round trip, id_token/userinfo with `sub`+`email`+`name`, cookie/redirect
  mechanics, and RP-initiated logout.
- **Conclusion:** for dev parity a **plain local username/password realm is
  enough**. Simulating "Google" adds cosmetic realism (a branded button) but no
  behavioural coverage Marrow exercises, and doing it fully offline means standing
  up a *second* upstream mock — cost without payoff. If the login *page* look is
  ever wanted, Dex can label a static connector "Sign in with Google"; that's a
  UI affordance, not a real social connection.

---

## 6. Recommendation

**Use Dex (`dexidp/dex:latest`) as Marrow's local OIDC double**, configured with
`enablePasswordDB: true` + `staticPasswords` (a couple of committed dev users) and
a `staticClients` entry whose `redirectURIs` is
`http://localhost:8000/api/auth/callback`, wired into `docker-compose` alongside
Postgres.

Rationale:
- **Marrow's RP works unchanged** — it's fully discovery-driven; swapping to Dex is
  a four-env-var change (`OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET/REDIRECT_URI`), no
  code touched.
- **Best docker-compose citizen** of the three: a small Go binary, sub-second
  offline start, in-memory storage, one committed config file. Docker's own
  first-party guide endorses exactly this "mock OAuth for testing" pattern.
- **Reproducible, config-as-code seeding** of dev users — the whole IdP is one
  YAML file, so every machine gets identical logins with no click-ops.
- It hits the realistic sweet spot between Keycloak (faithful but heavy, slow, and
  overkill for a solo login loop) and `oauth2-mock-server` (great as an in-process
  *test* stub, but no real interactive login flow and no declarative multi-user
  seeding for a dev loop).
- The Google **social** connection needn't be simulated: Marrow reads only
  opaque `sub` + `email`/`name`, so a plain password realm gives full behavioural
  parity; the only cost is cosmetic (no real Google consent screen).

Keep `oauth2-mock-server` in mind for a *different* job — a fast, hook-driven OIDC
stub inside future Node/JS automated tests — not as the dev-loop IdP.

**One-line recommendation:** Adopt **Dex** (`dexidp/dex` with a committed
`staticPasswords`/`staticClients` config) as Marrow's docker-compose local OIDC
double — RP works with an env-only swap, it's the lightest fully-offline option
with reproducible config-as-code seeding, and a plain password realm gives full
behavioural parity since Marrow only reads opaque `sub` + `email`/`name`; watch the
issuer-host-must-match-on-both-sides gotcha.

---

### Primary sources
- Marrow RP code: `api/marrow/auth.py`, `api/marrow/routers/auth.py` (this repo).
- Dex getting started / config-as-code: https://dexidp.io/docs/getting-started/
- Dex local (static password) connector: https://dexidp.io/docs/connectors/local/
- Dex example config (issuer, staticClients, staticPasswords, responseTypes): https://raw.githubusercontent.com/dexidp/dex/master/config.yaml.dist
- Dex scopes/claims (email/profile → email/name/preferred_username): https://dexidp.io/docs/configuration/custom-scopes-claims-clients/
- Docker first-party guide "Mocking OAuth services in testing with Dex": https://docs.docker.com/guides/dex/
- Dex token `iss` example (issuer matching): https://dexidp.io/docs/guides/kubernetes/
- Keycloak containers / realm import (`--import-realm`): https://www.keycloak.org/server/containers
- Keycloak `KEYCLOAK_IMPORT` deprecation: https://github.com/keycloak/keycloak/issues/10216
- oauth2-mock-server (no request validation, hook-based claims, endpoints): https://github.com/axa-group/oauth2-mock-server/blob/master/README.md , https://www.npmjs.com/package/oauth2-mock-server
