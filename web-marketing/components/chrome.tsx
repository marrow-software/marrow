import * as React from "react";
import Link from "next/link";
import { Wordmark } from "./wordmark";
import { IconGithub } from "./icons";

const NAV_LINKS = [
  { href: "/product", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
];

const FOOTER_PRODUCT = [
  { href: "/product", label: "Product tour" },
  { href: "/pricing", label: "Pricing" },
  { href: "/changelog", label: "Changelog" },
];

const FOOTER_DEVELOPERS = [
  { href: "/docs", label: "Documentation" },
  { href: "/docs/install", label: "Self-host guide" },
  {
    href: "https://github.com/spmcgraw/marrow",
    label: "GitHub",
    external: true,
  },
];

const FOOTER_COMPANY = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--background)_85%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Wordmark href="/" />
        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="https://github.com/spmcgraw/marrow"
            aria-label="Marrow on GitHub"
            className="hidden h-9 w-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] sm:inline-flex"
          >
            <IconGithub size={18} />
          </Link>
          <Link
            href="https://app.marrow.so"
            className="hidden h-9 items-center rounded-md px-3 text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/docs/install"
            className="inline-flex h-9 items-center rounded-md bg-[var(--primary)] px-3.5 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
          >
            Deploy On-prem
          </Link>
        </div>
      </div>
    </header>
  );
}

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: { href: string; label: string; external?: boolean }[];
}) {
  return (
    <div>
      <h4
        className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {heading}
      </h4>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-[var(--foreground)]/80 transition-colors hover:text-[var(--foreground)]"
              {...(link.external
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-[var(--border)] bg-[var(--card)]">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="space-y-4">
            <Wordmark />
            <p className="max-w-xs text-sm text-[var(--muted-foreground)]">
              A self-hosted, open-source knowledge base with an iron-clad
              restore guarantee. Your knowledge, owned outright.
            </p>
          </div>
          <FooterColumn heading="Product" links={FOOTER_PRODUCT} />
          <FooterColumn heading="Developers" links={FOOTER_DEVELOPERS} />
          <FooterColumn heading="Company" links={FOOTER_COMPANY} />
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-[var(--border)] pt-6 text-xs text-[var(--muted-foreground)] sm:flex-row sm:items-center">
          <p style={{ fontFamily: "var(--font-mono)" }}>
            © {new Date().getFullYear()} Marrow · Apache 2.0
          </p>
          <p style={{ fontFamily: "var(--font-mono)" }}>
            Built on Postgres. No telemetry by default.
          </p>
        </div>
      </div>
    </footer>
  );
}

/**
 * Page shell — wraps content with the shared top nav and footer.
 * Phase B pages (Landing / Product / Pricing) all render through this.
 */
export function Chrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
