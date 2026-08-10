"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAllowedUser } from "@/lib/auth/require-user";
import type { Entry, EntryStatus, EntryType } from "@/lib/db/types";

export async function toggleTaskStatus(entryId: string, next: EntryStatus) {
  const user = await requireAllowedUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("entries")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/entries");
}

export async function deleteEntry(entryId: string) {
  const user = await requireAllowedUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/entries");
}

// The chat parser sets needs_review when it wasn't confident about a field,
// but nothing ever cleared it: the badge was permanent, with no way to say
// "I looked, it's fine". This is that acknowledgement.
export async function clearNeedsReview(entryId: string) {
  const user = await requireAllowedUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("entries")
    .update({ needs_review: false, updated_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/entries");
}

export type EntryEditFields = {
  type: EntryType;
  category: string;
  title: string;
  body: string | null;
  dueAt: string | null;
  amount: number | null;
  currency: string | null;
  // Optional: only set when the status itself should change (e.g. a chat
  // edit that says "mark as done"). Omitted by EntryCard's inline edit,
  // which leaves status alone and lets the dedicated toggle handle it.
  status?: EntryStatus | null;
};

export async function updateEntry(entryId: string, fields: EntryEditFields): Promise<Entry> {
  const user = await requireAllowedUser();
  const supabase = await createClient();

  const update: Record<string, unknown> = {
    type: fields.type,
    category: fields.category,
    title: fields.title,
    body: fields.body,
    due_at: fields.type === "task" ? fields.dueAt : null,
    amount: fields.amount,
    currency: fields.currency,
    // Saving the edit form IS the review: the user just read every field and
    // committed to them, so leaving the badge on would be nagging about
    // something already resolved.
    needs_review: false,
    updated_at: new Date().toISOString(),
  };
  if (fields.status !== undefined) update.status = fields.status;

  const { data, error } = await supabase
    .from("entries")
    .update(update)
    .eq("id", entryId)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/entries");
  return data as Entry;
}

// Used when a chat-based edit can't find a matching entry: rather than
// silently dropping the message, the user gets a prefilled "log this as new
// instead?" form (see ChatCapture's PendingEditCard) that creates via this.
export async function createEntryFromFields(fields: EntryEditFields): Promise<Entry> {
  const user = await requireAllowedUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("entries")
    .insert({
      user_id: user.id,
      type: fields.type,
      category: fields.category,
      title: fields.title,
      body: fields.body,
      status: fields.type === "task" ? "open" : null,
      due_at: fields.type === "task" ? fields.dueAt : null,
      occurred_at: new Date().toISOString(),
      amount: fields.amount,
      currency: fields.currency,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/entries");
  return data as Entry;
}
