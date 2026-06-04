import { Container, env } from "cloudflare:workers";

export class MarrowAPI extends Container {
  defaultPort = 8000;

  // Secrets (wrangler secret put) and vars (wrangler.toml [vars]) must be
  // explicitly forwarded — they do not automatically become container env vars.
  envVars = {
    // Secrets
    DATABASE_URL: env.DATABASE_URL,
    SECRET_KEY: env.SECRET_KEY,
    R2_ENDPOINT_URL: env.R2_ENDPOINT_URL,
    R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: env.R2_BUCKET,
    OIDC_CLIENT_SECRET: env.OIDC_CLIENT_SECRET,
    STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
    LICENSE_SIGNING_KEY: env.LICENSE_SIGNING_KEY,
    // Non-secret vars (from wrangler.toml [vars])
    CORS_ORIGINS: env.CORS_ORIGINS,
    FRONTEND_URL: env.FRONTEND_URL,
    COOKIE_DOMAIN: env.COOKIE_DOMAIN,
    STORAGE_BACKEND: env.STORAGE_BACKEND,
    SAAS_MODE: env.SAAS_MODE,
    OIDC_ISSUER: env.OIDC_ISSUER,
    OIDC_CLIENT_ID: env.OIDC_CLIENT_ID,
    OIDC_REDIRECT_URI: env.OIDC_REDIRECT_URI,
    STRIPE_STARTER_PRICE_MONTHLY: env.STRIPE_STARTER_PRICE_MONTHLY,
    STRIPE_STARTER_PRICE_YEARLY: env.STRIPE_STARTER_PRICE_YEARLY,
    STRIPE_BUSINESS_PRICE_MONTHLY: env.STRIPE_BUSINESS_PRICE_MONTHLY,
    STRIPE_BUSINESS_PRICE_YEARLY: env.STRIPE_BUSINESS_PRICE_YEARLY,
    STRIPE_GROWTH_PRICE_MONTHLY: env.STRIPE_GROWTH_PRICE_MONTHLY,
    STRIPE_GROWTH_PRICE_YEARLY: env.STRIPE_GROWTH_PRICE_YEARLY,
    STRIPE_SH_BUSINESS_PRICE_YEARLY: env.STRIPE_SH_BUSINESS_PRICE_YEARLY,
    STRIPE_SH_ENTERPRISE_PRICE_YEARLY: env.STRIPE_SH_ENTERPRISE_PRICE_YEARLY,
  };
}

export default {
  async fetch(request, env) {
    const id = env.MARROW_API.idFromName("singleton");
    const stub = env.MARROW_API.get(id);
    return stub.fetch(request);
  },
};
