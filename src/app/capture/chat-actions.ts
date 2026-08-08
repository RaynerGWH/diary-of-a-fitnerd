"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseMessage, type ChatTurn } from "@/lib/ai/parse-entry";
import type { ChatMessage, Entry } from "@/lib/db/types";

// How many recent chat rows to send to the parser as context. Enough for a
// couple of exchanges to resolve "fix that" corrections, without dragging
// the whole visible (3-hour) history into every request's token cost.
const CONTEXT_ROWS = 6;

export type SendCaptureMessageResult = {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  entry: Entry;
};

export async function sendCaptureMessage(message: string): Promise<SendCaptureMessageResult> {
  const text = message.trim();
  if (!text) throw new Error("message is required");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");

  const { data: recentRows, error: recentError } = await supabase
    .from("capture_chat")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(CONTEXT_ROWS);
  if (recentError) throw new Error(recentError.message);

  const recent = ((recentRows as ChatMessage[]) ?? []).slice().reverse();
  const context: ChatTurn[] = recent.map((m) => ({ role: m.role, content: m.content }));
  const lastEntryId = [...recent].reverse().find((m) => m.role === "assistant" && m.entry_id)?.entry_id ?? null;

  const parsed = await parseMessage(text, context);
  const needsReview = parsed.uncertainFields.length > 0;

  let entry: Entry;
  if (parsed.isCorrection && lastEntryId) {
    const update: Record<string, unknown> = {
      type: parsed.type,
      category: parsed.category,
      title: parsed.title,
      body: parsed.body,
      amount: parsed.amount,
      currency: parsed.currency,
      due_at: parsed.type === "task" ? parsed.dueAt : null,
      needs_review: needsReview,
      updated_at: new Date().toISOString(),
    };
    // Only reset status when the type moves away from "task" entirely.
    // Leave an existing open/done task's status alone on an in-place edit.
    if (parsed.type !== "task") update.status = null;
    if (parsed.occurredAt) update.occurred_at = parsed.occurredAt;

    const { data, error } = await supabase
      .from("entries")
      .update(update)
      .eq("id", lastEntryId)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    entry = data as Entry;
  } else {
    const { data, error } = await supabase
      .from("entries")
      .insert({
        user_id: user.id,
        type: parsed.type,
        category: parsed.category,
        title: parsed.title,
        body: parsed.body,
        status: parsed.type === "task" ? "open" : null,
        due_at: parsed.type === "task" ? parsed.dueAt : null,
        occurred_at: parsed.occurredAt ?? new Date().toISOString(),
        amount: parsed.amount,
        currency: parsed.currency,
        needs_review: needsReview,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    entry = data as Entry;
  }

  const { data: insertedRows, error: chatError } = await supabase
    .from("capture_chat")
    .insert([
      { user_id: user.id, role: "user", content: text, entry_id: null },
      { user_id: user.id, role: "assistant", content: parsed.reply, entry_id: entry.id },
    ])
    .select();
  if (chatError) throw new Error(chatError.message);
  const [userMessage, assistantMessage] = insertedRows as ChatMessage[];

  revalidatePath("/");
  revalidatePath("/entries");

  return { userMessage, assistantMessage, entry };
}
