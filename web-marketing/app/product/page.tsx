import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "@/components/chrome";
import {
  EditorDemo,
  OrganizationDemo,
  SearchDemo,
  HistoryDemo,
} from "@/components/product-demos";

export const metadata: Metadata = {
  title: "Product — Marrow",
  description:
    "A tour of Marrow's core features: editor, organization, search, and history.",
};

const SECTIONS = [
  {
    id: "editor",
    label: "Editor",
    heading: "Write without friction.",
    body: "A block-based editor that stays out of the way. Markdown shortcuts, code blocks with syntax highlighting, tables, and inline @mentions — all auto-saved as you type.",
    demo: EditorDemo,
  },
  {
    id: "organization",
    label: "Organization",
    heading: "Structure that scales.",
    body: "Workspaces, spaces, and a self-referential node tree. Folders nest as deep as you need; pages live anywhere in the hierarchy. Role-based access — owner, editor, viewer — keeps the right people on the right content.",
    demo: OrganizationDemo,
  },
  {
    id: "search",
    label: "Search",
    heading: "Find it in a keystroke.",
    body: "Full-text search across every page in a workspace. Hit Cmd+K anywhere, start typing, and land on the right page — with a ranked snippet so you know you're in the right place before you click.",
    demo: SearchDemo,
  },
  {
    id: "history",
    label: "History",
    heading: "Every save, forever.",
    body: "Revisions are append-only by design — nothing is ever overwritten. Browse the full history of any page, restore a previous version, or export the entire revision chain. Your notes do not disappear.",
    demo: HistoryDemo,
  },
] as const;

export default function ProductPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-[1440px] mx-auto px-6 pt-20 pb-16 text-center">
          <p
            className="text-sm font-medium tracking-widest uppercase mb-4"
            style={{ color: "var(--color-accent)" }}
          >
            Product tour
          </p>
          <h1
            className="text-5xl sm:text-6xl leading-[1.1] mb-6"
            style={{
              fontFamily: "var(--font-heading)",
              fontVariationSettings: "'SOFT' 60, 'wght' 700",
              color: "var(--foreground)",
            }}
          >
            Everything your notes need.
            <br />
            Nothing they don&apos;t.
          </h1>
          <p
            className="text-lg max-w-xl mx-auto"
            style={{ color: "var(--muted-foreground)" }}
          >
            Marrow is a self-hosted knowledge base built around a single promise: your
            export bundle is always restorable to an exact replica of your workspace.
          </p>
        </section>

        {/* Feature sections */}
        {SECTIONS.map((section, i) => {
          const Demo = section.demo;
          const isEven = i % 2 === 0;
          return (
            <section
              key={section.id}
              id={section.id}
              className="max-w-[1440px] mx-auto px-6 py-16"
            >
              <div
                className={`flex flex-col ${isEven ? "lg:flex-row" : "lg:flex-row-reverse"} gap-12 lg:gap-16 items-center`}
              >
                {/* Copy */}
                <div className="flex-1 max-w-md">
                  <p
                    className="text-xs font-semibold tracking-widest uppercase mb-3"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {section.label}
                  </p>
                  <h2
                    className="text-3xl sm:text-4xl mb-4 leading-[1.15]"
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontVariationSettings: "'SOFT' 40, 'wght' 600",
                      color: "var(--foreground)",
                    }}
                  >
                    {section.heading}
                  </h2>
                  <p className="text-base leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                    {section.body}
                  </p>
                </div>

                {/* Demo */}
                <div className="flex-1 w-full max-w-2xl">
                  <Demo />
                </div>
              </div>

              {/* Divider between sections */}
              {i < SECTIONS.length - 1 && (
                <div
                  className="mt-16 border-t"
                  style={{ borderColor: "var(--border)" }}
                />
              )}
            </section>
          );
        })}

        {/* CTA */}
        <section
          className="py-20 mt-8"
          style={{ backgroundColor: "var(--card)" }}
        >
          <div className="max-w-[1440px] mx-auto px-6 text-center">
            <h2
              className="text-3xl sm:text-4xl mb-4"
              style={{
                fontFamily: "var(--font-heading)",
                fontVariationSettings: "'SOFT' 40, 'wght' 600",
                color: "var(--foreground)",
              }}
            >
              Self-host in minutes.
            </h2>
            <p
              className="text-base mb-8 max-w-sm mx-auto"
              style={{ color: "var(--muted-foreground)" }}
            >
              Docker Compose, a database, and you&apos;re running. No vendor lock-in,
              no usage limits, no surprises.
            </p>
            <a
              href="https://github.com/spmcgraw/marrow"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-accent-ink)",
              }}
            >
              Get started on GitHub
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
