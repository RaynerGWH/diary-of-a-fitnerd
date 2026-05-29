import Link from "next/link";
import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { WorkoutTimer } from "@/components/WorkoutTimer";
import { SetList } from "@/components/SetList";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { getWorkout, getWorkoutSets } from "@/lib/db/queries";

export default async function PeekPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const workout = await getWorkout(id);
  if (!workout) redirect("/");

  const sets = await getWorkoutSets(id);
  const name = workout.profile?.display_name ?? workout.profile?.email ?? "they";
  const title = workout.title ?? workout.class?.name ?? "session";

  return (
    <PhoneFrame>
      <Header subtitle={`peeking at ${name}`} />

      <div className="card live-card d1">
        <div className="row1">
          <span className="pulse" />
          <span className="who">{name} · {title}</span>
        </div>
        <div className="meta">
          {workout.location?.name ?? workout.type} ·{" "}
          {workout.status === "active" ? (
            <>
              <WorkoutTimer startedAt={workout.started_at} /> in
            </>
          ) : (
            "finished"
          )}
        </div>
      </div>

      <SetList workoutId={workout.id} initial={sets} canEdit={false} />

      <Link href="/" className="sticker-btn d4">
        ← back to home
      </Link>

      <BottomNav active="home" />
    </PhoneFrame>
  );
}
