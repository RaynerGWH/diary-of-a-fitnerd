"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ExercisePicker } from "./ExercisePicker";
import { deleteSet, logSet, removeWorkoutExercise } from "@/app/workout/[id]/actions";
import type { WorkoutSet } from "@/lib/db/types";

export type BlockWithExercise = {
  id: string;
  workout_id: string;
  exercise_id: string | null;
  exercise_name: string;
  order_index: number;
  exercise: { image_urls: string[]; primary_muscle: string | null; equipment: string | null } | null;
};

export function WorkoutClient({
  workoutId,
  blocks,
  sets,
  editable,
}: {
  workoutId: string;
  blocks: BlockWithExercise[];
  sets: WorkoutSet[];
  editable: boolean;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`workout:${workoutId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workout_exercises", filter: `workout_id=eq.${workoutId}` },
        () => router.refresh(),
      )
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

  const setsByBlock = useMemo(() => {
    const m = new Map<string, WorkoutSet[]>();
    for (const s of sets) {
      if (!s.workout_exercise_id) continue;
      const arr = m.get(s.workout_exercise_id) ?? [];
      arr.push(s);
      m.set(s.workout_exercise_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.set_index - b.set_index);
    return m;
  }, [sets]);

  if (blocks.length === 0 && !editable) {
    return <div className="card alt d2 text-[14px] text-[color:var(--muted)]">no exercises logged yet.</div>;
  }

  return (
    <>
      {blocks.map((b) => (
        <div key={b.id} className="block-card d2">
          <div className="flex items-center gap-2">
            <Thumb url={b.exercise?.image_urls?.[0]} />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[14px] truncate">{b.exercise_name}</div>
              <div className="text-[10.5px] text-[color:var(--muted)]">
                {b.exercise?.primary_muscle ?? "—"}{b.exercise?.equipment ? ` · ${b.exercise.equipment}` : ""}
              </div>
            </div>
            {editable && (
              <form action={removeWorkoutExercise}>
                <input type="hidden" name="workoutExerciseId" value={b.id} />
                <input type="hidden" name="workoutId" value={workoutId} />
                <button type="submit" className="text-[color:var(--muted)] text-[12px]" aria-label="remove exercise">✕</button>
              </form>
            )}
          </div>

          <SetTable
            sets={setsByBlock.get(b.id) ?? []}
            workoutId={workoutId}
            editable={editable}
          />

          {editable && <AddSetRow workoutId={workoutId} blockId={b.id} />}
        </div>
      ))}

      {editable && (
        <button className="add-exercise-btn d3" onClick={() => setPickerOpen(true)}>
          ＋ ADD EXERCISE
        </button>
      )}

      {pickerOpen && <ExercisePicker workoutId={workoutId} onClose={() => setPickerOpen(false)} />}
    </>
  );
}

function SetTable({
  sets,
  workoutId,
  editable,
}: {
  sets: WorkoutSet[];
  workoutId: string;
  editable: boolean;
}) {
  if (sets.length === 0) {
    return <div className="text-[11px] text-[color:var(--muted)] mt-2">no sets yet</div>;
  }
  return (
    <table className="set-table mt-2">
      <thead>
        <tr>
          <th>SET</th><th>KG</th><th>REPS</th><th>RPE</th>{editable && <th></th>}
        </tr>
      </thead>
      <tbody>
        {sets.map((s) => (
          <tr key={s.id}>
            <td>{s.set_index}</td>
            <td>{s.weight ?? "–"}</td>
            <td>{s.reps ?? "–"}</td>
            <td>{s.rpe ?? "–"}</td>
            {editable && (
              <td>
                <form action={deleteSet}>
                  <input type="hidden" name="setId" value={s.id} />
                  <input type="hidden" name="workoutId" value={workoutId} />
                  <button type="submit" className="text-[color:var(--muted)] text-[11px]">remove</button>
                </form>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AddSetRow({ workoutId, blockId }: { workoutId: string; blockId: string }) {
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [rpe, setRpe] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const weightRef = useRef<HTMLInputElement>(null);

  function submit() {
    const fd = new FormData();
    fd.set("workoutId", workoutId);
    fd.set("workoutExerciseId", blockId);
    fd.set("reps", reps);
    fd.set("weight", weight);
    fd.set("rpe", rpe);
    start(async () => {
      await logSet(fd);
      setReps("");
      setWeight("");
      setRpe("");
      weightRef.current?.focus();
      router.refresh();
    });
  }

  return (
    <div className="add-set-row mt-2">
      <input ref={weightRef} className="field" inputMode="decimal" placeholder="kg" value={weight} onChange={(e) => setWeight(e.target.value)} />
      <input className="field" inputMode="numeric" placeholder="reps" value={reps} onChange={(e) => setReps(e.target.value)} />
      <input className="field" inputMode="numeric" placeholder="rpe" value={rpe} onChange={(e) => setRpe(e.target.value)} />
      <button className="sticker-btn primary" disabled={pending} onClick={submit}>＋ set</button>
    </div>
  );
}

function Thumb({ url }: { url?: string }) {
  if (!url) return <div className="picker-thumb picker-thumb-empty">FN</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="picker-thumb" src={url} alt="" loading="lazy" />;
}
