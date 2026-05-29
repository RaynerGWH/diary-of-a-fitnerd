"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function logSet(formData: FormData) {
  const workoutId = formData.get("workoutId") as string;
  const exerciseName = ((formData.get("exerciseName") as string) ?? "").trim();
  const reps = numOrNull(formData.get("reps"));
  const weight = numOrNull(formData.get("weight"));
  const rpe = numOrNull(formData.get("rpe"));
  if (!workoutId || !exerciseName) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Find next set_index for this exercise within this workout.
  const { data: prior } = await supabase
    .from("workout_sets")
    .select("set_index")
    .eq("workout_id", workoutId)
    .eq("exercise_name", exerciseName)
    .order("set_index", { ascending: false })
    .limit(1);
  const nextIdx = ((prior?.[0]?.set_index as number | undefined) ?? 0) + 1;

  // Resolve / create the exercise catalog row (so recs in v2 can use it).
  let exerciseId: string | null = null;
  const { data: existing } = await supabase
    .from("exercises")
    .select("id")
    .ilike("name", exerciseName)
    .maybeSingle();
  if (existing?.id) {
    exerciseId = existing.id as string;
  } else {
    const { data: inserted } = await supabase
      .from("exercises")
      .insert({ name: exerciseName })
      .select("id")
      .maybeSingle();
    exerciseId = (inserted?.id as string | undefined) ?? null;
  }

  await supabase.from("workout_sets").insert({
    workout_id: workoutId,
    exercise_id: exerciseId,
    exercise_name: exerciseName,
    set_index: nextIdx,
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
