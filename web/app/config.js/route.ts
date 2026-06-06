// Serves /config.js for the browser bundle. Loaded by app/layout.tsx via
// <Script src="/config.js" strategy="beforeInteractive" /> to populate
// window.__MARROW_CONFIG__ before any client code runs.
//
// Why a route handler: on the Cloudflare Workers / OpenNext deploy there is no
// docker-entrypoint.sh to generate a static public/config.js, so this handler
// emits the config from process.env (fed by wrangler [vars]) at request time.
// On Docker self-host the entrypoint writes a static public/config.js, which
// the static asset path serves in preference to this route — same shape, same
// values.

import { getApiUrl, getApiKey, getOidcEnabled } from "@/lib/runtime-config";

export const dynamic = "force-dynamic"; // read env per request, never cache

export function GET() {
  // Server-side getters read process.env (window is undefined here).
  const config = {
    apiUrl: getApiUrl(),
    apiKey: getApiKey(),
    oidcEnabled: getOidcEnabled(),
  };
  return new Response(`window.__MARROW_CONFIG__ = ${JSON.stringify(config)};`, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
