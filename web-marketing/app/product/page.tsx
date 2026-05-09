import type { Metadata } from "next";
import { SiteNav, SiteFooter, Eyebrow, MarketingButton } from "@/components/chrome";
import {
  IconArrow,
  IconQuote,
  IconCode,
  IconBolt,
  IconPage,
  IconFolder,
  IconLink,
  IconClock,
  IconSearch,
} from "@/components/icons";

export const metadata: Metadata = {
  title: "Product — Marrow",
  description:
    "A product tour of Marrow's four core features: editor, organization, search, and history.",
};

export default function ProductPage() {
  return (
    <div style={{ background: "var(--color-base)", minHeight: "100vh" }}>
      <SiteNav />
      <main>
        <ProductHero />
        <EditorDeepDive />
        <OrganizationSection />
        <SearchSection />
        <HistorySection />
        <IntegrationsStrip />
        <ProductFinalCTA />
      </main>
      <SiteFooter />
    </div>
  );
}

function ProductHero() {
  return (
    <section
      style={{
        background: "var(--color-base)",
        padding: "112px 32px 72px",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
        <Eyebrow>Product tour</Eyebrow>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(44px, 5.5vw, 72px)",
            marginTop: 16,
            lineHeight: 1.02,
            fontVariationSettings: '"SOFT" 80',
            color: "var(--color-text-primary)",
          }}
        >
          Four pieces.
          <br />
          <em
            style={{
              fontStyle: "italic",
              color: "var(--color-accent)",
              fontVariationSettings: '"SOFT" 100, "WONK" 1',
            }}
          >
            One
          </em>{" "}
          small product.
        </h1>
        <p
          style={{
            fontSize: 18,
            color: "var(--color-text-secondary)",
            marginTop: 28,
            maxWidth: 620,
            margin: "28px auto 0",
            lineHeight: 1.6,
          }}
        >
          An editor, an organizer, a search, and a history. Each of them does
          one thing with obvious care. Together they&rsquo;re everything a
          knowledge base should be.
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            marginTop: 36,
          }}
        >
          <MarketingButton variant="primary" size="lg" href="/app">
            Open the editor <IconArrow size={15} />
          </MarketingButton>
          <MarketingButton variant="secondary" size="lg" href="/pricing">
            See pricing
          </MarketingButton>
        </div>
      </div>
    </section>
  );
}

interface SectionShellProps {
  num: string;
  eyebrow: string;
  title: string;
  body: string;
  children: React.ReactNode;
  accent?: boolean;
  reverse?: boolean;
}

function SectionShell({
  num,
  eyebrow,
  title,
  body,
  children,
  accent,
  reverse,
}: SectionShellProps) {
  return (
    <section
      style={{
        padding: "120px 32px",
        borderBottom: "1px solid var(--color-border)",
        background: accent ? "var(--color-surface)" : "var(--color-base)",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: reverse ? "1.2fr 1fr" : "1fr 1.2fr",
            gap: 72,
            alignItems: "center",
          }}
        >
          {!reverse && <div style={{ order: 1 }}>{children}</div>}
          <div style={{ order: reverse ? 1 : 2 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--color-text-muted)",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              {num}
            </div>
            <Eyebrow style={{ marginTop: 12 }}>{eyebrow}</Eyebrow>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 42,
                marginTop: 14,
                fontVariationSettings: '"SOFT" 60',
                lineHeight: 1.08,
                color: "var(--color-text-primary)",
              }}
            >
              {title}
            </h2>
            <p
              style={{
                fontSize: 16,
                color: "var(--color-text-secondary)",
                marginTop: 20,
                lineHeight: 1.7,
                maxWidth: 480,
              }}
            >
              {body}
            </p>
          </div>
          {reverse && <div style={{ order: 2 }}>{children}</div>}
        </div>
      </div>
    </section>
  );
}

function EditorDeepDive() {
  return (
    <SectionShell
      num="01 / The editor"
      eyebrow="Slash commands, wiki-links, plain Markdown"
      title="Type a slash. Type a word. Ship a doc."
      body="A proper block editor with none of the maximalist chrome. 42 block types, keyboard shortcuts for everything, and a file on disk at the end."
    >
      <EditorDemo />
    </SectionShell>
  );
}

function EditorDemo() {
  const slashItems = [
    {
      icon: IconQuote,
      label: "Callout",
      desc: "Highlight an aside",
      active: true,
    },
    { icon: IconCode, label: "Code block", desc: "Syntax highlighted" },
    { icon: IconPage, label: "Canvas embed", desc: "Embed a Marrow canvas" },
    {
      icon: IconBolt,
      label: "Cmd palette",
      desc: "Trigger a shortcut inline",
    },
  ];

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: "28px 32px",
        position: "relative",
      }}
    >
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 24,
          fontVariationSettings: '"SOFT" 70',
          color: "var(--color-text-primary)",
        }}
      >
        Platform migration, week three
      </h3>
      <p
        style={{
          fontSize: 14,
          color: "var(--color-text-secondary)",
          marginTop: 12,
          lineHeight: 1.7,
        }}
      >
        We ran the first write-shadow through prod last night. Latency stayed
        within envelope, but the{" "}
        <span style={{ color: "var(--color-accent)" }}>p99.9 tail</span> did
        its familiar thing around 02:40.
      </p>

      {/* slash menu */}
      <div style={{ marginTop: 18, position: "relative" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--color-text-secondary)",
            background: "var(--color-surface-elevated)",
            borderRadius: 6,
            padding: "8px 12px",
            display: "inline-block",
          }}
        >
          /<span style={{ color: "var(--color-accent)" }}>cal</span>
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: 14,
              background: "var(--color-accent)",
              marginLeft: 2,
              verticalAlign: -2,
            }}
          />
        </div>

        <div
          style={{
            position: "absolute",
            top: 38,
            left: 0,
            width: 300,
            background: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            boxShadow: "0 20px 40px -20px rgba(0,0,0,0.4)",
            padding: 6,
            zIndex: 2,
          }}
        >
          {slashItems.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 6,
                background: item.active
                  ? "color-mix(in oklab, var(--color-accent) 16%, transparent)"
                  : "transparent",
              }}
            >
              <item.icon
                size={14}
                style={{
                  color: item.active
                    ? "var(--color-accent)"
                    : "var(--color-text-secondary)",
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {item.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  {item.desc}
                </div>
              </div>
              {item.active && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--color-text-muted)",
                  }}
                >
                  ↵
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 180 }} />
    </div>
  );
}

function OrganizationSection() {
  return (
    <SectionShell
      reverse
      accent
      num="02 / Organization"
      eyebrow="A tree that knows its edges"
      title="Nest forever. Rename at will. Nothing breaks."
      body="Move a page, rename a page, demote a page — Marrow updates every link that points to it. The bone structure holds."
    >
      <TreeDemo />
    </SectionShell>
  );
}

function TreeDemo() {
  interface RowProps {
    depth?: number;
    icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
    label: string;
    muted?: boolean;
    active?: boolean;
    dragging?: boolean;
    dropTarget?: boolean;
  }

  function Row({
    depth = 0,
    icon: I = IconPage,
    label,
    muted,
    active,
    dragging,
    dropTarget,
  }: RowProps) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 10px",
          paddingLeft: 10 + depth * 16,
          borderRadius: 6,
          fontSize: 13,
          color: active
            ? "var(--color-text-primary)"
            : muted
              ? "var(--color-text-muted)"
              : "var(--color-text-secondary)",
          background: active
            ? "color-mix(in oklab, var(--color-accent) 14%, transparent)"
            : dropTarget
              ? "color-mix(in oklab, var(--color-accent) 8%, transparent)"
              : "transparent",
          border: dropTarget
            ? "1px dashed var(--color-accent)"
            : "1px solid transparent",
          opacity: dragging ? 0.5 : 1,
        }}
      >
        <I
          size={13}
          style={{
            color: active ? "var(--color-accent)" : "var(--color-text-muted)",
          }}
        />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--color-base)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: "18px 14px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--color-text-muted)",
          padding: "6px 10px 12px",
        }}
      >
        Engineering
      </div>
      <Row icon={IconFolder} label="Runbooks" />
      <Row depth={1} label="Ingest — on-call" />
      <Row depth={1} label="Postgres failover" />
      <Row icon={IconFolder} label="Architecture" active />
      <Row depth={1} label="RFC-0141 — Write path" />
      <Row depth={1} label="RFC-0142 — Ingest v2" dragging />
      <Row depth={1} label="Q2 planning" dropTarget />
      <Row depth={1} label="Postmortems" muted />
      <Row depth={2} label="2025-11-04 · saturation" />
      <Row icon={IconFolder} label="Onboarding" />
      <div
        style={{
          padding: "12px 10px 4px",
          borderTop: "1px solid var(--color-border)",
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--color-accent)",
        }}
      >
        <IconLink size={11} /> 4 backlinks updated automatically
      </div>
    </div>
  );
}

function SearchSection() {
  const results = [
    {
      title: "RFC-0142 — Ingest v2",
      path: "engineering / architecture",
      snip: "Adds <em>backpressure</em> shedding at the writer boundary…",
      active: true,
    },
    {
      title: "Postmortem 2025-11-04",
      path: "engineering / postmortems",
      snip: "Saturation caused by absent <em>backpressure</em>…",
    },
    {
      title: "Runbook / Ingest on-call",
      path: "engineering / runbooks",
      snip: "Step 3 — verify <em>backpressure</em> signal reaches the writer…",
    },
  ];

  return (
    <SectionShell
      num="03 / Search"
      eyebrow="Cmd+K is the navigation"
      title="One field. Everything in it."
      body="Full-text across pages, attachments, comments, and revisions. Ranked by what you've touched lately, not by who pays for placement."
    >
      <div
        style={{
          background: "var(--color-surface-elevated)",
          border: "1px solid var(--color-border)",
          borderRadius: 14,
          padding: 6,
          width: "100%",
          maxWidth: 560,
          boxShadow: "0 30px 60px -30px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <IconSearch size={16} style={{ color: "var(--color-text-muted)" }} />
          <span
            style={{ fontSize: 15, color: "var(--color-text-primary)" }}
          >
            backpressure
          </span>
          <span
            style={{
              width: 2,
              height: 16,
              background: "var(--color-accent)",
            }}
          />
          <span style={{ flex: 1 }} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--color-text-muted)",
            }}
          >
            8 results · 12ms
          </span>
        </div>

        <div style={{ padding: 6 }}>
          {results.map((r, i) => (
            <div
              key={i}
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                background: r.active
                  ? "color-mix(in oklab, var(--color-accent) 12%, transparent)"
                  : "transparent",
                marginBottom: 2,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <IconPage
                  size={13}
                  style={{
                    color: r.active
                      ? "var(--color-accent)"
                      : "var(--color-text-muted)",
                  }}
                />
                <span
                  style={{
                    fontSize: 14,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {r.title}
                </span>
                <span style={{ flex: 1 }} />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--color-text-muted)",
                  }}
                >
                  {r.path}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                  marginTop: 6,
                  lineHeight: 1.55,
                  paddingLeft: 21,
                }}
                dangerouslySetInnerHTML={{
                  __html: r.snip
                    .replace(
                      /<em>/g,
                      '<em style="font-style:normal;color:var(--color-accent);background:color-mix(in oklab, var(--color-accent) 20%, transparent);padding:0 3px;border-radius:3px">'
                    )
                    .replace(/<\/em>/g, "</em>"),
                }}
              />
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            padding: "10px 16px",
            borderTop: "1px solid var(--color-border)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--color-text-muted)",
          }}
        >
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>⌘↵ open in pane</span>
          <span style={{ marginLeft: "auto" }}>esc</span>
        </div>
      </div>
    </SectionShell>
  );
}

function HistorySection() {
  return (
    <SectionShell
      reverse
      accent
      num="04 / History"
      eyebrow="Every keystroke, diffable"
      title="Go back. Not far, not much, just enough."
      body="A quiet autosave every ten seconds. Named checkpoints when you publish. Side-by-side diffs when you need to know what you broke."
    >
      <div
        style={{
          background: "var(--color-base)",
          border: "1px solid var(--color-border)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div
          style={{ display: "flex", borderBottom: "1px solid var(--color-border)" }}
        >
          <div
            style={{
              flex: 1,
              padding: "10px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--color-text-muted)",
              borderRight: "1px solid var(--color-border)",
            }}
          >
            <IconClock size={11} style={{ verticalAlign: -1, marginRight: 6 }} />
            Nov 04 · 02:41 · Maya
          </div>
          <div
            style={{
              flex: 1,
              padding: "10px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--color-accent)",
            }}
          >
            <IconClock size={11} style={{ verticalAlign: -1, marginRight: 6 }} />
            Nov 04 · 09:12 · Maya · current
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <div
            style={{
              padding: "20px 22px",
              borderRight: "1px solid var(--color-border)",
              fontSize: 13,
              lineHeight: 1.7,
              color: "var(--color-text-secondary)",
            }}
          >
            <span
              style={{
                background: "color-mix(in oklab, #dc2626 22%, transparent)",
                padding: "2px 4px",
                borderRadius: 3,
              }}
            >
              Queue depth climbed past 40k
            </span>
            . Retries stacked, the writer dropped. Alerts fired after 90s.
          </div>
          <div
            style={{
              padding: "20px 22px",
              fontSize: 13,
              lineHeight: 1.7,
              color: "var(--color-text-secondary)",
            }}
          >
            <span
              style={{
                background: "color-mix(in oklab, #34d399 22%, transparent)",
                padding: "2px 4px",
                borderRadius: 3,
              }}
            >
              Queue depth climbed past 40k at 02:14 UTC
            </span>
            . Retries stacked, the writer started dropping, alerts fired 90
            seconds later.
          </div>
        </div>

        <div
          style={{
            padding: "14px 18px",
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            display: "flex",
            gap: 20,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--color-text-muted)",
          }}
        >
          <span>+12 words</span>
          <span>-3 words</span>
          <span style={{ color: "var(--color-accent)" }}>revert to left</span>
        </div>
      </div>
    </SectionShell>
  );
}

function IntegrationsStrip() {
  const items = [
    "Slack",
    "GitHub",
    "Linear",
    "Notion import",
    "Confluence import",
    "Obsidian vault",
    "Google SSO",
    "Okta",
    "S3 backups",
    "Webhooks",
    "REST API",
    "CLI",
  ];

  return (
    <section
      style={{ padding: "96px 32px", background: "var(--color-base)" }}
    >
      <div
        style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}
      >
        <Eyebrow>Integrations</Eyebrow>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 36,
            marginTop: 12,
            fontVariationSettings: '"SOFT" 60',
            color: "var(--color-text-primary)",
          }}
        >
          Speaks the protocols you already run.
        </h2>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "center",
            marginTop: 40,
          }}
        >
          {items.map((item) => (
            <span
              key={item}
              style={{
                padding: "10px 18px",
                border: "1px solid var(--color-border)",
                borderRadius: 999,
                fontSize: 13,
                color: "var(--color-text-secondary)",
                background: "var(--color-surface)",
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductFinalCTA() {
  return (
    <section
      style={{
        background: "var(--color-cream)",
        color: "#2b2017",
        padding: "112px 32px",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(36px, 5vw, 56px)",
            fontVariationSettings: '"SOFT" 80',
            lineHeight: 1.05,
            color: "#2b2017",
          }}
        >
          See it running.{" "}
          <em
            style={{
              color: "#9a3412",
              fontStyle: "italic",
              fontVariationSettings: '"SOFT" 100, "WONK" 1',
            }}
          >
            Right now.
          </em>
        </h2>
        <p
          style={{
            fontSize: 17,
            marginTop: 24,
            color: "#4a3a2c",
            maxWidth: 540,
            margin: "24px auto 0",
          }}
        >
          The full app ships preloaded with sample content. No account, no
          download, no waiting.
        </p>
        <div
          style={{
            marginTop: 36,
            display: "flex",
            gap: 12,
            justifyContent: "center",
          }}
        >
          <MarketingButton variant="creamPrimary" size="lg" href="/app">
            Open the demo <IconArrow size={15} />
          </MarketingButton>
          <MarketingButton variant="creamSecondary" size="lg" href="/pricing">
            See pricing
          </MarketingButton>
        </div>
      </div>
    </section>
  );
}
