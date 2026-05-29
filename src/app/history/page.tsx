import { redirect } from "next/navigation";
import Link from "next/link";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { ActivityCard } from "@/components/ActivityCard";
import { ClockIcon } from "@/components/Doodle";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { getRecentWorkouts } from "@/lib/db/queries";

export default async function HistoryPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const all = await getRecentWorkouts(50);

  const mine = all.filter((w) => w.user_id === profile.id);
  const theirs = all.filter((w) => w.user_id !== profile.id);

  return (
    <PhoneFrame>
      <Header subtitle="every session, both of you" />

      <div className="label d1">
        <ClockIcon size={22} />
        you
      </div>
      {mine.length === 0 ? (
        <div className="card alt d1">
          <div className="text-[14px] text-[color:var(--muted)]">no sessions yet — start one.</div>
        </div>
      ) : (
        mine.slice(0, 12).map((w, i) => (
          <Link key={w.id} href={`/workout/${w.id}/peek`} style={{ textDecoration: "none", color: "inherit" }}>
            <ActivityCard workout={w} variant={i % 2 ? "alt" : "default"} delayClass={`d${Math.min(6, 2 + i)}`} />
          </Link>
        ))
      )}

      <div className="label d4">
        <ClockIcon size={22} />
        them
      </div>
      {theirs.length === 0 ? (
        <div className="card alt d4">
          <div className="text-[14px] text-[color:var(--muted)]">quiet over there.</div>
        </div>
      ) : (
        theirs.slice(0, 12).map((w, i) => (
          <Link key={w.id} href={`/workout/${w.id}/peek`} style={{ textDecoration: "none", color: "inherit" }}>
            <ActivityCard workout={w} variant={i % 2 ? "alt" : "default"} delayClass={`d${Math.min(6, 4 + i)}`} />
          </Link>
        ))
      )}

      <BottomNav active="history" />
    </PhoneFrame>
  );
}
