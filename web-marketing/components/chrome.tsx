"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { GithubIcon, MarrowWordmark, MoonIcon, SunIcon } from "@/components/icons";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-8 h-8" />;

  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? (
        <SunIcon className="w-4 h-4" />
      ) : (
        <MoonIcon className="w-4 h-4" />
      )}
    </button>
  );
}

const NAV_LINKS = [
  { href: "/product", label: "Product" },
  { href: "/docs", label: "Docs" },
  { href: "https://github.com/spmcgraw/marrow", label: "GitHub", external: true },
];

export function TopNav() {
  return (
    <header
      className="sticky top-0 z-40 border-b border-[var(--border)]"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <MarrowWordmark className="text-lg text-[var(--foreground)]" />
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_LINKS.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5"
              >
                {link.label === "GitHub" && <GithubIcon className="w-4 h-4" />}
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors no-underline"
              >
                {link.label}
              </Link>
            )
          )}
          <div className="w-px h-4 bg-[var(--border)] mx-1" />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] mt-24">
      <div className="max-w-[1440px] mx-auto px-6 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex flex-col gap-1">
          <MarrowWordmark className="text-base text-[var(--foreground)]" />
          <p className="text-sm text-[var(--muted-foreground)]">
            Your knowledge, owned outright.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--muted-foreground)]">
          <Link href="/product" className="hover:text-[var(--foreground)] transition-colors no-underline">
            Product
          </Link>
          <Link href="/docs" className="hover:text-[var(--foreground)] transition-colors no-underline">
            Docs
          </Link>
          <a
            href="https://github.com/spmcgraw/marrow"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--foreground)] transition-colors"
          >
            GitHub
          </a>
          <span className="text-[var(--muted-foreground)]">Apache 2.0</span>
        </div>
      </div>
    </footer>
  );
}
