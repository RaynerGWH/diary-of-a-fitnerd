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

export const PlusIcon = (p: IconProps) =>
  base({ ...p, children: <path className="doodle" d="M12 5v14M5 12h14" /> });

export const ListIcon = (p: IconProps) =>
  base({
    ...p,
    children: <path className="doodle" d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  });

export const PulseIcon = (p: IconProps) =>
  base({ ...p, children: <path className="doodle" d="M4 12h3l2-6 4 13 3-8 2 3h2" /> });
