"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { pickCardForWorkout } from "@/lib/cards/rules";

export type FinishResult = {
  cardId: string | null;
  title: string;
  flavor: string | null;
  rarity: "common" | "rare" | "epic" | "legendary";
} | null;

export async function finishWorkout(formData: FormData): Promise<FinishResult> {
  const workoutId = formData.get("workoutId") as string;
  const enjoyment = Number(formData.get("enjoyment"));
  const mood = ((formData.get("mood") as string) ?? "").trim() || null;
  const notes = ((formData.get("notes") as string) ?? "").trim() || null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: w } = await supabase
    .from("workouts")
    .select("started_at, user_id, status")
    .eq("id", workoutId)
    .maybeSingle();

  if (!w || (w as { user_id: string }).user_id !== user.id) return null;

  const startedAt = new Date((w as { started_at: string }).started_at);
  const endedAt = new Date();
  const durationSec = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));

  await supabase
    .from("workouts")
    .update({
      status: "completed",
      ended_at: endedAt.toISOString(),
      duration_sec: durationSec,
      enjoyment: Number.isFinite(enjoyment) ? enjoyment : null,
      mood,
      notes,
    })
    .eq("id", workoutId);

  const earned = await pickCardForWorkout(supabase, { workoutId, userId: user.id });

  let inserted: { id: string } | null = null;
  if (earned) {
    const { data } = await supabase
      .from("user_cards")
      .insert({
        user_id: user.id,
        workout_id: workoutId,
        card_def_id: earned.card_def_id,
        title: earned.title,
        flavor: earned.flavor,
        rarity: earned.rarity,
      })
      .select("id")
      .maybeSingle();
    inserted = (data as { id: string } | null) ?? null;
  }

  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/deck");

  if (!earned) return null;
  return {
    cardId: inserted?.id ?? null,
    title: earned.title,
    flavor: earned.flavor,
    rarity: earned.rarity,
  };
}
