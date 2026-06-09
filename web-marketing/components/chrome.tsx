"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { MarrowWordmark, SunIcon, MoonIcon } from "./icons";
import { useTheme } from "./theme-provider";

export const APP_URL = "https://app.marrow.so";

const navLinks = [
  { href: "/", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "https://docs.marrow.so", label: "Docs" },
  { href: "https://github.com/spmcgraw/marrow", label: "GitHub" },
];

export function SiteNav() {
  const { theme, toggle } = useTheme();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid var(--color-border)",
        background: "color-mix(in oklab, var(--color-base) 88%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 1.5rem",
          height: "3.5rem",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
        }}
      >
        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "var(--color-text-primary)" }}
        >
          <MarrowWordmark size={19} />
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginLeft: "0.5rem" }}>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                fontSize: "0.875rem",
                color: "var(--color-text-secondary)",
                textDecoration: "none",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        <button
          onClick={toggle}
          aria-label="Toggle theme"
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "2.125rem",
            height: "2.125rem",
            borderRadius: "0.5rem",
            border: "1px solid var(--color-border)",
            background: "transparent",
            cursor: "pointer",
            color: "var(--color-text-secondary)",
          }}
        >
          {theme === "dark" ? <SunIcon size={15} /> : <MoonIcon size={15} />}
        </button>

        <a
          href={APP_URL}
          style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", textDecoration: "none" }}
        >
          Sign in
        </a>
        <a
          href={APP_URL}
          style={{
            fontSize: "0.875rem",
            fontWeight: 500,
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            background: "var(--color-accent)",
            color: "var(--color-accent-ink)",
            textDecoration: "none",
          }}
        >
          Open Marrow
        </a>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--color-border)",
        background: "var(--color-base)",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "2.5rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ color: "var(--color-text-primary)" }}>
          <MarrowWordmark size={18} />
        </div>

        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          {[
            { href: "/pricing", label: "Pricing" },
            { href: "https://docs.marrow.so", label: "Docs" },
            { href: "https://github.com/spmcgraw/marrow", label: "GitHub" },
            { href: "https://github.com/spmcgraw/marrow/blob/main/LICENSE", label: "Apache 2.0" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-text-secondary)",
                textDecoration: "none",
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
          © {new Date().getFullYear()} Marrow
        </p>
      </div>
    </footer>
  );
}

// ─── Shared presentational primitives (ported from handoff chrome.jsx) ───────

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

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  style,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  style?: CSSProperties;
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
  };
  const s: CSSProperties = {
    ...sizes[size],
    ...variants[variant],
    borderRadius: 8,
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    textDecoration: "none",
    cursor: "pointer",
    transition: "transform 120ms, filter 120ms",
    ...style,
  };
  return (
    <a href={href} style={s}>
      {children}
    </a>
  );
}
