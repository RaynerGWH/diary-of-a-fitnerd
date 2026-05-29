import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { StartHero } from "@/components/StartHero";
import { ActivityCard } from "@/components/ActivityCard";
import { DeckPeek } from "@/components/DeckPeek";
import { BottomNav } from "@/components/BottomNav";
import { DashboardLive } from "@/components/DashboardLive";
import { PulseIcon } from "@/components/Doodle";
import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  getActiveWorkouts,
  getDayStreak,
  getDeckCount,
  getRecentWorkouts,
  getWeeklySessionCount,
} from "@/lib/db/queries";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const [active, recent, deckCount, weekCount, streak] = await Promise.all([
    getActiveWorkouts(),
    getRecentWorkouts(6),
    getDeckCount(),
    getWeeklySessionCount(profile.id),
    getDayStreak(profile.id),
  ]);

  const partnerName = profile.email.toLowerCase().startsWith("ada") ? "rayner" : "ada";

  return (
    <PhoneFrame>
      <Header subtitle={`you + ${partnerName} · stronger together`} />

      <DashboardLive initial={active} currentUserId={profile.id} />

      <StartHero />

      <div className="stats">
        <div className="card stat d3">
          <div className="n">{weekCount}</div>
          <div className="l">sessions this week</div>
        </div>
        <div className="card stat s2 d3">
          <div className="n">🔥 {streak}</div>
          <div className="l">day streak</div>
        </div>
      </div>

      <div className="label d4">
        <PulseIcon size={22} />
        lately
      </div>

      {recent.length === 0 ? (
        <div className="card alt d4">
          <div className="text-[14px] text-[color:var(--muted)]">
            no sessions yet — kick it off above.
          </div>
        </div>
      ) : (
        recent.slice(0, 4).map((w, i) => (
          <ActivityCard
            key={w.id}
            workout={w}
            variant="alt"
            delayClass={`d${Math.min(6, 4 + i)}`}
          />
        ))
      )}

      <DeckPeek count={deckCount} delayClass="d6" />

      <BottomNav active="home" />
    </PhoneFrame>
  );
}
