import Link from "next/link";

export function StartHero({ href = "/start", delayClass = "d2" }: { href?: string; delayClass?: string }) {
  return (
    <Link href={href} className={`card start-hero ${delayClass}`}>
      <div className="big">▶ START A WORKOUT</div>
      <div className="hint">pick a spot → grab a class → go</div>
    </Link>
  );
}
