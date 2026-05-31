"use client";

import Link from "next/link";
import { useState } from "react";
import { MarrowWordmark, MarrowGlyph, SunIcon, MoonIcon, MenuIcon } from "./icons";
import { useTheme } from "./theme-provider";

const navLinks = [
  { href: "/", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "https://docs.marrow.so", label: "Docs" },
  { href: "https://github.com/spmcgraw/marrow", label: "GitHub" },
];

export function SiteNav() {
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid var(--color-border)",
        backgroundColor: "var(--color-base)",
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
          justifyContent: "space-between",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
          <MarrowGlyph size={28} />
          <MarrowWordmark />
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: "1.75rem" }}>
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

          <button
            onClick={toggle}
            aria-label="Toggle theme"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2rem",
              height: "2rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--color-border)",
              background: "transparent",
              cursor: "pointer",
              color: "var(--color-text-secondary)",
            }}
          >
            {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </button>

          <Link
            href="https://github.com/spmcgraw/marrow"
            style={{
              fontSize: "0.875rem",
              fontWeight: 500,
              padding: "0.4rem 0.875rem",
              borderRadius: "0.375rem",
              backgroundColor: "var(--color-accent)",
              color: theme === "dark" ? "#111318" : "#ffffff",
              textDecoration: "none",
            }}
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--color-border)",
        backgroundColor: "var(--color-base)",
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <MarrowGlyph size={20} />
          <MarrowWordmark />
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
