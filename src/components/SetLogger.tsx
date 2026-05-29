"use client";

import { useRef, useState, useTransition } from "react";
import { logSet } from "@/app/workout/[id]/actions";
import type { Exercise } from "@/lib/db/types";

export function SetLogger({
  workoutId,
  catalog,
}: {
  workoutId: string;
  catalog: Exercise[];
}) {
  const [exerciseName, setExerciseName] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [rpe, setRpe] = useState("");
  const [pending, start] = useTransition();
  const repsRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!exerciseName.trim()) return;
    const fd = new FormData();
    fd.set("workoutId", workoutId);
    fd.set("exerciseName", exerciseName.trim());
    fd.set("reps", reps);
    fd.set("weight", weight);
    fd.set("rpe", rpe);
    start(async () => {
      await logSet(fd);
      setReps("");
      setWeight("");
      setRpe("");
      repsRef.current?.focus();
    });
  }

  return (
    <div className="card alt d2">
      <div className="font-bold text-[17px]">log a set</div>

      <div className="mt-2 flex flex-col gap-2">
        <input
          className="field"
          placeholder="exercise name (bench, squat, ...)"
          list="exercises-list"
          value={exerciseName}
          onChange={(e) => setExerciseName(e.target.value)}
        />
        <datalist id="exercises-list">
          {catalog.map((e) => (
            <option key={e.id} value={e.name} />
          ))}
        </datalist>

        <div className="grid grid-cols-3 gap-2">
          <input
            ref={repsRef}
            className="field"
            placeholder="reps"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
          />
          <input
            className="field"
            placeholder="kg"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
          <input
            className="field"
            placeholder="rpe"
            inputMode="numeric"
            value={rpe}
            onChange={(e) => setRpe(e.target.value)}
          />
        </div>
        <button className="sticker-btn primary" onClick={submit} disabled={pending}>
          {pending ? "logging…" : "＋ add set"}
        </button>
      </div>
    </div>
  );
}
