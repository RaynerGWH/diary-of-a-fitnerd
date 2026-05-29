"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseSchedule } from "@/lib/schedule-parser";

export async function addLocation(formData: FormData) {
  const name = ((formData.get("name") as string) ?? "").trim();
  if (!name) return;
  const supabase = await createClient();
  await supabase.from("ff_locations").insert({ name });
  revalidatePath("/manage");
}

export async function deleteLocation(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("ff_locations").delete().eq("id", id);
  revalidatePath("/manage");
}

export async function addExercise(formData: FormData) {
  const name = ((formData.get("name") as string) ?? "").trim();
  const category = ((formData.get("category") as string) ?? "").trim() || null;
  const primary_muscle = ((formData.get("primary_muscle") as string) ?? "").trim() || null;
  const equipment = ((formData.get("equipment") as string) ?? "").trim() || null;
  if (!name) return;
  const supabase = await createClient();
  await supabase.from("exercises").insert({ name, category, primary_muscle, equipment });
  revalidatePath("/manage");
}

export async function deleteExercise(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("exercises").delete().eq("id", id);
  revalidatePath("/manage");
}

export async function pasteSchedule(formData: FormData) {
  const locationId = (formData.get("locationId") as string) ?? "";
  const raw = ((formData.get("text") as string) ?? "").trim();
  const replace = formData.get("replace") === "on";
  if (!locationId || !raw) return;

  const parsed = parseSchedule(raw);
  const supabase = await createClient();

  if (replace) {
    await supabase.from("ff_classes").delete().eq("location_id", locationId);
  }
  if (parsed.length > 0) {
    await supabase.from("ff_classes").insert(
      parsed.map((p) => ({
        location_id: locationId,
        name: p.name,
        instructor: p.instructor,
        day_of_week: p.day_of_week,
        start_time: p.start_time,
        duration_min: p.duration_min,
      })),
    );
  }
  revalidatePath("/manage");
}

export async function deleteClass(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("ff_classes").delete().eq("id", id);
  revalidatePath("/manage");
}
