// Marrow marketing landing — ported from references prototype landing.jsx.
// Section structure and styling values are copied 1:1; navigation handlers were
// converted to anchor `href`s pointing to placeholder routes.
import type { CSSProperties } from "react";
import { Button, Eyebrow, MarketingFooter, MarketingHeader } from "@/components/marketing-chrome";
import {
  IconArrow,
  IconBranch,
  IconCheck,
  IconFeather,
  IconGit,
  IconHash,
  IconHistory,
  IconServer,
  IconShield,
  IconUsers,
  IconX,
} from "@/components/icons";

const FEATURES = [
  {
    Icon: IconFeather,
    title: "Block editor, by the book",
    body: "Slash commands, wiki-links, tables, callouts, code. Nothing you haven't seen — everything done well.",
  },
  {
    Icon: IconBranch,
    title: "Backlinks that mean something",
    body: "Every page knows what links to it. Break one and Marrow tells you where.",
  },
  {
    Icon: IconHistory,
    title: "Every keystroke versioned",
    body: "Diff two snapshots side-by-side. Roll back without ceremony.",
  },
  {
    Icon: IconHash,
    title: "Cmd+K, and that's it",
    body: "Search is the navigation. Titles, bodies, attachments, comments — one field, one answer.",
  },
  {
    Icon: IconServer,
    title: "Your data, your disk",
    body: "Pages are plain Markdown. Attachments are regular files. Your backup is a folder.",
  },
  {
    Icon: IconUsers,
    title: "Comment, don't co-write",
    body: "Threads, not cursors. For the 95% of docs that aren't meant to be live-edited.",
  },
];

export default function LandingPage() {
  return (
    <>
      <MarketingHeader />
      {/* HERO — dark-first */}
      <section
        style={{
          background: "var(--color-base)",
          color: "var(--color-text-primary)",
          position: "relative",
          overflow: "hidden",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 32px 0" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: 56,
              alignItems: "center",
              minHeight: 560,
              paddingTop: 40,
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: "clamp(44px, 6.2vw, 84px)",
                  lineHeight: 0.98,
                  fontWeight: 400,
                  letterSpacing: "-0.025em",
                  margin: 0,
                  fontVariationSettings: '"SOFT" 80, "WONK" 0',
                }}
              >
                Your knowledge,
                <br />
                down to the{" "}
                <em
                  style={{
                    fontVariationSettings: '"SOFT" 100, "WONK" 1',
                    fontStyle: "italic",
                    color: "var(--color-accent)",
                  }}
                >
                  marrow
                </em>
                .
              </h1>
              <p
                style={{
                  fontSize: 19,
                  lineHeight: 1.55,
                  maxWidth: 520,
                  marginTop: 28,
                  color: "var(--color-text-secondary)",
                }}
              >
                Marrow is a quiet, self-hosted home for your team&apos;s notes, docs, and decisions — built in plain
                Markdown, yours forever, editable anywhere.
              </p>
              <div style={{ display: "flex", gap: 12, marginTop: 36 }}>
                <Button variant="primary" size="lg" href="/docs/install">
                  <IconServer size={14} /> Deploy On-prem <IconArrow size={15} />
                </Button>
                <Button variant="secondary" size="lg" href="/app">
                  Try the editor
                </Button>
              </div>
              <div
                style={{
                  marginTop: 40,
                  display: "flex",
                  gap: 24,
                  fontSize: 13,
                  color: "var(--color-text-secondary)",
                  alignItems: "center",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <IconGit size={14} /> MIT licensed
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <IconServer size={14} /> Postgres + Markdown
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <IconShield size={14} /> No telemetry
                </span>
              </div>
            </div>
            <HeroProductPeek />
          </div>
        </div>
      </section>

      {/* ONE-LINE MANIFESTO */}
      <section
        style={{
          background: "var(--color-surface)",
          color: "var(--color-text-primary)",
          padding: "72px 32px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto", textAlign: "center" }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(28px, 3.8vw, 44px)",
              lineHeight: 1.2,
              fontWeight: 300,
              letterSpacing: "-0.015em",
              fontVariationSettings: '"SOFT" 100',
            }}
          >
            Your team&apos;s knowledge shouldn&apos;t depend on whether a&nbsp;vendor stays in&nbsp;business.{" "}
            <span style={{ color: "var(--color-accent)" }}>Marrow is the part that&nbsp;stays.</span>
          </p>
        </div>
      </section>

      {/* FEATURE GRID */}
      <section style={{ background: "var(--color-base)", padding: "112px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 72, marginBottom: 72 }}>
            <div>
              <Eyebrow>What&apos;s inside</Eyebrow>
              <h2 style={{ fontSize: 40, marginTop: 12, fontVariationSettings: '"SOFT" 60' }}>
                The unshowy things
                <br />
                that compound.
              </h2>
            </div>
            <p
              style={{
                fontSize: 17,
                color: "var(--color-text-secondary)",
                maxWidth: 520,
                alignSelf: "end",
              }}
            >
              No AI summarizer. No daily standup gamification. A proper editor, a proper tree, a proper search.
              That&apos;s most of the job.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
              background: "var(--color-border)",
              border: "1px solid var(--color-border)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {FEATURES.map((f) => (
              <FeatureCell key={f.title} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* EDITOR CLOSE-UP */}
      <section style={{ background: "var(--color-surface)", padding: "112px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ maxWidth: 720, marginBottom: 48 }}>
            <Eyebrow>The editor</Eyebrow>
            <h2 style={{ fontSize: 40, marginTop: 12, fontVariationSettings: '"SOFT" 60' }}>
              Keyboard-first. Markdown underneath. No&nbsp;surprises.
            </h2>
            <p
              style={{
                fontSize: 16,
                color: "var(--color-text-secondary)",
                marginTop: 20,
                maxWidth: 620,
              }}
            >
              Slash commands, wiki-links, drag-to-reorder blocks. Every keystroke is durable, every page exports to a
              flat .md file on disk.
            </p>
          </div>
          <EditorPeek />
        </div>
      </section>

      {/* COMPARISON */}
      <section style={{ background: "var(--color-base)", padding: "112px 32px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <Eyebrow>Different from the usual suspects</Eyebrow>
          <h2
            style={{
              fontSize: 40,
              marginTop: 12,
              marginBottom: 48,
              fontVariationSettings: '"SOFT" 60',
            }}
          >
            What you&apos;re trading, and what you&apos;re&nbsp;not.
          </h2>
          <Comparison />
        </div>
      </section>

      {/* SELF-HOST */}
      <section style={{ background: "var(--color-surface)", padding: "112px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 64,
              alignItems: "center",
            }}
          >
            <div>
              <Eyebrow>Self-host</Eyebrow>
              <h2 style={{ fontSize: 40, marginTop: 12, fontVariationSettings: '"SOFT" 60' }}>
                One container.
                <br />
                One volume. Done.
              </h2>
              <p
                style={{
                  fontSize: 16,
                  color: "var(--color-text-secondary)",
                  marginTop: 20,
                  maxWidth: 500,
                }}
              >
                Marrow ships as a single Docker image. Postgres for metadata, the filesystem for your pages. Back up by
                copying a folder.
              </p>
              <div style={{ marginTop: 32, display: "flex", gap: 12 }}>
                <Button variant="primary" href="/docs/install">
                  <IconServer size={14} /> Deploy On-prem
                </Button>
              </div>
            </div>
            <TerminalBlock />
          </div>
        </div>
      </section>

      {/* TESTIMONIAL — cream moment */}
      <section
        style={{
          background: "var(--color-cream)",
          color: "#2b2017",
          padding: "112px 32px",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#9a3412",
            }}
          >
            From the field
          </div>
          <blockquote
            style={{
              margin: "20px 0 0",
              fontFamily: "var(--font-display)",
              fontSize: "clamp(26px, 3vw, 36px)",
              lineHeight: 1.3,
              fontWeight: 300,
              letterSpacing: "-0.01em",
              fontVariationSettings: '"SOFT" 80',
            }}
          >
            “Our Confluence exports had been sitting in a zip file for three years. Moving to Marrow took a weekend.
            The docs are{" "}
            <em
              style={{
                color: "#9a3412",
                fontVariationSettings: '"SOFT" 100, "WONK" 1',
              }}
            >
              finally
            </em>{" "}
            somewhere we&apos;ll actually read them.”
          </blockquote>
          <div style={{ marginTop: 32, display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "#ece3d0",
                color: "#9a3412",
                border: "1px solid #c8baa0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-display)",
                fontSize: 18,
              }}
            >
              L
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#2b2017" }}>Lena Osei</div>
              <div style={{ fontSize: 13, color: "#6e5a3f" }}>Staff Engineer, Haven Infrastructure</div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section
        style={{
          background: "var(--color-base)",
          padding: "128px 32px",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
          <h2
            style={{
              fontSize: "clamp(36px, 5vw, 60px)",
              lineHeight: 1.05,
              fontVariationSettings: '"SOFT" 80',
            }}
          >
            Write once.
            <br />
            <span style={{ color: "var(--color-accent)" }}>Keep forever.</span>
          </h2>
          <p
            style={{
              fontSize: 17,
              color: "var(--color-text-secondary)",
              maxWidth: 540,
              margin: "24px auto 0",
            }}
          >
            No lock-in, no migration rituals, no someday-when-we-have-time. Start writing today.
          </p>
          <div style={{ marginTop: 40, display: "flex", gap: 12, justifyContent: "center" }}>
            <Button variant="primary" size="lg" href="/docs/install">
              <IconServer size={14} /> Deploy On-prem <IconArrow size={15} />
            </Button>
            <Button variant="secondary" size="lg" href="/pricing">
              See pricing
            </Button>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}

/* --- HERO product peek: a compact, stylized editor tile --- */
function HeroProductPeek() {
  const sidebarRows: { t: string; active?: boolean }[] = [
    { t: "Runbooks" },
    { t: "Architecture" },
    { t: "— RFCs" },
    { t: "— Q2 planning", active: true },
    { t: "— Postmortems" },
    { t: "Onboarding" },
  ];
  const avatars = [
    { l: "A", c: "#8a5a3a" },
    { l: "S", c: "#3a6b4a" },
    { l: "L", c: "#4a6b8a" },
  ];
  return (
    <div style={{ position: "relative", transform: "translateY(28px) rotate(-0.4deg)" }}>
      <div
        style={{
          background: "#111318",
          color: "#e2e8f0",
          border: "1px solid #2d3348",
          borderRadius: 14,
          boxShadow: "0 40px 80px -30px rgba(40, 24, 12, 0.35), 0 10px 20px -10px rgba(40, 24, 12, 0.25)",
          overflow: "hidden",
          fontFamily: "var(--font-body)",
        }}
      >
        {/* marrow app header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderBottom: "1px solid #2d3348",
            background: "#1a1d27",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12,
              color: "#e2e8f0",
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"SOFT" 40',
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                background: "#e8805c",
                color: "#1a0f0a",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 500,
              }}
            >
              H
            </span>
            Haven Infrastructure
          </div>
          <div style={{ fontSize: 11, color: "#475569", fontFamily: "var(--font-mono)" }}>
            / engineering / architecture / Q2 planning
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center" }}>
            {avatars.map((a, i) => (
              <div
                key={i}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: a.c,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 500,
                  border: "2px solid #1a1d27",
                  marginLeft: i === 0 ? 0 : -5,
                }}
              >
                {a.l}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "170px 1fr" }}>
          {/* sidebar */}
          <div style={{ borderRight: "1px solid #2d3348", padding: "14px 10px", background: "#14171f" }}>
            <div
              style={{
                fontSize: 10,
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                padding: "4px 6px",
              }}
            >
              Engineering
            </div>
            {sidebarRows.map((r, i) => (
              <div
                key={i}
                style={{
                  padding: "5px 8px",
                  paddingLeft: r.t.startsWith("—") ? 18 : 8,
                  fontSize: 12,
                  color: r.active ? "#e2e8f0" : "#94a3b8",
                  background: r.active ? "#222636" : "transparent",
                  borderRadius: 6,
                  marginBottom: 1,
                }}
              >
                {r.t.replace("— ", "")}
              </div>
            ))}
          </div>
          {/* editor */}
          <div style={{ padding: "22px 28px 24px" }}>
            <div
              style={{
                fontSize: 10,
                color: "#475569",
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Last edited 3 min ago · Maya
            </div>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                marginTop: 8,
                color: "#e2e8f0",
                fontWeight: 400,
                letterSpacing: "-0.01em",
              }}
            >
              Q2 Planning — Platform
            </h3>
            <p style={{ fontSize: 13, color: "#cbd5e1", marginTop: 12, lineHeight: 1.6 }}>
              Three themes this quarter: migration off the legacy queue, shrinking our{" "}
              <span style={{ color: "#e8805c", borderBottom: "1px dashed #e8805c" }}>p99 tail</span>, and paying down
              the <span style={{ color: "#e8805c", borderBottom: "1px dashed #e8805c" }}>ingest backpressure</span>{" "}
              work.
            </p>
            <div
              style={{
                marginTop: 14,
                borderLeft: "2px solid #e8805c",
                paddingLeft: 12,
                fontSize: 12,
                color: "#94a3b8",
                fontStyle: "italic",
              }}
            >
              Linked from: RFC-0142, Postmortem 2025-11-04
            </div>
            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "20px 1fr",
                rowGap: 6,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  border: "1.5px solid #34d399",
                  borderRadius: 3,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <IconCheck size={9} style={{ color: "#34d399" }} />
              </span>
              <span style={{ fontSize: 12, color: "#94a3b8", textDecoration: "line-through" }}>
                Name the migration DRI
              </span>

              <span style={{ width: 14, height: 14, border: "1.5px solid #2d3348", borderRadius: 3 }} />
              <span style={{ fontSize: 12, color: "#cbd5e1" }}>Draft the rollback plan</span>

              <span style={{ width: 14, height: 14, border: "1.5px solid #2d3348", borderRadius: 3 }} />
              <span style={{ fontSize: 12, color: "#cbd5e1" }}>Socialize with SRE</span>
            </div>
          </div>
        </div>
      </div>

      {/* floating backlink card */}
      <div
        style={{
          position: "absolute",
          right: -18,
          bottom: -22,
          width: 220,
          padding: "12px 14px",
          background: "#222636",
          border: "1px solid #2d3348",
          borderRadius: 10,
          boxShadow: "0 20px 40px -20px rgba(40,24,12,0.4)",
          transform: "rotate(1.2deg)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#e8805c",
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          3 backlinks
        </div>
        <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 6, lineHeight: 1.5 }}>
          Onboarding / Week 1
          <br />
          RFC-0142 — Ingest v2
          <br />
          Postmortem 2025-11-04
        </div>
      </div>
    </div>
  );
}

function FeatureCell({
  Icon: I,
  title,
  body,
}: {
  Icon: (p: { size?: number; style?: CSSProperties }) => React.ReactElement;
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        background: "var(--color-base)",
        padding: "40px 32px",
        minHeight: 220,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <I size={20} style={{ color: "var(--color-accent)" }} />
      <h3 style={{ fontSize: 19, letterSpacing: "-0.005em", fontVariationSettings: '"SOFT" 40' }}>{title}</h3>
      <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function EditorPeek() {
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        background: "var(--color-base)",
        borderRadius: 14,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
      }}
    >
      <div style={{ padding: "40px 40px 48px", borderRight: "1px solid var(--color-border)" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--color-text-muted)",
          }}
        >
          what you see
        </div>
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            marginTop: 12,
            fontVariationSettings: '"SOFT" 70',
          }}
        >
          Postmortem — ingest saturation, Nov&nbsp;4
        </h3>
        <p
          style={{
            fontSize: 14,
            color: "var(--color-text-secondary)",
            marginTop: 14,
            lineHeight: 1.7,
          }}
        >
          At 02:14 UTC we saw queue depth climb past 40k. Retries stacked, the downstream writer started dropping, and
          alerts fired 90 seconds later.
        </p>
        <div
          style={{
            marginTop: 18,
            padding: "14px 16px",
            borderRadius: 8,
            background: "color-mix(in oklab, var(--color-accent) 10%, transparent)",
            border: "1px solid color-mix(in oklab, var(--color-accent) 40%, transparent)",
            display: "flex",
            gap: 12,
          }}
        >
          <span style={{ color: "var(--color-accent)", fontSize: 18, lineHeight: 1 }}>※</span>
          <div>
            <div
              style={{
                fontSize: 12,
                color: "var(--color-accent)",
                fontWeight: 500,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Action item
            </div>
            <div style={{ fontSize: 14, marginTop: 4 }}>Add backpressure shedding on the writer before GA.</div>
          </div>
        </div>
        <div
          style={{
            marginTop: 18,
            background: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: "14px 16px",
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            color: "var(--color-text-secondary)",
            lineHeight: 1.65,
          }}
        >
          <span style={{ color: "var(--color-text-muted)" }}>$</span> kubectl top pods -n ingest <br />
          <span style={{ color: "var(--color-success)" }}>writer-0</span> cpu=
          <span style={{ color: "var(--color-accent)" }}>980m</span> mem=
          <span style={{ color: "var(--color-accent)" }}>1.9Gi</span>
        </div>
      </div>
      <div style={{ padding: "40px 40px 48px", background: "var(--color-surface-elevated)" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--color-text-muted)",
          }}
        >
          what&apos;s on disk
        </div>
        <pre
          style={{
            marginTop: 12,
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            color: "var(--color-text-secondary)",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
          }}
        >
{`# Postmortem — ingest saturation, Nov 4

At 02:14 UTC we saw queue depth climb past 40k.
Retries stacked, the downstream writer started
dropping, and alerts fired 90 seconds later.

> [!action] Add backpressure shedding on the
> writer before GA.

\`\`\`shell
$ kubectl top pods -n ingest
writer-0  cpu=980m  mem=1.9Gi
\`\`\`

Related:: [[RFC-0142]] [[Runbook / Ingest]]
`}
        </pre>
      </div>
    </div>
  );
}

function Comparison() {
  const rows = [
    { feat: "Your data is in", marrow: "Plain Markdown on your disk", others: "A proprietary DB you lease" },
    { feat: "Works offline", marrow: "Yes — local-first sync", others: "Degraded or not at all" },
    { feat: "Hosting", marrow: "Self-host, or Cloud", others: "Cloud only" },
    { feat: 'AI "features"', marrow: "Off by default. BYO key.", others: "Mandatory. Upsold." },
    { feat: "Pricing model", marrow: "Per workspace, not per seat", others: "Per seat, escalating" },
    {
      feat: "When the vendor folds",
      marrow: "You keep the files",
      others: "You keep the zip, good luck",
    },
  ];
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 14, overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1.4fr 1.4fr",
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            fontSize: 13,
            color: "var(--color-text-secondary)",
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Dimension
        </div>
        <div
          style={{
            padding: "18px 24px",
            borderLeft: "1px solid var(--color-border)",
            fontFamily: "var(--font-display)",
            fontSize: 18,
            color: "var(--color-accent)",
          }}
        >
          Marrow
        </div>
        <div
          style={{
            padding: "18px 24px",
            borderLeft: "1px solid var(--color-border)",
            fontFamily: "var(--font-display)",
            fontSize: 18,
            color: "var(--color-text-secondary)",
          }}
        >
          The usual
        </div>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.feat}
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1.4fr 1.4fr",
            borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--color-border)",
          }}
        >
          <div style={{ padding: "20px 24px", fontSize: 14, color: "var(--color-text-secondary)" }}>{r.feat}</div>
          <div
            style={{
              padding: "20px 24px",
              borderLeft: "1px solid var(--color-border)",
              fontSize: 14,
              color: "var(--color-text-primary)",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <IconCheck size={14} style={{ color: "var(--color-accent)", marginTop: 4 }} />
            <span>{r.marrow}</span>
          </div>
          <div
            style={{
              padding: "20px 24px",
              borderLeft: "1px solid var(--color-border)",
              fontSize: 14,
              color: "var(--color-text-muted)",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <IconX size={14} style={{ marginTop: 4 }} />
            <span>{r.others}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TerminalBlock() {
  return (
    <div
      style={{
        background: "var(--color-base)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "10px 14px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface-elevated)",
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-border)" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-border)" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-border)" }} />
        <span
          style={{
            marginLeft: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--color-text-muted)",
          }}
        >
          bash — marrow@prod
        </span>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "22px 22px 24px",
          fontFamily: "var(--font-mono)",
          fontSize: 12.5,
          lineHeight: 1.75,
          color: "var(--color-text-secondary)",
          whiteSpace: "pre-wrap",
        }}
      >
        <span style={{ color: "var(--color-text-muted)" }}>{`# 1. Pull the image`}</span>
        {`
$ docker pull `}
        <span style={{ color: "var(--color-accent)" }}>{`ghcr.io/marrow/marrow:latest`}</span>
        {`

`}
        <span style={{ color: "var(--color-text-muted)" }}>{`# 2. Point at a volume and a Postgres`}</span>
        {`
$ docker run -d \\
    -v `}
        <span style={{ color: "var(--color-accent)" }}>{`./pages`}</span>
        {`:/data \\
    -e DATABASE_URL=`}
        <span style={{ color: "var(--color-accent)" }}>{`$DATABASE_URL`}</span>
        {` \\
    -p 8080:8080 marrow/marrow

`}
        <span style={{ color: "var(--color-success)" }}>{`✓ ready on :8080 — `}</span>
        {`3.4s
`}
      </pre>
    </div>
  );
}
