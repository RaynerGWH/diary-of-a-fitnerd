import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 22, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...rest}>
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) =>
  base({ ...p, children: <path className="doodle" d="M4 11l8-7 8 7M6 10v9h12v-9" /> });

export const MessageIcon = (p: IconProps) =>
  base({ ...p, children: <path className="doodle" d="M4 5h16v10H9l-4 4v-4H4z" /> });

export const ListIcon = (p: IconProps) =>
  base({
    ...p,
    children: <path className="doodle" d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  });

export const PulseIcon = (p: IconProps) =>
  base({ ...p, children: <path className="doodle" d="M4 12h3l2-6 4 13 3-8 2 3h2" /> });

export const CactusIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <path
          className="doodle cactus-icon"
          d="M9.5 20V9.5c0-2.5 1.1-4.5 2.5-4.5s2.5 2 2.5 4.5V20M9.5 15.5c-2.6.3-4.3-1.3-4.3-3.5 0-2 1.5-3.5 3.4-3.3M14.5 12.5c2.6.3 4.3-1.3 4.3-3.3 0-1.9-1.5-3.4-3.4-3.2M5 20h14"
        />
        <circle className="cactus-flower" cx="12" cy="4.5" r="1.5" />
      </>
    ),
  });
