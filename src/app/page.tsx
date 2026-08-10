import { redirect } from "next/navigation";
import Link from "next/link";
import { PhoneFrame } from "@/components/PhoneFrame";
import { HomeGreeting } from "@/components/HomeGreeting";
import { BottomNav } from "@/components/BottomNav";
import { HomeEntries } from "@/components/HomeEntries";
import { EntriesLive } from "@/components/EntriesLive";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { HomeSchedule } from "@/components/HomeSchedule";
import { getOutstandingTasks, getTodayLogs, getTodaySchedule } from "@/lib/db/queries";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const [tasks, logs, schedule] = await Promise.all([
    getOutstandingTasks(profile.id),
    getTodayLogs(profile.id),
    getTodaySchedule(profile.id),
  ]);

  return (
    <PhoneFrame nav={<BottomNav active="home" />}>
      <HomeGreeting />

      <EntriesLive userId={profile.id} />

      <Link href="/capture" className="capture-hero d1">
        <div className="big">What&apos;s new?</div>
      </Link>

      <HomeSchedule entries={schedule} />

      <HomeEntries tasks={tasks} logs={logs} />
    </PhoneFrame>
  );
}
