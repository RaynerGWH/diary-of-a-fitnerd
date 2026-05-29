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

export const PlayIcon = (p: IconProps) =>
  base({ ...p, children: <path className="doodle" d="M8 5v14l11-7z" /> });

export const ClockIcon = (p: IconProps) =>
  base({
    ...p,
    children: <path className="doodle" d="M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7" />,
  });

export const DeckIcon = (p: IconProps) =>
  base({ ...p, children: <path className="doodle" d="M7 5h9v13H7zM10 5l6 1v12" /> });

export const PulseIcon = (p: IconProps) =>
  base({ ...p, children: <path className="doodle" d="M4 12h3l2-6 4 13 3-8 2 3h2" /> });

export const SettingsIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <path
        className="doodle"
        d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm9 3l-2-1-1-2 1-2-2-2-2 1-2-1-1-2h-2l-1 2-2 1-2-1-2 2 1 2-1 2-2 1v2l2 1 1 2-1 2 2 2 2-1 2 1 1 2h2l1-2 2-1 2 1 2-2-1-2 1-2 2-1z"
      />
    ),
  });
