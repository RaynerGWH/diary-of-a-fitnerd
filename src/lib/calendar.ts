import { sgtDateKey, sgtDayEnd, sgtDaysBetween, taskDueHasTime } from "./time";
import type { Entry } from "./db/types";

// The single definition of overdue, shared by the card and the calendar dots
// so the two can never disagree.
//
// A task due on a date with no time is due all of that day, and is stored at
// SGT midnight. Comparing instants would mark it overdue one second into the
// very day it is due, so the comparison drops to day granularity unless a real
// time was given.
export function isOverdue(
  entry: Pick<Entry, "type" | "status" | "due_at">,
  now: Date = new Date(),
): boolean {
  if (entry.type !== "task" || entry.status !== "open" || !entry.due_at) return false;
  if (!taskDueHasTime(entry.due_at)) return sgtDaysBetween(now, entry.due_at) < 0;
  return Date.parse(entry.due_at) < now.getTime();
}

// Bounds what one message can insert. "Every monday" with a far-off end date
// is a plausible thing to type, and each occurrence is a real row.
export const MAX_SERIES_OCCURRENCES = 60;

// Recurring events are materialized rather than computed from a rule, so each
// occurrence is an ordinary row: independently editable, tickable, deletable,
// and searchable. Storage is free at this scale and every hard recurrence
// problem (edit this one or all, exceptions, per-instance state) disappears.
export function expandWeekly(
  startIso: string,
  endsAtIso: string | null,
  untilKey: string,
): { occurredAt: string; endsAt: string | null }[] {
  // A fixed week in milliseconds is exact here because Singapore has no DST,
  // so the wall-clock time never drifts across occurrences.
  const WEEK_MS = 7 * 86_400_000;
  const start = Date.parse(startIso);
  const duration = endsAtIso ? Date.parse(endsAtIso) - start : null;
  const limit = Date.parse(sgtDayEnd(untilKey));

  const out: { occurredAt: string; endsAt: string | null }[] = [];
  for (let i = 0; i < MAX_SERIES_OCCURRENCES; i++) {
    const at = start + i * WEEK_MS;
    // The first occurrence always lands, even if the end date parses to
    // something before it, so a bad rule degrades to one entry instead of
    // silently dropping what the user just said.
    if (i > 0 && at > limit) break;
    out.push({
      occurredAt: new Date(at).toISOString(),
      endsAt: duration !== null ? new Date(at + duration).toISOString() : null,
    });
  }
  return out;
}

export type MonthCell = { key: string; inMonth: boolean };

// Day keys are naked "YYYY-MM-DD" strings, so all the grid arithmetic below
// runs in UTC on purpose: there is no instant involved, and treating a date as
// a date rather than a timestamp is what keeps the grid free of offset bugs.
function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Monday-first, matching how a week is read here.
function weekdayIndex(key: string): number {
  return (new Date(`${key}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

// Always six rows. A fixed height stops the grid resizing as you page through
// months, which otherwise shifts the agenda underneath it up and down.
export function buildMonthGrid(year: number, month: number): MonthCell[][] {
  const first = monthKey(year, month);
  const gridStart = addDays(first, -weekdayIndex(first));
  const prefix = `${year}-${String(month).padStart(2, "0")}`;

  const weeks: MonthCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: MonthCell[] = [];
    for (let d = 0; d < 7; d++) {
      const key = addDays(gridStart, w * 7 + d);
      week.push({ key, inMonth: key.startsWith(prefix) });
    }
    weeks.push(week);
  }
  return weeks;
}

// Buckets entries onto the SGT day they belong to. The range filter already
// used SGT bounds, so this only has to agree with it, and sgtDateKey is the
// single definition both sides share.
export function groupByDay(entries: Entry[]): Map<string, Entry[]> {
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!e.calendar_at) continue;
    const key = sgtDateKey(e.calendar_at);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(e);
    else byDay.set(key, [e]);
  }
  return byDay;
}

// All-day entries first, then by time. Within the same time, tasks lead: a
// deadline is the thing you want to see before the events around it.
export function sortForDay(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
    const at = a.calendar_at ?? "";
    const bt = b.calendar_at ?? "";
    if (at !== bt) return at < bt ? -1 : 1;
    if (a.type !== b.type) return a.type === "task" ? -1 : 1;
    return 0;
  });
}
