"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { nextSetIndex } from "@/lib/exercises/catalog";

// Add an exercise from the library as a new block in the session.
export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string | null,
  exerciseName: string,
) {
  if (!workoutId || !exerciseName.trim()) return;
  const supabase = await createClient();

  const { count } = await supabase
    .from("workout_exercises")
    .select("*", { count: "exact", head: true })
    .eq("workout_id", workoutId);

  await supabase.from("workout_exercises").insert({
    workout_id: workoutId,
    exercise_id: exerciseId,
    exercise_name: exerciseName.trim(),
    order_index: count ?? 0,
  });
  revalidatePath(`/workout/${workoutId}`);
}

// Create a custom exercise, then add it to the session.
export async function createCustomAndAdd(
  workoutId: string,
  name: string,
  primaryMuscle: string | null,
  equipment: string | null,
) {
  const trimmed = name.trim();
  if (!workoutId || !trimmed) return;
  const supabase = await createClient();

  // Reuse an existing exercise with this name if present, else create one.
  let exerciseId: string | null = null;
  const { data: existing } = await supabase
    .from("exercises")
    .select("id")
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing?.id) {
    exerciseId = existing.id as string;
  } else {
    const { data: inserted } = await supabase
      .from("exercises")
      .insert({
        name: trimmed,
        primary_muscle: primaryMuscle,
        primary_muscles: primaryMuscle ? [primaryMuscle] : [],
        equipment,
        is_custom: true,
      })
      .select("id")
      .maybeSingle();
    exerciseId = (inserted?.id as string | undefined) ?? null;
  }

  await addExerciseToWorkout(workoutId, exerciseId, trimmed);
}

export async function removeWorkoutExercise(formData: FormData) {
  const id = formData.get("workoutExerciseId") as string;
  const workoutId = formData.get("workoutId") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("workout_exercises").delete().eq("id", id);
  revalidatePath(`/workout/${workoutId}`);
}

export async function logSet(formData: FormData) {
  const workoutId = formData.get("workoutId") as string;
  const workoutExerciseId = formData.get("workoutExerciseId") as string;
  const reps = numOrNull(formData.get("reps"));
  const weight = numOrNull(formData.get("weight"));
  const rpe = numOrNull(formData.get("rpe"));
  if (!workoutId || !workoutExerciseId) return;

  const supabase = await createClient();

  const { data: block } = await supabase
    .from("workout_exercises")
    .select("exercise_id, exercise_name")
    .eq("id", workoutExerciseId)
    .maybeSingle();
  if (!block) return;

  const { data: prior } = await supabase
    .from("workout_sets")
    .select("set_index")
    .eq("workout_exercise_id", workoutExerciseId);
  const indexes = ((prior as { set_index: number }[] | null) ?? []).map((r) => r.set_index);

  await supabase.from("workout_sets").insert({
    workout_id: workoutId,
    workout_exercise_id: workoutExerciseId,
    exercise_id: (block as { exercise_id: string | null }).exercise_id,
    exercise_name: (block as { exercise_name: string }).exercise_name,
    set_index: nextSetIndex(indexes),
    reps,
    weight,
    rpe,
  });
  revalidatePath(`/workout/${workoutId}`);
}

export async function deleteSet(formData: FormData) {
  const setId = formData.get("setId") as string;
  const workoutId = formData.get("workoutId") as string;
  if (!setId) return;
  const supabase = await createClient();
  await supabase.from("workout_sets").delete().eq("id", setId);
  revalidatePath(`/workout/${workoutId}`);
}

export async function abandonWorkout(formData: FormData) {
  const workoutId = formData.get("workoutId") as string;
  const supabase = await createClient();
  await supabase
    .from("workouts")
    .update({ status: "abandoned", ended_at: new Date().toISOString() })
    .eq("id", workoutId);
  revalidatePath("/");
  redirect("/");
}

export async function goToEnd(formData: FormData) {
  const workoutId = formData.get("workoutId") as string;
  redirect(`/workout/${workoutId}/end`);
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
