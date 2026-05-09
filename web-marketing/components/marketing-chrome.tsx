// Minimal marketing header + footer. Will be replaced by the shared chrome
// landing in #95; kept self-contained so this page renders standalone in the
// meantime.
import type { CSSProperties, ReactNode } from "react";
import { MarrowWordmark } from "./icons";

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--color-accent)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  href?: string;
  style?: CSSProperties;
};

export function Button({ children, variant = "primary", size = "md", href, style }: ButtonProps) {
  const sizes: Record<string, CSSProperties> = {
    sm: { padding: "7px 14px", fontSize: 13 },
    md: { padding: "11px 20px", fontSize: 14 },
    lg: { padding: "14px 24px", fontSize: 15 },
  };
  const variants: Record<string, CSSProperties> = {
    primary: {
      background: "var(--color-accent)",
      color: "var(--color-accent-ink)",
      border: "1px solid var(--color-accent)",
    },
    secondary: {
      background: "transparent",
      color: "var(--color-text-primary)",
      border: "1px solid var(--color-border)",
    },
    ghost: {
      background: "transparent",
      color: "var(--color-text-primary)",
      border: "1px solid transparent",
    },
  };
  const s: CSSProperties = {
    ...sizes[size],
    ...variants[variant],
    borderRadius: 8,
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    ...style,
  };
  if (href) return <a href={href} style={s}>{children}</a>;
  return <button style={s}>{children}</button>;
}

export function MarketingHeader() {
  return (
    <header
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
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--color-text-primary)" }}>
          <MarrowWordmark size={19} />
        </a>
        <nav style={{ display: "flex", gap: 2, marginLeft: 8 }}>
          {[
            { id: "product", label: "Product", href: "/product" },
            { id: "pricing", label: "Pricing", href: "/pricing" },
            { id: "docs", label: "Docs", href: "/docs" },
          ].map((t) => (
            <a
              key={t.id}
              href={t.href}
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                fontSize: 14,
                color: "var(--color-text-secondary)",
              }}
            >
              {t.label}
            </a>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <a href="/app" style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
          Sign in
        </a>
        <a
          href="/docs/install"
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            background: "var(--color-accent)",
            color: "var(--color-accent-ink)",
          }}
        >
          Deploy On-prem
        </a>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  const cols = [
    { h: "Product", links: ["Overview", "Editor", "Search", "Integrations", "Changelog"] },
    { h: "Hosting", links: ["Self-host", "Cloud", "Enterprise", "Status", "Security"] },
    { h: "Resources", links: ["Docs", "API", "Migration guides", "Blog", "Brand"] },
    { h: "Company", links: ["About", "Writing", "Hire us", "Contact"] },
  ];
  return (
    <footer
      style={{
        background: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
        padding: "72px 32px 40px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr repeat(4, 1fr)", gap: 48 }}>
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
          {cols.map((c) => (
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
                  listStyle: "none",
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
          <span>v2.4.1 — released Apr 14</span>
        </div>
      </div>
    </footer>
  );
}
