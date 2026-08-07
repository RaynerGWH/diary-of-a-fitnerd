import { createClient } from "@/lib/supabase/server";
import type { Entry, EntryType, UUID } from "./types";

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

// Notes/logs/events that happened today.
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

export async function getEntries(
  userId: UUID,
  opts: { category?: string; type?: EntryType; limit?: number } = {},
): Promise<Entry[]> {
  const supabase = await createClient();
  let q = supabase.from("entries").select("*").eq("user_id", userId);
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.type) q = q.eq("type", opts.type);
  q = q.order("occurred_at", { ascending: false }).limit(opts.limit ?? 50);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Entry[]) ?? [];
}

export async function getOpenTaskCount(userId: UUID): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("entries")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "task")
    .eq("status", "open");
  if (error) throw error;
  return count ?? 0;
}

// Day-streak: consecutive calendar days (back from today) with at least one
// entry logged. Uses the user's *local* date.
export async function getDayStreak(userId: UUID): Promise<number> {
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const { data, error } = await supabase
    .from("entries")
    .select("occurred_at")
    .eq("user_id", userId)
    .gte("occurred_at", since.toISOString())
    .order("occurred_at", { ascending: false });
  if (error) throw error;

  const days = new Set<string>();
  for (const row of (data as { occurred_at: string }[] | null) ?? []) {
    const d = new Date(row.occurred_at);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (days.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      // Allow today to be empty (only break the streak if yesterday is empty too).
      if (streak === 0) {
        cursor.setDate(cursor.getDate() - 1);
        const yKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
        if (days.has(yKey)) {
          streak = 1;
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
      }
      break;
    }
  }
  return streak;
}
