import * as React from "react";

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

const baseProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function makeIcon(path: React.ReactNode) {
  return function Icon({ size = 16, ...props }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        {...baseProps}
        {...props}
      >
        {path}
      </svg>
    );
  };
}

export const IconArrowRight = makeIcon(
  <>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </>,
);

export const IconCheck = makeIcon(<path d="M5 12l4 4 10-10" />);

export const IconExternal = makeIcon(
  <>
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
  </>,
);

export const IconGithub = makeIcon(
  <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.1-1.46-1.1-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.56 9.56 0 0 1 12 6.8c.85 0 1.7.11 2.5.33 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />,
);

export const IconMenu = makeIcon(
  <>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </>,
);

export const IconClose = makeIcon(
  <>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </>,
);

export const IconBookOpen = makeIcon(
  <>
    <path d="M2 4h7a3 3 0 0 1 3 3v13" />
    <path d="M22 4h-7a3 3 0 0 0-3 3v13" />
    <path d="M2 4v15h7a3 3 0 0 1 3 3" />
    <path d="M22 4v15h-7a3 3 0 0 0-3 3" />
  </>,
);

export const IconTerminal = makeIcon(
  <>
    <path d="m4 7 5 5-5 5" />
    <path d="M12 17h8" />
  </>,
);

export const IconLayers = makeIcon(
  <>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </>,
);
