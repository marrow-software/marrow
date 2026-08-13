# Local-dev fidelity of the OpenNext / Cloudflare-Workers web build

Research ticket **#324** (child of wayfinder map **#322**). Investigates whether a
developer can exercise the *actual* SaaS `web/` deploy path — OpenNext → Cloudflare
Workers — locally, and how faithfully that reproduces production, versus the plain
`npm run dev` (`next dev`) loop that never touches the Worker runtime.

> **File location note:** the repo has no `research/` directory and no prior research-doc
> convention (`docs/agents/` holds only agent skill config: `issue-tracker.md`,
> `triage-labels.md`, `domain.md`). Per the ticket's fallback instruction this lives at
> `research/opennext-local-fidelity.md`.

Sources are cited inline as `file:line` (this repo) or URL (primary docs: OpenNext
Cloudflare docs, Cloudflare Workers/Wrangler docs). Secondary blogs were not relied on.

---

## TL;DR verdict

**Yes, the real Worker path is runnable locally, and it is high-fidelity for the two
things #324 cares about** — SSR reading `process.env` from `wrangler.toml [vars]`, and the
browser reading `window.__MARROW_CONFIG__` from the `/config.js` route. Both run inside the
same `workerd` runtime used in production. **But it is a heavyweight, no-HMR full-rebuild
loop**, so it belongs as a **pre-publish checkpoint**, not in the everyday edit loop. The
one material *behavioural* difference is not the runtime — it is that the local Worker's
`[vars]` point `MARROW_API_URL` at the **production** API (`https://api.marrow.so`), so
without an override the local Worker talks to prod, not your local FastAPI.

---

## 1. Can you run the real Worker build locally? Exact commands + cost

**Yes.** OpenNext ships a `preview` step that runs the compiled app in the real Workers
runtime via `wrangler dev`.

- The OpenNext CLI `preview` subcommand "starts by populating the local cache and then
  launches a local development server (**via `wrangler dev`**) so that you can preview the
  application locally." — <https://opennext.js.org/cloudflare/cli>
- `wrangler dev` itself runs production `workerd`, not Node: "This is made possible through
  Miniflare, a simulator that executes your Worker code using the same runtime used in
  production, **workerd**." — <https://developers.cloudflare.com/workers/local-development/>

### Command options

This repo does **not** yet define a `preview` script — `web/package.json` only has
`pages:build` (`CLOUDFLARE_BUILD=1 opennextjs-cloudflare build`) and `pages:deploy`
(`wrangler deploy`) (`web/package.json:11-12`). Two equivalent ways to run the real Worker
locally:

```bash
# A) Two explicit steps (works with what's already in package.json)
cd web
npm run pages:build           # next build + opennextjs-cloudflare build → .open-next/
npx wrangler dev              # serves .open-next/worker.js per wrangler.toml (main + [assets])

# B) The canonical OpenNext one-liner (would need a script added to package.json)
#    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview"
npx opennextjs-cloudflare build && npx opennextjs-cloudflare preview
```

Both boot `wrangler dev` against `main = ".open-next/worker.js"` with the `ASSETS` binding,
exactly as configured in `web/wrangler.toml:14-21`. Option (A) and (B) are functionally
equivalent for this app because `open-next.config.ts` configures **no incremental cache /
queue / tag cache** (`web/open-next.config.ts:3-7`), so `preview`'s "populate the local
cache" step is effectively a no-op here — plain `wrangler dev` after a build is enough.

The recommended OpenNext scripts (`build` / `preview` / `deploy` / `upload`) are documented
at <https://opennext.js.org/cloudflare/get-started>.

### How heavy / slow

Heavy. Every run is a **full production build**: `opennextjs-cloudflare build` "first builds
the Next.js application by invoking the `build` script … (`next build`). It then runs the
Cloudflare specific build step" — <https://opennext.js.org/cloudflare/cli>. That is the same
work CI does for `pages:build` (`.github/workflows/release.yml` / `ci.yml`). There is **no
Fast Refresh / HMR** — `wrangler dev` serves a static compiled bundle, so any source edit
means re-running `next build` + the OpenNext transform + rebooting the Worker (tens of
seconds to minutes, dominated by `next build`). Contrast `npm run dev` (`next dev`,
`web/package.json:6`), which is an incremental HMR dev server.

---

## 2. Does the local Worker faithfully reproduce how `runtime-config.ts` reads config?

**Yes — both halves are reproduced, because both run in `workerd`.**

`web/lib/runtime-config.ts` has a server branch (`typeof window === "undefined"` →
`process.env.MARROW_*`, lines 27-29, 34-36, 41-43) and a browser branch
(`window.__MARROW_CONFIG__`, lines 30, 37, 44).

**SSR path (process.env ← wrangler [vars]).** The Worker enables `nodejs_compat`
(`web/wrangler.toml:16`), and with that flag Cloudflare exposes config vars on
`process.env`: "when nodejs_compat is enabled … environment variables are available via the
global `process.env`." —
<https://developers.cloudflare.com/workers/configuration/environment-variables/>. Under
`wrangler dev`, the `[vars]` block (`MARROW_API_URL`, `MARROW_OIDC_ENABLED` —
`web/wrangler.toml:27-29`) is loaded locally: "Environment variables … are easily
configurable locally (such as in a `.dev.vars` file or directly in Wrangler configuration)."
— <https://developers.cloudflare.com/workers/local-development/>. So the local Worker's SSR
reads exactly the same `process.env.MARROW_API_URL` from the same `[vars]` source as
production. This is the one code path `next dev` **cannot** exercise (Node runtime, no
`[vars]` injection) — the comment in `web/wrangler.toml:23-26` describes precisely this
mechanism.

**Browser path (`/config.js` route).** `web/app/config.js/route.ts` is a `force-dynamic`
route handler (line 14) that runs server-side, reads the same getters (`getApiUrl` etc.,
lines 16-22) off `process.env`, and emits `window.__MARROW_CONFIG__ = …` (line 23).
`web/app/layout.tsx:27` loads it `<Script src="/config.js" strategy="beforeInteractive" />`.
Running the real Worker locally executes this handler in `workerd` and serves the script to
the browser — the full round trip (`[vars]` → `process.env` → route handler →
`window.__MARROW_CONFIG__` → client `runtime-config` getters) is reproduced. This is exactly
the path that is **invisible under `next dev`**, and the path the CLAUDE.md "Web runtime
config" section warns must not be shadowed by a checked-in static `public/config.js` (there
is none — confirmed: the Docker `public/config.js` is written at container start by
`web/docker-entrypoint.sh`, not committed).

Net: the local Worker build is the *only* local way to see the real `/config.js` route and
the real `[vars]`→`process.env` SSR binding behave together.

---

## 3. What breaks or differs locally vs the deployed Worker

The runtime is identical (`workerd` both places), so differences are about **data the
Worker talks to**, not code behaviour:

- **`[vars]` point at production by default → local Worker calls the prod API.**
  `web/wrangler.toml:28` sets `MARROW_API_URL = "https://api.marrow.so"`. Because local
  `wrangler dev` loads `[vars]` verbatim, your locally-running Worker's SSR + `/config.js`
  will advertise and call the **production** API, not a local FastAPI. To point at local dev
  you must override — e.g. a `.dev.vars` file or `wrangler dev --var MARROW_API_URL:...`
  (local var config per
  <https://developers.cloudflare.com/workers/local-development/>). This is the single most
  important "differs locally" gotcha.
- **Secrets are not auto-present locally.** Real secrets set with `wrangler secret put` are
  not available to local dev; local runs read secrets from a `.dev.vars` / `.env` file
  beside the Wrangler config: "Put secrets for use in local development in either a
  `.dev.vars` file or a `.env` file … Do not commit secrets to git." —
  <https://developers.cloudflare.com/workers/configuration/environment-variables/>. Low
  impact here: the web Worker has **no secrets** — `MARROW_API_KEY` is unset for SaaS (OIDC,
  not API-key, in prod) and `getApiKey()` just returns `""` (`web/lib/runtime-config.ts:34-38`).
- **Bindings are local simulations by default.** "By default, bindings connect to locally
  simulated resources," and you opt into real resources per-binding with `remote: true` (or
  globally toggle with the `--local` flag) —
  <https://developers.cloudflare.com/workers/local-development/>. Low impact here too: the
  web Worker declares **only** the static `ASSETS` binding (`web/wrangler.toml:19-21`) — no
  KV / D1 / R2 / queues. (R2 is used by the **API** on Fly.io via boto, not by this Worker,
  so there is no R2 binding to simulate on the web side.)
- **Assets/edge specifics not modelled:** custom-domain routing (`app.marrow.so`), real
  Cloudflare cache, and OIDC cookie-domain behaviour across real origins are only exercised
  once actually deployed; local `wrangler dev` serves on `localhost`.
- **`next dev` cannot use `getCloudflareContext` without `initOpenNextCloudflareForDev`** in
  `next.config` — but Marrow's `web/` does not use `getCloudflareContext` at all (config
  flows only through `process.env` + `[vars]`), so this common OpenNext caveat does not
  apply here.

---

## 4. Verdict: everyday loop vs pre-publish checkpoint

**Pre-publish checkpoint, not the everyday loop.**

- The runtime fidelity is genuinely high — `workerd` via Miniflare is "the same runtime used
  in production" (<https://developers.cloudflare.com/workers/local-development/>), and it is
  the *only* local way to exercise the `[vars]`→`process.env` SSR binding and the
  `/config.js` route together (Section 2). That makes it the right tool to catch the
  Worker-specific failure classes the codebase already warns about: a reintroduced
  `proxy.ts`/middleware breaking the build, a missing `open-next.config.ts`, a checked-in
  `public/config.js` shadowing the route, or a `[vars]`/`process.env` config regression.
- But it is a **full `next build` + OpenNext transform per change with no HMR** (Section 1) —
  far too slow to iterate in. The everyday loop stays `npm run dev` (`next dev`) against a
  local FastAPI, which the CLAUDE.md dev setup already prescribes.
- Practical guidance: keep `next dev` for feature work; run the Worker build (`npm run
  pages:build && npx wrangler dev`, or add an `opennextjs-cloudflare preview` script) as a
  **gate before tagging a release / merging changes that touch** `wrangler.toml`,
  `open-next.config.ts`, `runtime-config.ts`, `app/config.js/route.ts`, `app/layout.tsx`, or
  anything Worker-runtime-sensitive (middleware, Node-API usage). When you do run it locally,
  **override `MARROW_API_URL`** (`.dev.vars` / `--var`) or the local Worker will hit the
  production API (Section 3).

---

## Primary sources

- OpenNext Cloudflare — CLI subcommands (`build`/`preview`/`deploy`/`upload`, "preview …
  launches a local development server via `wrangler dev`"): <https://opennext.js.org/cloudflare/cli>
- OpenNext Cloudflare — Get Started (recommended `build`/`preview`/`deploy` scripts):
  <https://opennext.js.org/cloudflare/get-started>
- OpenNext Cloudflare — Bindings (local simulation vs remote; `.dev.vars` during SSG):
  <https://opennext.js.org/cloudflare/bindings>
- Cloudflare Workers — Local development (`wrangler dev` = workerd via Miniflare; `[vars]`
  local; bindings local by default; `remote:true`/`--local`):
  <https://developers.cloudflare.com/workers/local-development/>
- Cloudflare Workers — Environment variables / secrets (`nodejs_compat` → `process.env`;
  `.dev.vars` for local secrets): <https://developers.cloudflare.com/workers/configuration/environment-variables/>
- Repo: `web/package.json`, `web/wrangler.toml`, `web/open-next.config.ts`,
  `web/lib/runtime-config.ts`, `web/app/config.js/route.ts`, `web/app/layout.tsx`,
  `web/docker-entrypoint.sh`; CLAUDE.md "Web runtime config (SaaS vs Docker)" / "OpenNext
  build constraints" / "Deployment paths".
