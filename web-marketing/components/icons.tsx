import { type SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconCheck = (p: IconProps) => (
  <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>
);
export const IconX = (p: IconProps) => (
  <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>
);
export const IconArrow = (p: IconProps) => (
  <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
);
export const IconChevD = (p: IconProps) => (
  <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>
);
export const IconMoon = (p: IconProps) => (
  <Icon {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Icon>
);
export const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export function MarrowGlyph({ size = 24, style }: { size?: number; style?: React.CSSProperties }) {
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
  style?: React.CSSProperties;
  showGlyph?: boolean;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        color: "currentColor",
        ...style,
      }}
    >
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
