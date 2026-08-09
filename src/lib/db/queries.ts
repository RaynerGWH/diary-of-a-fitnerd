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

// No-due-date tasks are included too: undated tasks still need to surface somewhere.
// Open tasks due today or overdue, plus open tasks with no due date at all.
// This is the "what should I look at right now" list on the home screen.
export async function getTodayTasks(userId: UUID): Promise<Entry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .eq("type", "task")
    .eq("status", "open")
    .or(`due_at.is.null,due_at.lte.${endOfToday().toISOString()}`)
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
    .in("type", ["note", "log", "event"])
    .gte("occurred_at", startOfToday().toISOString())
    .lte("occurred_at", endOfToday().toISOString())
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data as Entry[]) ?? [];
}

export async function getRecentEntries(userId: UUID, limit = 20): Promise<Entry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
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

// Powers the /capture chat's visible history. A 3-hour window is enough to
// pick back up a conversation after a reload without dragging in stale turns.
export async function getRecentChatMessages(userId: UUID, hours = 3): Promise<ChatMessage[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("capture_chat")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as ChatMessage[]) ?? [];
}

