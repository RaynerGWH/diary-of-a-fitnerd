import { CactusIcon } from "./Doodle";

export function Header({ subtitle }: { subtitle?: string }) {
  return (
    <div>
      <CactusIcon size={30} className="logo" />
      <div className="sub">{subtitle ?? "today's build"}</div>
    </div>
  );
}
