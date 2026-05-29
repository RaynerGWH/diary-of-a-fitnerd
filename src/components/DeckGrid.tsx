"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CardRarity, Profile, UserCard } from "@/lib/db/types";
import { formatRelative } from "@/lib/format";

type CardWithOwner = UserCard & {
  profile?: Pick<Profile, "id" | "display_name" | "email"> | null;
};

export function DeckGrid({ initial, profiles }: { initial: CardWithOwner[]; profiles: Profile[] }) {
  const [cards, setCards] = useState(initial);
  const router = useRouter();

  useEffect(() => setCards(initial), [initial]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("deck-cards")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_cards" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const counts: Record<CardRarity, number> = {
    common: 0, rare: 0, epic: 0, legendary: 0,
  };
  for (const c of cards) counts[c.rarity] += 1;

  return (
    <>
      <div className="card d1">
        <div className="font-bold text-[19px]">{cards.length} cards collected</div>
        <div className="chips mt-2">
          {(Object.keys(counts) as CardRarity[]).map((r) => (
            <span key={r} className="chip">
              {counts[r]} {r}
            </span>
          ))}
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="card alt d2">
          <div className="text-[14px] text-[color:var(--muted)]">
            no cards yet — finish a workout and flip one.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {cards.map((c, i) => (
            <div key={c.id} className={`card d${Math.min(6, 2 + (i % 4))} r-${c.rarity}`} style={cardStyle(c.rarity, i)}>
              <div className="text-[10px] uppercase tracking-wide opacity-70">{c.rarity}</div>
              <div className="font-bold text-[16px] mt-1 leading-tight">{c.title}</div>
              {c.flavor && (
                <div className="font-scribble text-[14px] mt-2 leading-tight">{c.flavor}</div>
              )}
              <div className="text-[11px] text-[color:var(--muted)] mt-2">
                {profileName(c.user_id, profiles)} · {formatRelative(c.earned_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function profileName(userId: string, profiles: Profile[]): string {
  const p = profiles.find((x) => x.id === userId);
  return p?.display_name ?? p?.email?.split("@")[0] ?? "?";
}

function cardStyle(rarity: CardRarity, i: number): React.CSSProperties {
  const bg: Record<CardRarity, string> = {
    common: "#ffffff",
    rare: "var(--rayner-soft)",
    epic: "var(--ada-soft)",
    legendary: "var(--hi)",
  };
  return {
    background: bg[rarity],
    transform: `rotate(${i % 2 ? 0.8 : -0.6}deg)`,
  };
}
