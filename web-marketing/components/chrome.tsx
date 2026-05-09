"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MarrowWordmark, IconMoon, IconSun } from "@/components/icons";
import { useTheme } from "@/components/theme-provider";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/pricing", label: "Pricing" },
];

const FOOTER_COLS = [
  { h: "Product", links: ["Overview", "Editor", "Search", "Integrations", "Changelog"] },
  { h: "Hosting", links: ["Self-host", "Cloud", "Enterprise", "Status", "Security"] },
  { h: "Resources", links: ["Docs", "API", "Migration guides", "Blog", "Brand"] },
  { h: "Company", links: ["About", "Writing", "Hire us", "Contact"] },
];

export function SiteNav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "color-mix(in oklab, var(--color-base) 88%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "14px 32px",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--color-text-primary)" }}
        >
          <MarrowWordmark size={19} />
        </Link>

        <nav style={{ display: "flex", gap: 2, marginLeft: 8 }}>
          {NAV_LINKS.map((t) => {
            const isActive = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  fontSize: 14,
                  color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  background: isActive ? "var(--color-surface)" : "transparent",
                  transition: "background 120ms, color 120ms",
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        <button
          onClick={toggle}
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
          }}
        >
          {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
        </button>

        <a
          href="/login"
          style={{ fontSize: 14, color: "var(--color-text-secondary)" }}
        >
          Sign in
        </a>
        <a
          href="/app"
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            background: "var(--color-accent)",
            color: "var(--color-accent-ink)",
          }}
        >
          Open Marrow
        </a>
      </div>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer
      style={{
        background: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
        padding: "72px 32px 40px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr repeat(4, 1fr)",
            gap: 48,
          }}
        >
          <div>
            <MarrowWordmark size={22} />
            <p
              style={{
                fontSize: 13,
                color: "var(--color-text-secondary)",
                marginTop: 18,
                maxWidth: 280,
                lineHeight: 1.7,
              }}
            >
              A self-hosted knowledge base built to last. Made by a small team in Lisbon &amp; Oakland.
            </p>
          </div>
          {FOOTER_COLS.map((c) => (
            <div key={c.h}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--color-text-muted)",
                }}
              >
                {c.h}
              </div>
              <ul
                style={{
                  padding: 0,
                  margin: "16px 0 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {c.links.map((l) => (
                  <li key={l}>
                    <a href="#" style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 56,
            paddingTop: 24,
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: "var(--color-text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span>© 2026 Marrow Labs · MIT licensed</span>
          <span>v0.1.0</span>
        </div>
      </div>
    </footer>
  );
}
