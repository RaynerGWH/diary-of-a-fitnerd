import { createClient } from "@/lib/supabase/server";
import type { ChatMessage, Entry, EntryType, UUID } from "./types";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

// Every open task, regardless of due date: genuinely "outstanding", not
// just "due today or overdue or undated" (that narrower set used to be what
// this returned, which silently hid anything due in the future from the
// "outstanding tasks" section on home). Soonest-due first, undated tasks
// last since they carry no urgency signal.
export async function getOutstandingTasks(userId: UUID): Promise<Entry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .eq("type", "task")
    .eq("status", "open")
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as Entry[]) ?? [];
}

export async function getTodayLogs(userId: UUID): Promise<Entry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .in("type", ["log", "event"])
    .gte("occurred_at", startOfToday().toISOString())
    .lte("occurred_at", endOfToday().toISOString())
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data as Entry[]) ?? [];
}

// Strips characters that are syntactically meaningful to PostgREST's filter
// grammar (would otherwise let a search term like "a,b" inject an extra
// `.or()` condition) and escapes ILIKE wildcards so they match literally.
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()]/g, "").replace(/[%_\\]/g, (m) => `\\${m}`);
}

export async function getEntries(
  userId: UUID,
  opts: { category?: string; type?: EntryType; search?: string; limit?: number } = {},
): Promise<Entry[]> {
  const supabase = await createClient();
  let q = supabase.from("entries").select("*").eq("user_id", userId);
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.type) q = q.eq("type", opts.type);
  if (opts.search?.trim()) {
    const term = sanitizeSearchTerm(opts.search.trim());
    q = q.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
  }
  q = q.order("occurred_at", { ascending: false }).limit(opts.limit ?? 50);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Entry[]) ?? [];
}

// Deterministic candidate lookup for chat-based edits: a plain keyword
// search, not an LLM guessing from memory. The LLM only picks among these
// results and decides what changed (see resolveEdit in lib/ai/parse-entry.ts).
export async function searchEntriesForEdit(userId: UUID, query: string, limit = 5): Promise<Entry[]> {
  const term = sanitizeSearchTerm(query.trim());
  if (!term) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .or(`title.ilike.%${term}%,body.ilike.%${term}%`)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Entry[]) ?? [];
}

// The single definition of "still the same conversation": shared between
// what /capture shows on load (below) and what counts as fresh-enough
// context for the parser (chat-actions.ts). Kept short on purpose: coming
// back after a gap to log something new shouldn't dump you back into a
// stale old thread, and 15 minutes is already the parser's own cutoff for
// treating a message as a continuation rather than something unrelated.
export const CHAT_SESSION_WINDOW_MS = 15 * 60 * 1000;

// Powers the /capture chat's visible history.
export async function getRecentChatMessages(
  userId: UUID,
  windowMs = CHAT_SESSION_WINDOW_MS,
): Promise<ChatMessage[]> {
  const since = new Date(Date.now() - windowMs);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("capture_chat")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true })
    // Tiebreaker for rows written before the timestamps were stamped
    // explicitly (see chatTimestamps in capture/chat-actions.ts): they share a
    // created_at, and "user" sorts after "assistant", so descending puts each
    // message back above the reply it produced.
    .order("role", { ascending: false });
  if (error) throw error;
  return (data as ChatMessage[]) ?? [];
}

