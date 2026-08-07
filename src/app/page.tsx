import { redirect } from "next/navigation";
import Link from "next/link";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { EntryCard } from "@/components/EntryCard";
import { EntriesLive } from "@/components/EntriesLive";
import { PulseIcon } from "@/components/Doodle";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { getTodayTasks, getTodayLogs, getDayStreak, getOpenTaskCount } from "@/lib/db/queries";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const [tasks, logs, streak, openCount] = await Promise.all([
    getTodayTasks(profile.id),
    getTodayLogs(profile.id),
    getDayStreak(profile.id),
    getOpenTaskCount(profile.id),
  ]);

  return (
    <PhoneFrame>
      <Header subtitle="today" />

      <EntriesLive userId={profile.id} />

      <Link href="/capture" className="capture-hero d1">
        <div className="big">+ log something</div>
        <div className="hint">task, note, log, or event</div>
      </Link>

      <div className="stats">
        <div className="card stat d2">
          <div className="n">{openCount}</div>
          <div className="l">open tasks</div>
        </div>
        <div className="card stat s2 d2">
          <div className="n">🔥 {streak}</div>
          <div className="l">day streak</div>
        </div>
      </div>

      <div className="label d3">today&apos;s tasks</div>
      {tasks.length === 0 ? (
        <div className="card alt d3">
          <div className="text-[14px] text-[color:var(--muted)]">
            nothing due — nice, or add one above.
          </div>
        </div>
      ) : (
        tasks.map((e, i) => (
          <EntryCard key={e.id} entry={e} variant="alt" delayClass={`d${Math.min(6, 3 + i)}`} />
        ))
      )}

      <div className="label d4">
        <PulseIcon size={20} />
        logged today
      </div>
      {logs.length === 0 ? (
        <div className="card d4">
          <div className="text-[14px] text-[color:var(--muted)]">
            no notes or logs yet today.
          </div>
        </div>
      ) : (
        logs.map((e, i) => (
          <EntryCard key={e.id} entry={e} delayClass={`d${Math.min(6, 4 + i)}`} />
        ))
      )}

      <BottomNav active="home" />
    </PhoneFrame>
  );
}
