import Link from "next/link";
import { ClockIcon, DeckIcon, HomeIcon, PlayIcon, SettingsIcon } from "./Doodle";

type Tab = "home" | "start" | "history" | "deck" | "manage";

const tabs: { tab: Tab; href: string; label: string; Icon: typeof HomeIcon }[] = [
  { tab: "home",    href: "/",        label: "home",    Icon: HomeIcon },
  { tab: "start",   href: "/start",   label: "start",   Icon: PlayIcon },
  { tab: "history", href: "/history", label: "history", Icon: ClockIcon },
  { tab: "deck",    href: "/deck",    label: "deck",    Icon: DeckIcon },
  { tab: "manage",  href: "/manage",  label: "manage",  Icon: SettingsIcon },
];

export function BottomNav({ active }: { active: Tab }) {
  return (
    <div className="nav">
      {tabs.map(({ tab, href, label, Icon }) => (
        <Link key={tab} href={href} className={active === tab ? "on" : ""}>
          <Icon />
          {label}
        </Link>
      ))}
    </div>
  );
}
