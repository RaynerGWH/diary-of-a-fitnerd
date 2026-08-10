"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAllowedUser } from "@/lib/auth/require-user";
import { parseMessage, resolveEdit, type ChatTurn, type EditCandidate } from "@/lib/ai/parse-entry";
import { searchEntriesForEdit, CHAT_SESSION_WINDOW_MS } from "@/lib/db/queries";
import type { EntryEditFields } from "@/app/entries/actions";
import type { ChatMessage, Entry } from "@/lib/db/types";

// How many recent chat rows to send to the parser as context. Enough for a
// couple of exchanges, without dragging the whole visible history into
// every request's token cost.
const CONTEXT_ROWS = 6;

const EDIT_CANDIDATE_LIMIT = 5;

// Nothing typed by hand into a capture box comes close to this. It exists to
// bound what a single request can cost: `message` is forwarded to a paid LLM
// call, so an unbounded string is an unbounded bill.
const MAX_MESSAGE_LENGTH = 2000;

// created_at defaults to now(), which is the TRANSACTION timestamp: both rows
// of a single insert get an identical value, leaving their relative order
// undefined once the thread is reloaded from the DB. Stamping them a
// millisecond apart is what keeps a reply below the message it answers.
function chatTimestamps(): { userAt: string; assistantAt: string } {
  const t = Date.now();
  return { userAt: new Date(t).toISOString(), assistantAt: new Date(t + 1).toISOString() };
}

// Edits never auto-apply: the model proposes, the user confirms (and can
// tweak the fields first) via PendingEditCard in ChatCapture. "new-fallback"
// covers both "couldn't find a match" and "found candidates but wasn't
// confident in any of them": same UI either way, prefilled as a new entry
// instead of an update.
export type PendingEdit =
  | { kind: "edit"; entryId: string; currentTitle: string; fields: EntryEditFields }
  | { kind: "new-fallback"; fields: EntryEditFields };

export type SendCaptureMessageResult =
  | {
      status: "applied";
      userMessage: ChatMessage;
      assistantMessage: ChatMessage;
      entries: Entry[];
      flagged: boolean;
    }
  | {
      status: "pending";
      userMessage: ChatMessage;
      assistantMessage: ChatMessage;
      pending: PendingEdit;
    };

export async function sendCaptureMessage(
  message: string,
  opts: { after?: string } = {},
): Promise<SendCaptureMessageResult> {
  const text = message.trim();
  if (!text) throw new Error("message is required");
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error("message is too long");

  // Before the OpenRouter call below, not after: see requireAllowedUser.
  const user = await requireAllowedUser();
  const supabase = await createClient();

  // `after`: set when the user hit "restart chat". Excludes everything before
  // that moment from context, same as the staleness cutoff below but drawn
  // explicitly instead of by elapsed time.
  let recentQuery = supabase
    .from("capture_chat")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    // Same tiebreaker as getRecentChatMessages, mirrored: newest first here,
    // so within a shared timestamp the reply is the newer of the pair.
    .order("role", { ascending: true })
    .limit(CONTEXT_ROWS);
  if (opts.after) recentQuery = recentQuery.gt("created_at", opts.after);
  const { data: recentRows, error: recentError } = await recentQuery;
  if (recentError) throw new Error(recentError.message);

  const recent = ((recentRows as ChatMessage[]) ?? []).slice().reverse();
  const lastMessageAt = recent.length > 0 ? new Date(recent[recent.length - 1].created_at).getTime() : null;
  const isStale = lastMessageAt === null || Date.now() - lastMessageAt > CHAT_SESSION_WINDOW_MS;
  const context: ChatTurn[] = isStale ? [] : recent.map((m) => ({ role: m.role, content: m.content }));

  const parsed = await parseMessage(text, context);

  if (parsed.intent === "edit") {
    const fallbackFields = (): EntryEditFields => ({
      type: "log",
      category: "other",
      title: text.slice(0, 120),
      body: null,
      dueAt: null,
      amount: null,
      currency: null,
    });

    let pending: PendingEdit;
    let reply: string;

    const candidateRows = await searchEntriesForEdit(user.id, parsed.editQuery, EDIT_CANDIDATE_LIMIT);

    if (candidateRows.length === 0) {
      pending = { kind: "new-fallback", fields: fallbackFields() };
      reply = "couldn't find an entry to edit, want me to log this as new instead?";
    } else {
      const candidates: EditCandidate[] = candidateRows.map((e) => ({
        id: e.id,
        type: e.type,
        category: e.category,
        title: e.title,
        body: e.body,
        dueAt: e.due_at,
        amount: e.amount,
        currency: e.currency,
        status: e.status,
      }));
      const resolution = await resolveEdit(text, candidates);
      const matched = candidateRows.find((c) => c.id === resolution.matchedId);

      if (!matched) {
        pending = { kind: "new-fallback", fields: fallbackFields() };
        reply = "couldn't tell which one you meant, want me to log this as new instead?";
      } else {
        const u = resolution.updates;
        const fields: EntryEditFields = {
          type: u.type ?? matched.type,
          category: u.category ?? matched.category,
          title: u.title ?? matched.title,
          body: u.body !== undefined ? u.body : matched.body,
          dueAt: u.dueAt !== undefined ? u.dueAt : matched.due_at,
          amount: u.amount !== undefined ? u.amount : matched.amount,
          currency: u.currency !== undefined ? u.currency : matched.currency,
          status: u.status,
        };
        pending = { kind: "edit", entryId: matched.id, currentTitle: matched.title, fields };
        reply = resolution.uncertain ? `${resolution.reply} (double check this one)` : resolution.reply;
      }
    }

    const { userAt, assistantAt } = chatTimestamps();
    const { data: insertedRows, error: chatError } = await supabase
      .from("capture_chat")
      .insert([
        { user_id: user.id, role: "user", content: text, entry_id: null, created_at: userAt },
        { user_id: user.id, role: "assistant", content: reply, entry_id: null, created_at: assistantAt },
      ])
      .select();
    if (chatError) throw new Error(chatError.message);
    const [userMessage, assistantMessage] = insertedRows as ChatMessage[];

    return { status: "pending", userMessage, assistantMessage, pending };
  }

  const rows = parsed.entries.map((e) => ({
    user_id: user.id,
    type: e.type,
    category: e.category,
    title: e.title,
    body: e.body,
    status: e.type === "task" ? "open" : null,
    due_at: e.type === "task" ? e.dueAt : null,
    occurred_at: e.occurredAt ?? new Date().toISOString(),
    amount: e.amount,
    currency: e.currency,
    needs_review: e.uncertainFields.length > 0,
  }));
  const { data, error } = await supabase.from("entries").insert(rows).select();
  if (error) throw new Error(error.message);
  const entries = data as Entry[];
  const flagged = entries.some((e) => e.needs_review);

  const { userAt, assistantAt } = chatTimestamps();
  const { data: insertedRows, error: chatError } = await supabase
    .from("capture_chat")
    .insert([
      { user_id: user.id, role: "user", content: text, entry_id: null, created_at: userAt },
      {
        user_id: user.id,
        role: "assistant",
        content: parsed.reply,
        entry_id: entries[0]?.id ?? null,
        created_at: assistantAt,
      },
    ])
    .select();
  if (chatError) throw new Error(chatError.message);
  const [userMessage, assistantMessage] = insertedRows as ChatMessage[];

  revalidatePath("/");
  revalidatePath("/entries");

  return { status: "applied", userMessage, assistantMessage, entries, flagged };
}
