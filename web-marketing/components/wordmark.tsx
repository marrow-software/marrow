import * as React from "react";
import Link from "next/link";

type WordmarkProps = {
  className?: string;
  size?: number;
  href?: string;
};

/**
 * Marrow wordmark. Renders the brand name in Fraunces with a high SOFT axis
 * setting for the editorial display feel called out in design-tokens.md.
 */
export function Wordmark({ className = "", size = 22, href }: WordmarkProps) {
  const mark = (
    <span
      className={`inline-flex items-baseline font-[var(--font-heading)] tracking-tight ${className}`}
      style={{
        fontFamily: "var(--font-heading)",
        fontSize: size,
        fontWeight: 500,
        fontVariationSettings: '"SOFT" 70, "opsz" 144',
        color: "var(--foreground)",
      }}
    >
      <span>marr</span>
      <span style={{ color: "var(--color-accent-brand)" }}>o</span>
      <span>w</span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} aria-label="Marrow home" className="inline-flex">
        {mark}
      </Link>
    );
  }
  return mark;
}
