"use client";

// Shared chrome: top tab bar + footer + reusable layout primitives.
// Ported from /tmp/marrow-design/marrow/project/src/chrome.jsx and the
// LandingFooter from src/landing.jsx into a Next.js / TS world.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import type { CSSProperties, ReactNode } from "react";
import { IconMoon, IconSun, MarrowWordmark } from "./icons";

export const TABS = [
  { id: "landing", label: "Landing", href: "/" },
  { id: "product", label: "Product", href: "/product" },
  { id: "pricing", label: "Pricing", href: "/pricing" },
  { id: "app", label: "App UI", href: "/app" },
] as const;

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function TopNav() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

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
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.id}
                href={t.href}
                style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  fontSize: 14,
                  color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  background: active ? "var(--color-surface)" : "transparent",
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
          onClick={() => setTheme(isDark ? "light" : "dark")}
          title={isDark ? "Switch to light" : "Switch to dark"}
          aria-label="Toggle theme"
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
          {isDark ? <IconSun size={15} /> : <IconMoon size={15} />}
        </button>

        <Link href="/app" style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
          Sign in
        </Link>
        <Link
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
        </Link>
      </div>
    </div>
  );
}

const FOOTER_COLS = [
  { h: "Product", links: ["Overview", "Editor", "Search", "Integrations", "Changelog"] },
  { h: "Hosting", links: ["Self-host", "Cloud", "Enterprise", "Status", "Security"] },
  { h: "Resources", links: ["Docs", "API", "Migration guides", "Blog", "Brand"] },
  { h: "Company", links: ["About", "Writing", "Hire us", "Contact"] },
];

export function Footer() {
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
              A self-hosted knowledge base built to last. Made by a small team in Lisbon & Oakland.
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

// ── Layout primitives carried over from chrome.jsx ────────────────────────

export function Placeholder({
  label = "product shot",
  height = 280,
  style,
}: {
  label?: string;
  height?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: 12,
        border: "1px solid var(--color-border)",
        background:
          "repeating-linear-gradient(135deg, color-mix(in oklab, var(--color-surface) 92%, transparent) 0 10px, var(--color-surface) 10px 20px)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--color-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
    </div>
  );
}

export type SectionBg = "base" | "surface" | "cream" | "bone";

export function Section({
  children,
  bg = "base",
  style,
  id,
}: {
  children: ReactNode;
  bg?: SectionBg;
  style?: CSSProperties;
  id?: string;
}) {
  const backgrounds: Record<SectionBg, string> = {
    base: "var(--color-base)",
    surface: "var(--color-surface)",
    cream: "var(--color-cream)",
    bone: "var(--color-bone)",
  };
  return (
    <section
      id={id}
      style={{
        background: backgrounds[bg],
        color: bg === "cream" || bg === "bone" ? "#2b2017" : "var(--color-text-primary)",
        ...style,
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 32px" }}>{children}</div>
    </section>
  );
}

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

type ButtonVariant = "primary" | "secondary" | "ghost" | "creamPrimary" | "creamSecondary";
type ButtonSize = "sm" | "md" | "lg";

export function Button({
  children,
  variant = "primary",
  size = "md",
  onClick,
  style,
  as,
  href,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: (e: React.MouseEvent) => void;
  style?: CSSProperties;
  as?: "a" | "button";
  href?: string;
}) {
  const sizes: Record<ButtonSize, CSSProperties> = {
    sm: { padding: "7px 14px", fontSize: 13 },
    md: { padding: "11px 20px", fontSize: 14 },
    lg: { padding: "14px 24px", fontSize: 15 },
  };
  const variants: Record<ButtonVariant, CSSProperties> = {
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
    creamPrimary: {
      background: "#2b2017",
      color: "var(--color-cream)",
      border: "1px solid #2b2017",
    },
    creamSecondary: {
      background: "transparent",
      color: "#2b2017",
      border: "1px solid #2b2017",
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
    transition: "transform 120ms, filter 120ms",
    ...style,
  };
  if (as === "a") {
    return (
      <a href={href} style={s} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} style={s}>
      {children}
    </button>
  );
}
