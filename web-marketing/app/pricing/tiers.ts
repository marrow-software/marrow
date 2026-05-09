// Tier copy is hardcoded here so it matches the prototype exactly.
// Issue #43 will replace this module with live Stripe-sourced data.
// The shape of this export must remain stable so #43 can swap the source
// without changing any component imports.

export interface TierPrice {
  amount: string;
  suffix?: string;
  note: string;
}

export interface Tier {
  id: "selfhost" | "cloud" | "enterprise";
  name: string;
  flourish: string;
  price: {
    monthly: TierPrice;
    yearly: TierPrice;
  };
  cta: string;
  ctaHref: string;
  blurb: string;
  features: string[];
  featured?: boolean;
}

export type Billing = "monthly" | "yearly";

export const tiers: Tier[] = [
  {
    id: "selfhost",
    name: "Self-host",
    flourish: "Yours to keep",
    price: {
      monthly: { amount: "$0", note: "forever" },
      yearly: { amount: "$0", note: "forever" },
    },
    cta: "Get the image",
    ctaHref: "/docs/install",
    blurb:
      "One Docker image. One database. One filesystem. No license server phoning home.",
    features: [
      "Unlimited pages & workspaces",
      "Unlimited editors",
      "Every feature in the product",
      "Community support",
      "MIT licensed source",
      "No telemetry, no phone-home",
    ],
  },
  {
    id: "cloud",
    name: "Cloud",
    flourish: "We run it, you write",
    price: {
      monthly: {
        amount: "$29",
        suffix: "/workspace/mo",
        note: "billed monthly",
      },
      yearly: {
        amount: "$24",
        suffix: "/workspace/mo",
        note: "billed annually — $288/yr",
      },
    },
    cta: "Start 30-day trial",
    ctaHref: "/signup",
    blurb:
      "Managed, backed up, updated. One flat price covers your whole team — no per-seat math, no finance dance.",
    features: [
      "Everything in Self-host",
      "Up to 50 editors per workspace",
      "Daily snapshots to your S3",
      "Custom subdomain + SSL",
      "99.9% uptime SLA",
      "Email & Slack support",
    ],
    featured: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    flourish: "For the careful ones",
    price: {
      monthly: { amount: "Let's talk", note: "annual contract" },
      yearly: { amount: "Let's talk", note: "annual contract" },
    },
    cta: "Book a call",
    ctaHref: "/contact",
    blurb:
      "SSO, audit logs, a dedicated region, and a human who knows your name when you email.",
    features: [
      "Everything in Cloud",
      "Unlimited editors",
      "SAML SSO + SCIM",
      "Audit log export",
      "Single-tenant deployment",
      "Priority support + named contact",
      "Custom DPA + MSA",
    ],
  },
];

export interface ComparisonRow {
  label: string;
  selfhost: boolean | string;
  cloud: boolean | string;
  enterprise: boolean | string;
  isSection?: boolean;
}

export const comparisonRows: ComparisonRow[] = [
  { label: "Core product", selfhost: false, cloud: false, enterprise: false, isSection: true },
  { label: "Block editor", selfhost: true, cloud: true, enterprise: true },
  { label: "Search (cmd+k)", selfhost: true, cloud: true, enterprise: true },
  { label: "Backlinks & history", selfhost: true, cloud: true, enterprise: true },
  { label: "Collaboration", selfhost: false, cloud: false, enterprise: false, isSection: true },
  { label: "Editors per workspace", selfhost: "Unlimited", cloud: "50", enterprise: "Unlimited" },
  { label: "Comments & threads", selfhost: true, cloud: true, enterprise: true },
  { label: "Guest viewers", selfhost: "Unlimited", cloud: "100 / ws", enterprise: "Unlimited" },
  { label: "Operations", selfhost: false, cloud: false, enterprise: false, isSection: true },
  { label: "Daily backups", selfhost: "DIY", cloud: "To our S3", enterprise: "To your S3" },
  { label: "Uptime SLA", selfhost: "—", cloud: "99.9%", enterprise: "99.99%" },
  { label: "SAML SSO", selfhost: false, cloud: false, enterprise: true },
  { label: "SCIM provisioning", selfhost: false, cloud: false, enterprise: true },
  { label: "Audit logs (90d)", selfhost: false, cloud: true, enterprise: "Unlimited" },
  { label: "Single-tenant region", selfhost: false, cloud: false, enterprise: true },
  { label: "Support", selfhost: false, cloud: false, enterprise: false, isSection: true },
  { label: "Community forum", selfhost: true, cloud: true, enterprise: true },
  { label: "Email support", selfhost: false, cloud: true, enterprise: true },
  { label: "Named contact", selfhost: false, cloud: false, enterprise: true },
];

export interface FaqItem {
  q: string;
  a: string;
}

export const faqItems: FaqItem[] = [
  {
    q: "Why price by workspace, not per seat?",
    a: "Because per-seat pricing penalizes the thing you want — more people reading and writing. A knowledge base shouldn't have a cost function that rewards fewer eyes on the docs.",
  },
  {
    q: "Can I move between self-host and cloud?",
    a: "Either direction, at any time. Your pages are plain Markdown and your database dumps cleanly. We publish a one-command migrator.",
  },
  {
    q: "What counts as a workspace?",
    a: "One company, one team, one weird side project — a workspace is a tree of pages with its own members. Most teams use exactly one.",
  },
  {
    q: "Do you train AI on our content?",
    a: "No. We don't read your content, we don't train on your content, and AI features are off by default and require your own API key.",
  },
  {
    q: "What happens if you go out of business?",
    a: "The product is MIT-licensed and runs on commodity infrastructure. Your data is Markdown on your disk. You're never stranded, even in the bad scenario.",
  },
  {
    q: "Do you offer an education or non-profit discount?",
    a: "50% off Cloud for registered non-profits, verified open-source projects, and anyone running a classroom. Email us.",
  },
];
