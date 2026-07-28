// Tier data for the pricing page.
// Structured so #43 can replace this with live Stripe-sourced data
// without changing component imports: swap the default exports for
// async functions that fetch from the billing API.
//
// Two axes, per #271:
//   • Deployment (the marketing story, and the comparison grid): Self-host / Cloud / Enterprise
//   • Seat band (Cloud billing reality, shown only in the Cloud card): Starter / Business / Growth
// Cloud is billed per organization at a flat rate with a seat cap — not per seat, not per workspace.

export interface Price {
  monthly: number | null;
  yearly: number | null;
}

// A Cloud seat band. Prices are display-only; the real amounts live in Stripe
// and are enforced against TIER_SEAT_LIMITS in the API.
export interface SeatBand {
  name: string;
  price: Price;
  seats: string;
}

export interface Tier {
  id: "self-host" | "cloud" | "enterprise";
  name: string;
  tagline: string;
  price: Price;
  // null = contact sales
  priceFrom?: boolean; // render the price as a "from" floor (Cloud starts at Starter)
  priceNote?: string; // small print under the price
  bands?: SeatBand[]; // seat bands — Cloud card only
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

// Cloud seat bands, ordered cheapest-first. The Cloud tier's "from" floor price
// is derived from the first band so the two never drift apart.
const CLOUD_BANDS: SeatBand[] = [
  { name: "Starter", price: { monthly: 12, yearly: 10 }, seats: "Up to 10 members" },
  { name: "Business", price: { monthly: 49, yearly: 41 }, seats: "Up to 50 members" },
  { name: "Growth", price: { monthly: 199, yearly: 166 }, seats: "Up to 250 members" },
];

export const tiers: Tier[] = [
  {
    id: "self-host",
    name: "Self-host",
    tagline: "Run it yourself, own everything.",
    price: { monthly: 0, yearly: 0 },
    cta: "Get started free",
    ctaHref: "https://github.com/marrow-software/marrow",
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
    // Floor price = cheapest band (Starter). CLOUD_BANDS carries the full ladder.
    price: CLOUD_BANDS[0].price,
    priceFrom: true,
    priceNote: "per organization · billed by seat band",
    bands: CLOUD_BANDS,
    cta: "Start free trial",
    ctaHref: "https://app.marrow.so",
    highlighted: true,
    features: [
      "Everything in Self-host",
      "Managed PostgreSQL with automatic backups",
      "R2 object storage for attachments",
      "Automatic upgrades",
      "Hosted sign-in (shared identity)",
      "Priority email support (Business & up)",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Contract, SLA, and a human on the other end.",
    price: { monthly: null, yearly: null },
    cta: "Contact sales",
    ctaHref: "mailto:hello@marrow.so",
    highlighted: false,
    features: [
      "Everything in Cloud",
      "Invoiced annual billing",
      "SLA-backed support (by contract)",
      "Onboarding & migration assistance",
      "Volume pricing",
      "Dedicated infrastructure & data residency (on request)",
    ],
  },
];

// The grid compares capabilities along the deployment axis. Seat bands differ
// only by size, so they live in the Cloud card, not here. "Roadmap" = planned,
// not shipped; "By contract" = negotiated as part of an Enterprise agreement.
export const comparisonRows: ComparisonRow[] = [
  // Core
  { feature: "Workspaces & spaces", "self-host": true, cloud: true, enterprise: true, category: "Core" },
  { feature: "Node hierarchy (folders + pages)", "self-host": true, cloud: true, enterprise: true, category: "Core" },
  { feature: "Append-only revisions", "self-host": true, cloud: true, enterprise: true, category: "Core" },
  { feature: "Export / restore guarantee", "self-host": true, cloud: true, enterprise: true, category: "Core" },
  { feature: "Full-text search", "self-host": true, cloud: true, enterprise: true, category: "Core" },
  { feature: "File attachments", "self-host": true, cloud: true, enterprise: true, category: "Core" },
  // Auth & access
  { feature: "Sign-in / SSO", "self-host": "Any IdP", cloud: "Hosted", enterprise: "Hosted", category: "Auth & access" },
  { feature: "RBAC (owner / editor / viewer)", "self-host": true, cloud: true, enterprise: true, category: "Auth & access" },
  { feature: "API key access", "self-host": true, cloud: true, enterprise: true, category: "Auth & access" },
  // Infrastructure
  { feature: "Managed hosting", "self-host": false, cloud: true, enterprise: true, category: "Infrastructure" },
  { feature: "Automatic backups", "self-host": false, cloud: true, enterprise: true, category: "Infrastructure" },
  { feature: "Dedicated infrastructure", "self-host": false, cloud: false, enterprise: "By contract", category: "Infrastructure" },
  { feature: "Data residency options", "self-host": false, cloud: false, enterprise: "By contract", category: "Infrastructure" },
  // Support
  { feature: "Community support", "self-host": true, cloud: true, enterprise: true, category: "Support" },
  { feature: "Priority email support", "self-host": false, cloud: true, enterprise: true, category: "Support" },
  { feature: "SLA-backed support", "self-host": false, cloud: false, enterprise: "By contract", category: "Support" },
  { feature: "Onboarding & migration", "self-host": false, cloud: false, enterprise: "By contract", category: "Support" },
  // Roadmap — planned, not shipped today
  { feature: "Custom domain", "self-host": false, cloud: "Roadmap", enterprise: "Roadmap", category: "Roadmap" },
  { feature: "SAML 2.0", "self-host": false, cloud: false, enterprise: "Roadmap", category: "Roadmap" },
  { feature: "Audit log", "self-host": false, cloud: false, enterprise: "Roadmap", category: "Roadmap" },
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
      "Every Marrow export bundle is a self-contained zip — Markdown files, JSON revisions, and attachments, no proprietary formats. Running `marrow restore <bundle.zip>` rebuilds an exact replica of your workspace content — the node tree, revisions, attachments, properties, and links the bundle carries — on any Marrow instance, and we test this on every commit. Comments, share links, and folder-view definitions are slated for a later bundle version; see the scope table at docs.marrow.so/concepts/restore-guarantee for exactly what round-trips today.",
  },
  {
    question: "Can I migrate from Self-host to Cloud later?",
    answer:
      "Yes. Export your workspace on any Marrow instance and restore it on any other — including our Cloud. The export format is backward-compatible: a newer version of Marrow reads bundles produced by older ones (schema versions v1–v4).",
  },
  {
    question: "How does the yearly discount work?",
    answer:
      "Yearly plans bill the discounted monthly rate once a year — about 17% off. Starter, for example, is $10/mo billed annually ($120/yr) instead of $12/mo. Business and Growth follow the same math.",
  },
  {
    question: "Is there a free trial for Cloud?",
    answer:
      "Yes — 14 days, no credit card required. If you never add a card, the trial simply ends on day 14 with no charge. Add a card any time during the trial to continue, or export your data and self-host for free.",
  },
  {
    question: "How is Cloud billed — per seat or per workspace?",
    answer:
      "Neither. Cloud is billed per organization, at a flat monthly price for a seat band: Starter (up to 10 members), Business (up to 50), or Growth (up to 250). One org, one bill, any number of workspaces within the band's member cap. Self-host has no limits at all.",
  },
  {
    question: "Do you offer non-profit or open-source pricing?",
    answer:
      "Non-profits and open-source projects can apply for a Cloud discount. Email us at hello@marrow.so with a brief description of your project.",
  },
  {
    question: "What happens if I cancel my Cloud subscription?",
    answer:
      "Cancelling ends the subscription and gates access to the workspace right away — there's no 30-day grace period. Export your data while the plan is still active (export is available on any active subscription), then self-host it for free or resubscribe whenever you like.",
  },
];
