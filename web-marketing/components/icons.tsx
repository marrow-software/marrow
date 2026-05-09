// Icon primitives — feather-style, 1.6px stroke. Ported from
// /tmp/marrow-design/marrow/project/src/icons.jsx into TS/React.
import type { CSSProperties, ReactNode, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  style?: CSSProperties;
  children?: ReactNode;
}

export const Icon = ({ size = 16, children, style, ...rest }: IconProps) => (
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

type P = Omit<IconProps, "children">;

export const IconSearch = (p: P) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>;
export const IconPlus = (p: P) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const IconChevR = (p: P) => <Icon {...p}><path d="m9 6 6 6-6 6" /></Icon>;
export const IconChevD = (p: P) => <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>;
export const IconCheck = (p: P) => <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>;
export const IconX = (p: P) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>;
export const IconArrow = (p: P) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const IconPage = (p: P) => <Icon {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></Icon>;
export const IconFolder = (p: P) => <Icon {...p}><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Icon>;
export const IconHome = (p: P) => <Icon {...p}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /></Icon>;
export const IconInbox = (p: P) => <Icon {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.5 3 12v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6l-2.5-6.5A2 2 0 0 0 16.6 4H7.4a2 2 0 0 0-1.9 1.5z" /></Icon>;
export const IconStar = (p: P) => <Icon {...p}><path d="m12 3 2.8 6.1 6.7.6-5 4.5 1.5 6.5L12 17.3 5.9 20.7l1.5-6.5-5-4.5 6.7-.6z" /></Icon>;
export const IconSettings = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Icon>;
export const IconLink = (p: P) => <Icon {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12.3 19" /></Icon>;
export const IconClock = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
export const IconHash = (p: P) => <Icon {...p}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></Icon>;
export const IconGlobe = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" /></Icon>;
export const IconShield = (p: P) => <Icon {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /></Icon>;
export const IconGit = (p: P) => <Icon {...p}><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 8v8" /><path d="M18 10a6 6 0 0 0-6-6H6" /></Icon>;
export const IconServer = (p: P) => <Icon {...p}><rect x="3" y="3" width="18" height="7" rx="2" /><rect x="3" y="14" width="18" height="7" rx="2" /><path d="M7 6.5h.01M7 17.5h.01" /></Icon>;
export const IconBolt = (p: P) => <Icon {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></Icon>;
export const IconFeather = (p: P) => <Icon {...p}><path d="M20.2 13.8a6 6 0 0 0-8.5-8.5L4 13v7h7z" /><path d="M16 8 2 22" /><path d="M17.5 15H9" /></Icon>;
export const IconBook = (p: P) => <Icon {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></Icon>;
export const IconUsers = (p: P) => <Icon {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1A4 4 0 0 1 16 11" /></Icon>;
export const IconBolts = (p: P) => <Icon {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></Icon>;
export const IconMoon = (p: P) => <Icon {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Icon>;
export const IconSun = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>;
export const IconMenu = (p: P) => <Icon {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Icon>;
export const IconCmd = (p: P) => <Icon {...p}><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" /></Icon>;
export const IconDots = (p: P) => <Icon {...p}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></Icon>;
export const IconType = (p: P) => <Icon {...p}><path d="M4 7V5h16v2M9 20h6M12 5v15" /></Icon>;
export const IconQuote = (p: P) => <Icon {...p}><path d="M3 21c3 0 6-2 6-8V5H3v8h3c0 3-1 5-3 5zM15 21c3 0 6-2 6-8V5h-6v8h3c0 3-1 5-3 5z" /></Icon>;
export const IconCode = (p: P) => <Icon {...p}><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></Icon>;
export const IconEye = (p: P) => <Icon {...p}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></Icon>;
export const IconHistory = (p: P) => <Icon {...p}><path d="M3 3v5h5" /><path d="M3.1 13a9 9 0 1 0 2.6-7.8L3 8" /><path d="M12 7v5l3 2" /></Icon>;
export const IconBranch = (p: P) => <Icon {...p}><path d="M6 3v12" /><circle cx="6" cy="18" r="2" /><circle cx="6" cy="5" r="2" /><circle cx="18" cy="6" r="2" /><path d="M18 8v2a4 4 0 0 1-4 4H6" /></Icon>;
export const IconHeart = (p: P) => <Icon {...p}><path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21.2l7.8-7.8 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></Icon>;

// Marrow wordmark glyph — stylized 'M' carved from a square with the inner
// bone-marrow counter dot.
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
