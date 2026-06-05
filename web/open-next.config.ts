// OpenNext Cloudflare adapter config for the Marrow web app (app.marrow.so).
// Required by `opennextjs-cloudflare build` (npm run pages:build).
// Default config: no incremental cache / queue / tag cache — the app is
// served fresh from the Worker. Add R2/KV-backed caches here later if needed.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
