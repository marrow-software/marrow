// Tier data for the pricing page.
// Structured so #43 can replace this with live Stripe-sourced data
// without changing component imports: swap the default exports for
// async functions that fetch from the billing API.

export interface Price {
  monthly: number | null;
  yearly: number | null;
}

export interface Tier {
  id: "self-host" | "cloud" | "enterprise";
  name: string;
  tagline: string;
  price: Price;
  // null = contact sales
  cta: string;
  ctaHref: string;
  highlighted: boolean;
  features: string[];
}

export interface ComparisonRow {
  feature: string;
  "self-host": boolean | string;
  cloud: boolean | string;
  enterprise: boolean | string;
  category?: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export const tiers: Tier[] = [
  {
    id: "self-host",
    name: "Self-host",
    tagline: "Run it yourself, own everything.",
    price: { monthly: 0, yearly: 0 },
    cta: "Get started free",
    ctaHref: "https://github.com/spmcgraw/marrow",
    highlighted: false,
    features: [
      "Unlimited workspaces & spaces",
      "Full node hierarchy (folders + pages)",
      "Append-only revision history",
      "Export / restore guarantee",
      "Full-text search",
      "File attachments",
      "OIDC authentication (any IdP)",
      "Role-based access (owner / editor / viewer)",
      "API key access",
      "Docker & Docker Compose support",
      "Apache 2.0 open-source license",
    ],
  },
  {
    id: "cloud",
    name: "Cloud",
    tagline: "Managed hosting, zero ops.",
    price: { monthly: 12, yearly: 10 },
    cta: "Start free trial",
    ctaHref: "https://marrow.so/signup",
    highlighted: true,
    features: [
      "Everything in Self-host",
      "Managed PostgreSQL + backups",
      "R2 object storage for attachments",
      "Automatic upgrades",
      "Custom domain support",
      "SSO via any OIDC provider",
      "Priority email support",
      "99.9% uptime SLA",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Dedicated infrastructure, SLA, support.",
    price: { monthly: null, yearly: null },
    cta: "Contact sales",
    ctaHref: "mailto:hello@marrow.so",
    highlighted: false,
    features: [
      "Everything in Cloud",
      "Dedicated infrastructure",
      "Custom data residency",
      "Audit log",
      "SSO with SAML 2.0",
      "SLA-backed support",
      "Onboarding & migration assistance",
      "Volume pricing",
    ],
  },
];

export const comparisonRows: ComparisonRow[] = [
  // Core
  { feature: "Workspaces", "self-host": true, cloud: true, enterprise: true, category: "Core" },
  { feature: "Spaces & node hierarchy", "self-host": true, cloud: true, enterprise: true, category: "Core" },
  { feature: "Append-only revisions", "self-host": true, cloud: true, enterprise: true, category: "Core" },
  { feature: "Export / restore guarantee", "self-host": true, cloud: true, enterprise: true, category: "Core" },
  { feature: "Full-text search", "self-host": true, cloud: true, enterprise: true, category: "Core" },
  { feature: "File attachments", "self-host": true, cloud: true, enterprise: true, category: "Core" },
  // Auth & access
  { feature: "OIDC / SSO", "self-host": true, cloud: true, enterprise: true, category: "Auth & access" },
  { feature: "SAML 2.0", "self-host": false, cloud: false, enterprise: true, category: "Auth & access" },
  { feature: "RBAC (owner / editor / viewer)", "self-host": true, cloud: true, enterprise: true, category: "Auth & access" },
  { feature: "API key access", "self-host": true, cloud: true, enterprise: true, category: "Auth & access" },
  // Infrastructure
  { feature: "Managed hosting", "self-host": false, cloud: true, enterprise: true, category: "Infrastructure" },
  { feature: "Automatic backups", "self-host": false, cloud: true, enterprise: true, category: "Infrastructure" },
  { feature: "Custom domain", "self-host": false, cloud: true, enterprise: true, category: "Infrastructure" },
  { feature: "Dedicated infrastructure", "self-host": false, cloud: false, enterprise: true, category: "Infrastructure" },
  { feature: "Custom data residency", "self-host": false, cloud: false, enterprise: true, category: "Infrastructure" },
  // Support
  { feature: "Community support", "self-host": true, cloud: true, enterprise: true, category: "Support" },
  { feature: "Priority email support", "self-host": false, cloud: true, enterprise: true, category: "Support" },
  { feature: "SLA-backed support", "self-host": false, cloud: false, enterprise: true, category: "Support" },
  { feature: "Onboarding assistance", "self-host": false, cloud: false, enterprise: true, category: "Support" },
  // Compliance
  { feature: "Audit log", "self-host": false, cloud: false, enterprise: true, category: "Compliance" },
  { feature: "99.9% uptime SLA", "self-host": false, cloud: true, enterprise: true, category: "Compliance" },
];

export const faqItems: FaqItem[] = [
  {
    question: "What does \"self-hosted\" mean?",
    answer:
      "You run Marrow on your own infrastructure — a server, a VPS, or on-prem. You control the data, the backups, and the upgrades. No data ever touches our servers. The source code is Apache 2.0, so you can audit every line.",
  },
  {
    question: "What is the restore guarantee?",
    answer:
      "Every Marrow export bundle is a self-contained zip: Markdown files, JSON revisions, and attachments — no proprietary formats. Running `marrow restore <bundle.zip>` recreates an exact replica of your workspace on any Marrow instance. We test this on every commit.",
  },
  {
    question: "Can I migrate from Self-host to Cloud later?",
    answer:
      "Yes. Export your workspace on any Marrow instance and restore it on any other — including our Cloud. The export format is version-stable and forward-compatible.",
  },
  {
    question: "How does the yearly discount work?",
    answer:
      "On the yearly plan you pay for 10 months and get 2 free — effectively ~17% off the monthly rate. Billing is annual, upfront.",
  },
  {
    question: "Is there a free trial for Cloud?",
    answer:
      "Yes — 14 days, no credit card required. At the end of the trial you can subscribe or export your data and self-host for free.",
  },
  {
    question: "What counts as a workspace?",
    answer:
      "A workspace is a top-level container for a team or project. Each workspace has its own spaces, pages, and members. Self-host has no limit on workspaces; Cloud plans are billed per workspace.",
  },
  {
    question: "Do you offer non-profit or open-source pricing?",
    answer:
      "Non-profits and open-source projects can apply for a Cloud discount. Email us at hello@marrow.so with a brief description of your project.",
  },
  {
    question: "What happens if I cancel my Cloud subscription?",
    answer:
      "You get a 30-day grace period to export your data. After that the workspace is archived. Your export bundle is always available — you can restore it yourself on any Marrow instance.",
  },
];
