"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { MarrowWordmark, IconSun, IconMoon } from "@/components/icons";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/product", label: "Product" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteNav() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

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
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "var(--color-text-primary)",
          }}
        >
          <MarrowWordmark size={19} />
        </Link>

        <nav style={{ display: "flex", gap: 2, marginLeft: 8 }}>
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  fontSize: 14,
                  color: active
                    ? "var(--color-text-primary)"
                    : "var(--color-text-secondary)",
                  background: active ? "var(--color-surface)" : "transparent",
                  transition: "background 120ms, color 120ms",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
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
            background: "transparent",
            cursor: "pointer",
          }}
        >
          {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
        </button>

        <Link
          href="/login"
          style={{
            fontSize: 14,
            color: "var(--color-text-secondary)",
          }}
        >
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
            display: "inline-block",
          }}
        >
          Open Marrow
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--color-border)",
        padding: "48px 32px",
        background: "var(--color-base)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <MarrowWordmark size={16} />
        <div
          style={{
            display: "flex",
            gap: 24,
            fontSize: 13,
            color: "var(--color-text-muted)",
          }}
        >
          <Link href="/product">Product</Link>
          <Link href="/pricing">Pricing</Link>
          <a
            href="https://github.com/spmcgraw/marrow"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <Link href="/docs">Docs</Link>
        </div>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Apache 2.0 · Self-hosted
        </span>
      </div>
    </footer>
  );
}

export function Eyebrow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
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

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "creamPrimary"
  | "creamSecondary";
type ButtonSize = "sm" | "md" | "lg";

const SIZES: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: "7px 14px", fontSize: 13 },
  md: { padding: "11px 20px", fontSize: 14 },
  lg: { padding: "14px 24px", fontSize: 15 },
};

const VARIANTS: Record<ButtonVariant, React.CSSProperties> = {
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

export function MarketingButton({
  children,
  variant = "primary",
  size = "md",
  onClick,
  href,
  style,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: () => void;
  href?: string;
  style?: React.CSSProperties;
}) {
  const buttonStyle: React.CSSProperties = {
    ...SIZES[size],
    ...VARIANTS[variant],
    borderRadius: 8,
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    transition: "transform 120ms, filter 120ms",
    ...style,
  };

  if (href) {
    return (
      <Link href={href} style={buttonStyle}>
        {children}
      </Link>
    );
  }

  return (
    <button onClick={onClick} style={buttonStyle}>
      {children}
    </button>
  );
}
