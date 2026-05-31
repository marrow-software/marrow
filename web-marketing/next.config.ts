import type { NextConfig } from "next";

// CF_PAGES is set by Cloudflare Pages during its build. next-on-pages doesn't
// support output: "standalone", so we omit it when building for CF Pages.
const nextConfig: NextConfig = process.env.CF_PAGES
  ? {}
  : { output: "standalone" };

export default nextConfig;
