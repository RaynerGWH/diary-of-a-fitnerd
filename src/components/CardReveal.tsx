"use client";

import { useState } from "react";
import Link from "next/link";
import type { CardRarity } from "@/lib/db/types";

export type RevealCard = {
  title: string;
  flavor: string | null;
  rarity: CardRarity;
};

const RARITY_LABEL: Record<CardRarity, string> = {
  common: "common",
  rare: "rare",
  epic: "epic",
  legendary: "legendary",
};

export function CardReveal({ card }: { card: RevealCard | null }) {
  const [flipped, setFlipped] = useState(false);

  if (!card) {
    return (
      <>
        <div className="card alt d2 text-center">
          <div className="font-bold text-[19px]">nice work</div>
          <div className="text-[14px] text-[color:var(--muted)] mt-1">
            no card this time — the deck wants to be earned.
          </div>
        </div>
        <Link href="/" className="sticker-btn primary d3">
          back to home →
        </Link>
      </>
    );
  }

  return (
    <>
      <div className="card d1 text-center">
        <div className="text-[14px] text-[color:var(--muted)]">a surprise card dropped</div>
        <div className="font-bold text-[19px] mt-1">tap to flip</div>
      </div>

      <div className="reveal-wrap d2">
        <button
          type="button"
          className={`reveal ${flipped ? "flipped" : ""}`}
          onClick={() => setFlipped(true)}
          aria-label="flip card"
          style={{ background: "none", border: "none", padding: 0, width: "100%", cursor: "pointer" }}
        >
          <div className="face">
            <div className="text-[40px]">🃏</div>
            <div className="font-bold mt-2">tap me</div>
            <div className="text-[12px] text-[color:var(--muted)]">a {RARITY_LABEL[card.rarity]} card</div>
          </div>
          <div className={`face back r-${card.rarity}`}>
            <div className="text-[12px] uppercase tracking-wider opacity-80">{RARITY_LABEL[card.rarity]}</div>
            <div className="font-bold text-[24px] mt-1">{card.title}</div>
            {card.flavor && (
              <div className="font-scribble text-[18px] mt-2">{card.flavor}</div>
            )}
          </div>
        </button>
      </div>

      <Link href="/" className="sticker-btn primary d3">
        back to home →
      </Link>
    </>
  );
}
