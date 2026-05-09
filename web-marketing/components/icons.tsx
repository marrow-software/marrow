import type { CSSProperties, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number; style?: CSSProperties };

export const Icon = ({ size = 16, children, style, ...rest }: IconProps & { children: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, ...style }}
    {...rest}
  >
    {children}
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
export const IconX = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);
export const IconArrow = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
export const IconShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
  </Icon>
);
export const IconGit = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="6" r="2" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="12" r="2" />
    <path d="M6 8v8" />
    <path d="M18 10a6 6 0 0 0-6-6H6" />
  </Icon>
);
export const IconServer = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="7" rx="2" />
    <rect x="3" y="14" width="18" height="7" rx="2" />
    <path d="M7 6.5h.01M7 17.5h.01" />
  </Icon>
);
export const IconFeather = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.2 13.8a6 6 0 0 0-8.5-8.5L4 13v7h7z" />
    <path d="M16 8 2 22" />
    <path d="M17.5 15H9" />
  </Icon>
);
export const IconBranch = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3v12" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="6" cy="5" r="2" />
    <circle cx="18" cy="6" r="2" />
    <path d="M18 8v2a4 4 0 0 1-4 4H6" />
  </Icon>
);
export const IconHistory = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3v5h5" />
    <path d="M3.1 13a9 9 0 1 0 2.6-7.8L3 8" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
export const IconHash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
  </Icon>
);
export const IconUsers = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.9" />
    <path d="M16 3.1A4 4 0 0 1 16 11" />
  </Icon>
);

export const MarrowGlyph = ({ size = 24, style }: { size?: number; style?: CSSProperties }) => (
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

export const MarrowWordmark = ({
  size = 22,
  style,
  showGlyph = true,
}: {
  size?: number;
  style?: CSSProperties;
  showGlyph?: boolean;
}) => (
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
