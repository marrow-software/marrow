import Link from "next/link";
import { Chrome } from "@/components/chrome";
import { Wordmark } from "@/components/wordmark";
import {
  IconArrowRight,
  IconCheck,
  IconClose,
  IconDatabase,
  IconFileText,
  IconHistory,
  IconLayers,
  IconSearch,
  IconShield,
  IconUsers,
} from "@/components/icons";

const headingStyle = {
  fontFamily: "var(--font-heading)",
  fontVariationSettings: '"SOFT" 100, "opsz" 144',
  fontWeight: 500,
} as const;

const monoStyle = { fontFamily: "var(--font-mono)" } as const;

/* ── Hero ──────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--border)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-96 max-w-3xl rounded-full opacity-25 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--color-accent-brand) 0%, transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-6 pt-28 pb-24 text-center">
        <p
          className="mb-5 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]"
          style={monoStyle}
        >
          Self-hosted · open source · yours
        </p>
        <h1
          className="mx-auto max-w-4xl text-balance text-5xl leading-[1.05] tracking-tight md:text-7xl"
          style={headingStyle}
        >
          Your knowledge, down to the marrow.
        </h1>
        <p className="mx-auto mt-7 max-w-2xl text-lg text-[var(--muted-foreground)]">
          A self-hosted knowledge base with an iron-clad restore guarantee.
          Append-only history, a transparent export format, and no vendor
          between you and your data.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/docs/install"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-[var(--primary)] px-6 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
          >
            Deploy On-prem
            <IconArrowRight size={16} />
          </Link>
          <Link
            href="/docs"
            className="inline-flex h-11 items-center rounded-md border border-[var(--border)] px-6 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
          >
            Read the docs
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Product peek (Marrow app header + shell) ──────────────────────────── */

function ProductPeek() {
  const tree = [
    { label: "Engineering", depth: 0, kind: "space" as const },
    { label: "Runbooks", depth: 1, kind: "folder" as const },
    { label: "Incident response", depth: 2, kind: "page" as const, active: true },
    { label: "On-call rotation", depth: 2, kind: "page" as const },
    { label: "Architecture", depth: 1, kind: "folder" as const },
    { label: "Restore guarantee", depth: 2, kind: "page" as const },
  ];

  return (
    <section className="mx-auto -mt-12 max-w-5xl px-6">
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl shadow-black/40">
        {/* app header */}
        <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-4">
          <div className="flex items-center gap-3">
            <Wordmark size={18} />
            <span
              className="hidden text-xs text-[var(--muted-foreground)] sm:inline"
              style={monoStyle}
            >
              acme / engineering
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-xs text-[var(--muted-foreground)]">
              <IconSearch size={13} />
              Search
            </span>
            <span className="h-7 w-7 rounded-full bg-[var(--primary)]/80" />
          </div>
        </div>
        <div className="grid md:grid-cols-[220px_1fr]">
          {/* sidebar tree */}
          <div className="hidden space-y-1 border-r border-[var(--border)] p-3 md:block">
            {tree.map((n) => (
              <div
                key={n.label}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                  n.active
                    ? "bg-[var(--primary)]/15 text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)]"
                }`}
                style={{ paddingLeft: 8 + n.depth * 14 }}
              >
                {n.kind === "space" && <IconLayers size={13} />}
                {n.kind === "folder" && (
                  <span className="text-[var(--muted-foreground)]">›</span>
                )}
                {n.kind === "page" && <IconFileText size={13} />}
                <span className={n.kind === "space" ? "font-medium" : ""}>
                  {n.label}
                </span>
              </div>
            ))}
          </div>
          {/* editor pane */}
          <div className="p-7">
            <p
              className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--muted-foreground)]"
              style={monoStyle}
            >
              Runbooks · revision 14
            </p>
            <h3 className="text-2xl tracking-tight" style={headingStyle}>
              Incident response
            </h3>
            <div className="mt-5 space-y-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
              <p>
                Page the on-call engineer first. Open a thread and pin it — the
                timeline matters more than the fix.
              </p>
              <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
                <pre className="text-xs" style={monoStyle}>
                  <code>{`marrow export --workspace acme --output backup.zip`}</code>
                </pre>
              </div>
              <p>
                Every save is a new revision. Nothing is ever overwritten in
                place.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Trust row ─────────────────────────────────────────────────────────── */

function TrustRow() {
  const items = [
    "Apache 2.0 licensed",
    "Runs on PostgreSQL",
    "Zero telemetry by default",
  ];
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <div className="grid gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)] sm:grid-cols-3">
        {items.map((label) => (
          <div
            key={label}
            className="flex items-center justify-center gap-2 bg-[var(--background)] px-4 py-5 text-sm text-[var(--muted-foreground)]"
            style={monoStyle}
          >
            <IconCheck size={15} />
            {label}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Feature grid ──────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: IconShield,
    title: "Restore guarantee",
    body: "Every export bundle restores to an exact replica of the original workspace. It's a tested regression anchor, not a marketing line.",
  },
  {
    icon: IconHistory,
    title: "Append-only history",
    body: "Saves create revisions; a database trigger makes them immutable. Nothing is ever modified or deleted in place.",
  },
  {
    icon: IconFileText,
    title: "Transparent format",
    body: "Bundles are plain Markdown and JSON with a readable manifest. No proprietary blobs — open the zip and read it.",
  },
  {
    icon: IconLayers,
    title: "Structured hierarchy",
    body: "Organizations, workspaces, spaces, and a self-referential tree of folders and pages. As deep as the work needs.",
  },
  {
    icon: IconSearch,
    title: "Full-text search",
    body: "PostgreSQL full-text search across every page in a workspace, scoped and ranked. No extra service to run.",
  },
  {
    icon: IconUsers,
    title: "OIDC + roles",
    body: "Sign in with any OIDC provider. Org membership with owner, editor, and viewer roles enforced on every route.",
  },
];

function FeatureGrid() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="mb-12 max-w-2xl">
        <h2 className="text-4xl tracking-tight" style={headingStyle}>
          Built to outlast the tool that made it.
        </h2>
        <p className="mt-4 text-[var(--muted-foreground)]">
          The restore guarantee is the architectural foundation. Every other
          decision flows from it.
        </p>
      </div>
      <div className="grid gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="bg-[var(--background)] p-7">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[var(--primary)]/12 text-[var(--primary)]">
              <Icon size={18} />
            </span>
            <h3 className="mt-4 text-lg font-medium text-[var(--foreground)]">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
              {body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Editor close-up ───────────────────────────────────────────────────── */

function EditorCloseup() {
  const blocks = [
    { type: "Heading" },
    { type: "Paragraph" },
    { type: "Code (Shiki)" },
    { type: "Table" },
  ];
  return (
    <section className="border-y border-[var(--border)] bg-[var(--card)]">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2">
        <div>
          <p
            className="mb-3 text-xs uppercase tracking-[0.16em] text-[var(--primary)]"
            style={monoStyle}
          >
            The editor
          </p>
          <h2 className="text-4xl tracking-tight" style={headingStyle}>
            A real block editor underneath.
          </h2>
          <p className="mt-4 text-[var(--muted-foreground)]">
            Code blocks with Shiki syntax highlighting, tables, <code>@</code>{" "}
            member mentions, and a <code>/page</code> command that links straight
            to another page. Saved as canonical JSON, exported as readable
            Markdown.
          </p>
          <Link
            href="/product"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--primary)] hover:underline"
          >
            See the product tour
            <IconArrowRight size={15} />
          </Link>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6">
          <div className="mb-4 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--border)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--border)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--border)]" />
          </div>
          <h3 className="text-xl tracking-tight" style={headingStyle}>
            Restore guarantee
          </h3>
          <div className="mt-4 space-y-2">
            {blocks.map((b) => (
              <div
                key={b.type}
                className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]"
                style={monoStyle}
              >
                <span>{b.type}</span>
                <IconCheck size={13} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Comparison ────────────────────────────────────────────────────────── */

function Comparison() {
  const rows: { label: string; marrow: boolean; notion: boolean; conf: boolean }[] =
    [
      { label: "Self-host on your own infrastructure", marrow: true, notion: false, conf: true },
      { label: "Open source", marrow: true, notion: false, conf: false },
      { label: "Human-readable export format", marrow: true, notion: false, conf: false },
      { label: "Append-only revision history", marrow: true, notion: false, conf: false },
      { label: "Verified full-workspace restore", marrow: true, notion: false, conf: false },
      { label: "No telemetry by default", marrow: true, notion: false, conf: false },
    ];

  const Cell = ({ on }: { on: boolean }) =>
    on ? (
      <span className="inline-flex text-[var(--color-success)]">
        <IconCheck size={17} />
      </span>
    ) : (
      <span className="inline-flex text-[var(--muted-foreground)]/50">
        <IconClose size={15} />
      </span>
    );

  return (
    <section className="mx-auto max-w-4xl px-6 py-20">
      <h2 className="mb-10 text-center text-4xl tracking-tight" style={headingStyle}>
        Where Marrow differs.
      </h2>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--card)]">
              <th className="p-4 text-left font-medium text-[var(--muted-foreground)]" />
              <th className="p-4 text-center font-medium text-[var(--foreground)]">
                Marrow
              </th>
              <th className="p-4 text-center font-medium text-[var(--muted-foreground)]">
                Notion
              </th>
              <th className="p-4 text-center font-medium text-[var(--muted-foreground)]">
                Confluence
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="p-4 text-[var(--foreground)]">{r.label}</td>
                <td className="p-4 text-center">
                  <Cell on={r.marrow} />
                </td>
                <td className="p-4 text-center">
                  <Cell on={r.notion} />
                </td>
                <td className="p-4 text-center">
                  <Cell on={r.conf} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">
        Comparison reflects Marrow&apos;s self-hosted, open-source design — not a
        feature-for-feature audit of every plan.
      </p>
    </section>
  );
}

/* ── Self-host terminal ────────────────────────────────────────────────── */

function SelfHost() {
  const lines = [
    { p: "$", c: "git clone https://github.com/spmcgraw/marrow.git" },
    { p: "$", c: "cd marrow && cp .env.prod.example .env" },
    { p: "$", c: "docker compose -f docker-compose.prod.yml up -d" },
    { p: "", c: "marrow ready → http://localhost:3000", muted: true },
  ];
  return (
    <section className="mx-auto max-w-4xl px-6 py-20">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <h2 className="text-4xl tracking-tight" style={headingStyle}>
            Three commands to your own instance.
          </h2>
          <p className="mt-4 text-[var(--muted-foreground)]">
            Postgres, API, and web in one compose stack. No accounts, no
            license keys, no phone-home.
          </p>
          <Link
            href="/docs/install"
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-[var(--primary)] px-6 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
          >
            Deploy On-prem
            <IconArrowRight size={16} />
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[#0d0f14]">
          <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <pre
            className="overflow-x-auto p-5 text-[13px] leading-relaxed"
            style={monoStyle}
          >
            {lines.map((l, i) => (
              <div
                key={i}
                className={
                  l.muted ? "text-[var(--color-success)]" : "text-[#e2e8f0]"
                }
              >
                {l.p && <span className="text-[var(--primary)]">{l.p} </span>}
                {l.c}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </section>
  );
}

/* ── Cream moment ──────────────────────────────────────────────────────── */

function CreamMoment() {
  return (
    <section
      className="px-6 py-28"
      style={{ backgroundColor: "var(--color-cream)", color: "#1a0f0a" }}
    >
      <div className="mx-auto max-w-3xl text-center">
        <p
          className="text-3xl leading-snug md:text-4xl"
          style={{
            fontFamily: "var(--font-heading)",
            fontVariationSettings: '"SOFT" 100, "opsz" 144, "WONK" 1',
            fontWeight: 500,
          }}
        >
          “The first tool I&apos;ve trusted to still open the day it shuts
          down.”
        </p>
        <p
          className="mt-6 text-sm uppercase tracking-[0.16em] opacity-70"
          style={monoStyle}
        >
          The export bundle is the product&apos;s promise, written down.
        </p>
      </div>
    </section>
  );
}

/* ── Final CTA ─────────────────────────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-28 text-center">
      <h2
        className="mx-auto max-w-2xl text-balance text-4xl tracking-tight md:text-5xl"
        style={headingStyle}
      >
        Deploy it on your own metal.
      </h2>
      <p className="mx-auto mt-5 max-w-xl text-[var(--muted-foreground)]">
        Open source, Apache 2.0. Fork it, run it, and keep your knowledge where
        you can always reach it.
      </p>
      <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/docs/install"
          className="inline-flex h-11 items-center gap-2 rounded-md bg-[var(--primary)] px-6 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
        >
          Deploy On-prem
          <IconArrowRight size={16} />
        </Link>
        <Link
          href="https://github.com/spmcgraw/marrow"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center rounded-md border border-[var(--border)] px-6 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
        >
          View on GitHub
        </Link>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <Chrome>
      <Hero />
      <ProductPeek />
      <TrustRow />
      <FeatureGrid />
      <EditorCloseup />
      <Comparison />
      <SelfHost />
      <CreamMoment />
      <FinalCTA />
    </Chrome>
  );
}
