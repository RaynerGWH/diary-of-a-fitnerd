"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { WorkoutType } from "@/lib/db/types";

export async function startWorkout(formData: FormData) {
  const type = (formData.get("type") as WorkoutType) ?? "class";
  const locationId = (formData.get("locationId") as string) || null;
  const classId = (formData.get("classId") as string) || null;
  const title = ((formData.get("title") as string) || "").trim() || null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let resolvedTitle = title;
  if (!resolvedTitle && classId) {
    const { data } = await supabase
      .from("ff_classes")
      .select("name")
      .eq("id", classId)
      .maybeSingle();
    resolvedTitle = (data as { name: string } | null)?.name ?? null;
  }

  const { data: workout, error } = await supabase
    .from("workouts")
    .insert({
      user_id: user.id,
      type,
      location_id: locationId,
      class_id: classId,
      title: resolvedTitle,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !workout) throw new Error(error?.message ?? "could not start workout");
  revalidatePath("/");
  redirect(`/workout/${workout.id}`);
}
