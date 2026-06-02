import type { NextConfig } from "next";

// CLOUDFLARE_BUILD=1 is set when building for Cloudflare Workers via OpenNext.
// The standalone output mode is only used for Docker (docker-compose.prod.yml).
const nextConfig: NextConfig = process.env.CLOUDFLARE_BUILD
  ? {}
  : { output: "standalone" };

export default nextConfig;
