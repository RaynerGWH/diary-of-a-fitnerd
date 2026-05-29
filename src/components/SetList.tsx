"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteSet } from "@/app/workout/[id]/actions";
import type { WorkoutSet } from "@/lib/db/types";

export function SetList({
  workoutId,
  initial,
  canEdit,
}: {
  workoutId: string;
  initial: WorkoutSet[];
  canEdit: boolean;
}) {
  const [sets, setSets] = useState<WorkoutSet[]>(initial);
  const router = useRouter();

  useEffect(() => setSets(initial), [initial]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`workout-sets:${workoutId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workout_sets", filter: `workout_id=eq.${workoutId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workoutId, router]);

  if (sets.length === 0) {
    return (
      <div className="card alt d3">
        <div className="text-[14px] text-[color:var(--muted)]">no sets yet — start above.</div>
      </div>
    );
  }

  const groups = groupByExercise(sets);

  return (
    <div className="card alt d3">
      <div className="font-bold text-[17px] mb-2">sets logged</div>
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.name}>
            <div className="font-bold text-[14px]">{g.name}</div>
            <div className="flex flex-col gap-1 mt-1">
              {g.sets.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-[13.5px]">
                  <div>
                    set {s.set_index} · {s.reps ?? "–"} reps
                    {s.weight != null ? ` @ ${s.weight}kg` : ""}
                    {s.rpe != null ? ` · rpe ${s.rpe}` : ""}
                  </div>
                  {canEdit && (
                    <form action={deleteSet}>
                      <input type="hidden" name="setId" value={s.id} />
                      <input type="hidden" name="workoutId" value={workoutId} />
                      <button className="text-[color:var(--muted)] text-[12px]" type="submit">
                        remove
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupByExercise(sets: WorkoutSet[]) {
  const map = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    const arr = map.get(s.exercise_name) ?? [];
    arr.push(s);
    map.set(s.exercise_name, arr);
  }
  return [...map.entries()].map(([name, arr]) => ({
    name,
    sets: arr.sort((a, b) => a.set_index - b.set_index),
  }));
}
