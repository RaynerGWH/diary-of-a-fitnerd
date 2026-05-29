import Link from "next/link";

export function DeckPeek({ count, delayClass }: { count: number; delayClass?: string }) {
  return (
    <Link href="/deck" className={`card deck ${delayClass ?? ""}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div>
        <div className="t">your deck</div>
        <div className="d">{count} cards collected together</div>
      </div>
      <div className="mini-cards">
        <div className="mini c1" />
        <div className="mini c2" />
        <div className="mini c3" />
      </div>
    </Link>
  );
}
