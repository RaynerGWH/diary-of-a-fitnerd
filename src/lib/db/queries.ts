// Every read here filters `deleted_at is null`. Agent deletes are soft:
// resolving which entry the user meant is fallible, so those deletes stay
// recoverable rather than destroying a row the model picked wrong. A read
// that forgets the filter shows ghost rows in exactly one view, which is a
// miserable bug to notice.
import { createClient } from "@/lib/supabase/server";
import { sgtDayBounds, sgtMonthBounds } from "@/lib/time";
import type { ChatMessage, Entry, EntryType, JobListing, JobStatus, UUID } from "./types";

// Every open task, regardless of due date: genuinely "outstanding", so
// nothing due later is hidden from home. Soonest-due first, undated tasks
// last since they carry no urgency signal.
export async function getOutstandingTasks(userId: UUID): Promise<Entry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("type", "task")
    .eq("status", "open")
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as Entry[]) ?? [];
}

export async function getTodayLogs(userId: UUID): Promise<Entry[]> {
  // "Today" is the Singapore day, not the server's. This runs on Vercel in
  // UTC, where before 8am SGT the local clock is still on yesterday.
  const { start, end } = sgtDayBounds();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("type", ["log", "event"])
    .gte("occurred_at", start)
    .lte("occurred_at", end)
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
  let q = supabase.from("entries").select("*").eq("user_id", userId).is("deleted_at", null);
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

// Today's schedule: things with a clock time, in the order they happen. Logs
// are excluded here (unlike the calendar grid) because this answers "what is
// coming up", not "what happened", and home already has a "logged today"
// section directly underneath.
export async function getTodaySchedule(userId: UUID): Promise<Entry[]> {
  const { start, end } = sgtDayBounds();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("type", ["event", "task"])
    .gte("calendar_at", start)
    .lte("calendar_at", end)
    .order("calendar_at", { ascending: true });
  if (error) throw error;
  return (data as Entry[]) ?? [];
}

// One indexed range scan over calendar_at, which Postgres derives as due_at
// for tasks and occurred_at for everything else. Undated tasks have a null
// calendar_at and so never come back. Logs are included deliberately: this is
// a journal, and "what did I do on the 3rd" is the question the grid exists to
// answer, so the type filter stays as useful here as it is in the list.
export async function getCalendarMonth(
  userId: UUID,
  year: number,
  month: number,
  opts: { category?: string; type?: EntryType; search?: string } = {},
): Promise<Entry[]> {
  const { start, end } = sgtMonthBounds(year, month);
  const supabase = await createClient();
  let q = supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("calendar_at", start)
    .lt("calendar_at", end);
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.type) q = q.eq("type", opts.type);
  if (opts.search?.trim()) {
    const term = sanitizeSearchTerm(opts.search.trim());
    q = q.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
  }
  const { data, error } = await q.order("calendar_at", { ascending: true });
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
    .is("deleted_at", null)
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

// The jobs board. Dismissed listings are excluded unless asked for by name:
// they are kept rather than deleted so the connector's next run doesn't
// re-add something already turned down, but they are not worth looking at.
export async function getJobListings(
  userId: UUID,
  opts: { status?: JobStatus; limit?: number } = {},
): Promise<JobListing[]> {
  const { status, limit = 100 } = opts;
  const supabase = await createClient();
  let query = supabase.from("job_listings").select("*").eq("user_id", userId);

  if (status) query = query.eq("status", status);
  else query = query.neq("status", "dismissed");

  // Soonest deadline first so anything closing is impossible to miss, with
  // undated listings after them by recency.
  const { data, error } = await query
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as JobListing[]) ?? [];
}

// Drives the counts on the /jobs filter row.
export async function getJobStatusCounts(userId: UUID): Promise<Record<JobStatus, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_listings")
    .select("status")
    .eq("user_id", userId);
  if (error) throw error;

  const counts: Record<JobStatus, number> = { new: 0, saved: 0, applied: 0, dismissed: 0 };
  for (const row of (data as { status: JobStatus }[]) ?? []) {
    if (row.status in counts) counts[row.status] += 1;
  }
  return counts;
}
