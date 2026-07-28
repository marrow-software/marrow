// Landing page — editorial marketing surface, ported from the Claude design
// handoff (references/design-handoff/project/src/landing.jsx). The prototype's
// onNavigate(tab) tab-switching is adapted to real routes: the app lives at
// APP_URL, pricing at /pricing, docs at docs.marrow.so.

import type { ComponentType, CSSProperties } from "react";
import { APP_URL, Button, Eyebrow, SELF_HOST_DOCS_URL } from "@/components/chrome";
import {
  CheckIcon,
  IconArrow,
  IconBranch,
  IconGit,
  IconHash,
  IconHistory,
  IconServer,
  IconShield,
  IconUsers,
  IconFeather,
  IconX,
} from "@/components/icons";

export function Landing() {
  return (
    <div>
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
                Marrow is a quiet, self-hosted knowledge base — a restore guarantee you can audit,
                an export bundle you can read by hand, and no vendor lock-in.
              </p>
              <div style={{ display: "flex", gap: 12, marginTop: 36 }}>
                <Button variant="primary" size="lg" href={SELF_HOST_DOCS_URL}>
                  <IconServer size={15} /> Self-host with Docker
                </Button>
                <Button variant="secondary" size="lg" href={APP_URL}>
                  Try Marrow Cloud <IconArrow size={15} />
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
                  flexWrap: "wrap",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <IconGit size={14} /> Apache 2.0
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
            Your notes shouldn&apos;t vanish when a vendor changes the rules.{" "}
            <span style={{ color: "var(--color-accent)" }}>
              Marrow exports to files you own — the part that&nbsp;stays.
            </span>
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
            <p style={{ fontSize: 17, color: "var(--color-text-secondary)", maxWidth: 520, alignSelf: "end" }}>
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
            <p style={{ fontSize: 16, color: "var(--color-text-secondary)", marginTop: 20, maxWidth: 620 }}>
              Slash commands, wiki-links, drag-to-reorder blocks. Every save is versioned, and every page exports
              to a flat .md file.
            </p>
          </div>
          <EditorPeek />
        </div>
      </section>

      {/* COMPARISON */}
      <section style={{ background: "var(--color-base)", padding: "112px 32px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <Eyebrow>Different from the usual suspects</Eyebrow>
          <h2 style={{ fontSize: 40, marginTop: 12, marginBottom: 48, fontVariationSettings: '"SOFT" 60' }}>
            What you&apos;re trading, and what you&apos;re&nbsp;not.
          </h2>
          <Comparison />
        </div>
      </section>

      {/* SELF-HOST */}
      <section style={{ background: "var(--color-surface)", padding: "112px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
            <div>
              <Eyebrow>Self-host</Eyebrow>
              <h2 style={{ fontSize: 40, marginTop: 12, fontVariationSettings: '"SOFT" 60' }}>
                One compose file.
                <br />
                Done.
              </h2>
              <p style={{ fontSize: 16, color: "var(--color-text-secondary)", marginTop: 20, maxWidth: 500 }}>
                One Docker Compose file brings up three services: the API image, the web image, and a Postgres
                database. Pages and history live in Postgres; attachments on the filesystem or S3/R2. Back it up
                by backing up the database and attachment store.
              </p>
              <div style={{ marginTop: 32, display: "flex", gap: 12 }}>
                <Button variant="primary" href={SELF_HOST_DOCS_URL}>
                  <IconServer size={14} /> Deploy on-prem
                </Button>
              </div>
            </div>
            <TerminalBlock />
          </div>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section
        style={{
          background: "var(--color-surface)",
          color: "var(--color-text-primary)",
          padding: "112px 32px",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <Eyebrow>Why Marrow</Eyebrow>
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
            Your knowledge base should outlive any vendor. Marrow exports to plain Markdown and JSON, and every
            bundle restores your workspace content with full fidelity &mdash; so your docs stay{" "}
            <em style={{ color: "var(--color-accent)", fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>
              yours
            </em>
            , wherever you run it.
          </blockquote>
          <p style={{ fontSize: 15, color: "var(--color-text-secondary)", marginTop: 24, maxWidth: 620 }}>
            &ldquo;Workspace content&rdquo; means the node tree, revisions, attachments, properties, and links a
            bundle carries. Comments, share links, and folder views are slated for a later bundle version.{" "}
            <a
              href="https://docs.marrow.so/concepts/restore-guarantee/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--color-accent)", textDecoration: "underline" }}
            >
              See exactly what round-trips
            </a>
            .
          </p>
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
          <h2 style={{ fontSize: "clamp(36px, 5vw, 60px)", lineHeight: 1.05, fontVariationSettings: '"SOFT" 80' }}>
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
            <Button variant="primary" size="lg" href={SELF_HOST_DOCS_URL}>
              <IconServer size={15} /> Self-host with Docker
            </Button>
            <Button variant="secondary" size="lg" href={APP_URL}>
              Try Marrow Cloud <IconArrow size={15} />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* --- HERO product peek: a compact, stylized editor tile --- */
function HeroProductPeek() {
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
            {[
              { l: "A", c: "#8a5a3a" },
              { l: "S", c: "#3a6b4a" },
              { l: "L", c: "#4a6b8a" },
            ].map((a, i) => (
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
            {[
              { t: "Runbooks", active: false },
              { t: "Architecture", active: false },
              { t: "— RFCs", active: false },
              { t: "— Q2 planning", active: true },
              { t: "— Postmortems", active: false },
              { t: "Onboarding", active: false },
            ].map((r, i) => (
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
              <span style={{ color: "#e8805c", borderBottom: "1px dashed #e8805c" }}>p99 tail</span>, and paying
              down the <span style={{ color: "#e8805c", borderBottom: "1px dashed #e8805c" }}>ingest backpressure</span>{" "}
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
                <CheckIcon size={9} style={{ color: "#34d399" }} />
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
          Onboarding / Week 1<br />
          RFC-0142 — Ingest v2<br />
          Postmortem 2025-11-04
        </div>
      </div>
    </div>
  );
}

type Feature = {
  icon: ComponentType<{ size?: number; style?: CSSProperties }>;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: IconFeather,
    title: "Block editor, by the book",
    body: "Slash commands, wiki-links, tables, callouts, code. Nothing you haven't seen — everything done well.",
  },
  {
    icon: IconBranch,
    title: "Backlinks that mean something",
    body: "Every page knows what links to it — the backlink index is rebuilt on every save.",
  },
  {
    icon: IconHistory,
    title: "Every save versioned",
    body: "Append-only history: every save is a new revision you can roll back to.",
  },
  {
    icon: IconHash,
    title: "Cmd+K, and that's it",
    body: "Search is the navigation. Page names, bodies, and properties — one field, one answer, anywhere in a workspace.",
  },
  {
    icon: IconServer,
    title: "Your data, yours to take",
    body: "Pages and history live in Postgres, attachments on disk or S3/R2 — and any workspace exports to a readable Markdown + JSON zip.",
  },
  {
    icon: IconUsers,
    title: "Comment, don't co-write",
    body: "Threads, not cursors. For the 95% of docs that aren't meant to be live-edited.",
  },
];

function FeatureCell({ icon: I, title, body }: Feature) {
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
      {/* writing side */}
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
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 28, marginTop: 12, fontVariationSettings: '"SOFT" 70' }}>
          Postmortem — ingest saturation, Nov&nbsp;4
        </h3>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginTop: 14, lineHeight: 1.7 }}>
          At 02:14 UTC we saw queue depth climb past 40k. Retries stacked, the downstream writer started dropping,
          and alerts fired 90 seconds later.
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
      {/* markdown side */}
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
    { feat: "Your data is in", marrow: "Postgres you run, plus a readable export bundle", others: "A proprietary DB you lease" },
    { feat: "Hosting", marrow: "Self-host, or Cloud", others: "Cloud only" },
    { feat: "Built-in AI", marrow: "None — just your words", others: "Mandatory. Upsold." },
    { feat: "Pricing model", marrow: "Per org, with a seat allowance", others: "Per seat, escalating" },
    { feat: "When the vendor folds", marrow: "You keep the files", others: "You keep the zip, good luck" },
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
            <CheckIcon size={14} style={{ color: "var(--color-accent)", marginTop: 4 }} />
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
        <span style={{ marginLeft: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-muted)" }}>
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
        <span style={{ color: "var(--color-text-muted)" }}>{`# 1. Pull the API image`}</span>
        {`
$ docker pull `}
        <span style={{ color: "var(--color-accent)" }}>{`ghcr.io/marrow-software/marrow-api:latest`}</span>
        {`

`}
        <span style={{ color: "var(--color-text-muted)" }}>{`# 2. Configure and bring up the stack (db + api + web)`}</span>
        {`
$ cp .env.prod.example .env   `}
        <span style={{ color: "var(--color-text-muted)" }}>{`# set POSTGRES_PASSWORD, SECRET_KEY, …`}</span>
        {`
$ docker compose -f docker-compose.prod.yml up -d

`}
        <span style={{ color: "var(--color-success)" }}>{`✓ api on :8000  ✓ web on :3000`}</span>
        {`
`}
      </pre>
    </div>
  );
}
