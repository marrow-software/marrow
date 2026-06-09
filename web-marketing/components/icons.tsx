import type { CSSProperties, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, style, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      {...props}
    >
      {children}
    </svg>
  );
}

// ─── Existing icon set (kept for pricing / chrome) ──────────────────────────

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <polyline points="6 9 12 15 18 9" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </Icon>
  );
}

// ─── Feather set used by the landing port (verbatim paths from handoff) ──────

export function IconArrow(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function IconX(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

export function IconHash(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </Icon>
  );
}

export function IconShield(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
    </Icon>
  );
}

export function IconGit(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 8v8" />
      <path d="M18 10a6 6 0 0 0-6-6H6" />
    </Icon>
  );
}

export function IconServer(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="7" rx="2" />
      <rect x="3" y="14" width="18" height="7" rx="2" />
      <path d="M7 6.5h.01M7 17.5h.01" />
    </Icon>
  );
}

export function IconFeather(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.2 13.8a6 6 0 0 0-8.5-8.5L4 13v7h7z" />
      <path d="M16 8 2 22" />
      <path d="M17.5 15H9" />
    </Icon>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1A4 4 0 0 1 16 11" />
    </Icon>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 3v5h5" />
      <path d="M3.1 13a9 9 0 1 0 2.6-7.8L3 8" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

export function IconBranch(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3v12" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="6" cy="5" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M18 8v2a4 4 0 0 1-4 4H6" />
    </Icon>
  );
}

// ─── Brand glyph + wordmark (verbatim from handoff icons.jsx) ────────────────

export function MarrowGlyph({ size = 24, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={style} aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 23 V10 L11 10 L16 17 L21 10 L25 10 V23"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="20.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function MarrowWordmark({
  size = 22,
  style,
  showGlyph = true,
}: {
  size?: number;
  style?: CSSProperties;
  showGlyph?: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "currentColor", ...style }}>
      {showGlyph && <MarrowGlyph size={size + 4} />}
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: size,
          fontWeight: 400,
          letterSpacing: "-0.02em",
          fontVariationSettings: '"SOFT" 30, "WONK" 0',
        }}
      >
        marrow
      </span>
    </div>
  );
}
