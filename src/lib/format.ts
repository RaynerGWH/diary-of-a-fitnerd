import { SGT_OFFSET, sgtDateKey, sgtDaysBetween, taskDueHasTime } from "./time";
import type { EntryType } from "./db/types";

// All day-boundary comparisons go through SGT day keys rather than the
// machine's clock. These run during SSR too (EntryCard is a client component,
// but Next still renders it on the server), so relying on local time meant the
// server and the browser could disagree about what day it is.
const DAY_MONTH: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  timeZone: "Asia/Singapore",
};

export function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = -sgtDaysBetween(new Date(), date);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-GB", DAY_MONTH);
}

// For due dates, which are usually in the future (formatRelative assumes the past).
export function formatDueDate(iso: string): string {
  const diffDays = sgtDaysBetween(new Date(), iso);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  return new Date(iso).toLocaleDateString("en-GB", DAY_MONTH);
}

// All-day entries carry no meaningful time, so they must never be put through
// a clock formatter: rendering SGT midnight anywhere east or west of +08:00
// shifts them onto the neighbouring day.
export function formatEntryTime(iso: string, allDay: boolean): string {
  if (allDay) return "all day";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  });
}

export function formatTimeRange(startIso: string, endIso: string | null, allDay: boolean): string {
  const start = formatEntryTime(startIso, allDay);
  if (allDay || !endIso) return start;
  return `${start} to ${formatEntryTime(endIso, false)}`;
}

// The single answer to "what goes in the time column" on the calendar agenda
// and the home strip. Tasks read as "due", never "all day": being due on a
// date is not the same thing as filling one, and all-day is an event property.
export function formatAgendaTime(entry: {
  type: EntryType;
  due_at: string | null;
  occurred_at: string;
  calendar_at: string | null;
  ends_at: string | null;
  all_day: boolean;
}): string {
  if (entry.type === "task") {
    if (!entry.due_at) return "due";
    return taskDueHasTime(entry.due_at) ? `due ${formatEntryTime(entry.due_at, false)}` : "due";
  }
  if (entry.all_day) return "all day";
  return formatTimeRange(entry.calendar_at ?? entry.occurred_at, entry.ends_at, false);
}

export function formatDayHeading(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00${SGT_OFFSET}`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Singapore",
  });
}
