"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EntryType } from "@/lib/db/types";

export async function createEntry(formData: FormData) {
  const type = (formData.get("type") as EntryType) ?? "task";
  const category = ((formData.get("category") as string) || "other").trim();
  const title = ((formData.get("title") as string) || "").trim();
  const body = ((formData.get("body") as string) || "").trim() || null;
  const dueAt = (formData.get("dueAt") as string) || null;
  const amountRaw = (formData.get("amount") as string) || "";
  const currency = ((formData.get("currency") as string) || "").trim() || null;

  if (!title) throw new Error("title is required");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("entries").insert({
    user_id: user.id,
    type,
    category,
    title,
    body,
    status: type === "task" ? "open" : null,
    due_at: type === "task" && dueAt ? new Date(dueAt).toISOString() : null,
    amount: amountRaw ? Number(amountRaw) : null,
    currency: amountRaw ? currency : null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/entries");
  redirect("/");
}
