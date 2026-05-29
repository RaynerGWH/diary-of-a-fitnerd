import Link from "next/link";
import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { WorkoutTimer } from "@/components/WorkoutTimer";
import { SetLogger } from "@/components/SetLogger";
import { SetList } from "@/components/SetList";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { getWorkout, getWorkoutSets } from "@/lib/db/queries";
import { createClient } from "@/lib/supabase/server";
import { abandonWorkout, goToEnd } from "./actions";
import type { Exercise } from "@/lib/db/types";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const workout = await getWorkout(id);
  if (!workout) redirect("/");

  if (workout.user_id !== profile.id) redirect(`/workout/${id}/peek`);
  if (workout.status === "completed") redirect(`/workout/${id}/end`);

  const [sets, supabase] = await Promise.all([
    getWorkoutSets(id),
    createClient(),
  ]);
  const { data: catalog } = await supabase.from("exercises").select("*").order("name");

  const name = workout.title ?? workout.class?.name ?? "Workout";
  const sub = workout.location?.name ?? workout.type;

  return (
    <PhoneFrame>
      <Header subtitle="training now" />

      <div className="card live-card d1">
        <div className="row1">
          <span className="pulse" />
          <span className="who">{name}</span>
        </div>
        <div className="meta">
          {sub} · <WorkoutTimer startedAt={workout.started_at} /> in
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">
          <form action={goToEnd}>
            <input type="hidden" name="workoutId" value={workout.id} />
            <button className="sticker-btn primary" type="submit">
              finish ▸
            </button>
          </form>
          <form action={abandonWorkout}>
            <input type="hidden" name="workoutId" value={workout.id} />
            <button className="sticker-btn" type="submit">
              abandon
            </button>
          </form>
        </div>
      </div>

      <SetLogger workoutId={workout.id} catalog={(catalog as Exercise[]) ?? []} />
      <SetList workoutId={workout.id} initial={sets} canEdit />

      <Link href="/" className="sticker-btn d4">
        ← back to home
      </Link>

      <BottomNav active="start" />
    </PhoneFrame>
  );
}
