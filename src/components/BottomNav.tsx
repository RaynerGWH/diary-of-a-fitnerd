import Link from "next/link";
import { HomeIcon, ListIcon, PlusIcon } from "./Doodle";

type Tab = "home" | "capture" | "entries";

const tabs: { tab: Tab; href: string; label: string; Icon: typeof HomeIcon }[] = [
  { tab: "home",    href: "/",        label: "today",   Icon: HomeIcon },
  { tab: "capture", href: "/capture", label: "add",     Icon: PlusIcon },
  { tab: "entries", href: "/entries", label: "entries", Icon: ListIcon },
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
