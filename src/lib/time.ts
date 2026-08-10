// Every date boundary in this app is Singapore time, never the machine's.
// Server code runs on Vercel in UTC, so a bare `new Date()` is eight hours
// out: between midnight and 8am SGT the server is still on the previous UTC
// day.
//
// Singapore has no DST and has been permanently UTC+8 for decades, so a fixed
// offset is exactly correct. That is what lets all of this be arithmetic
// instead of a timezone library.
export const SGT_OFFSET = "+08:00";
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

// Shifting the instant by the offset makes the UTC getters read out SGT
// wall-clock values, which is the whole trick the rest of this file leans on.
function shifted(input: Date | string): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Date(d.getTime() + SGT_OFFSET_MS);
}

// "YYYY-MM-DD" for the SGT day an instant falls on. This is the value to
// group by, compare, and use as a React key for anything day-shaped.
export function sgtDateKey(input: Date | string = new Date()): string {
  return shifted(input).toISOString().slice(0, 10);
}

// The absolute instant SGT midnight begins on a given day key. Postgres reads
// the offset, so these are safe to hand straight to a timestamptz filter.
export function sgtDayStart(dateKey: string): string {
  return `${dateKey}T00:00:00.000${SGT_OFFSET}`;
}

export function sgtDayEnd(dateKey: string): string {
  return `${dateKey}T23:59:59.999${SGT_OFFSET}`;
}

export function sgtDayBounds(input: Date | string = new Date()): { start: string; end: string } {
  const key = sgtDateKey(input);
  return { start: sgtDayStart(key), end: sgtDayEnd(key) };
}

// Half-open on purpose: the end is the first instant of the next month, so a
// range filter can use `lt` and never double-count an entry at the boundary.
export function sgtMonthBounds(year: number, month: number): { start: string; end: string } {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: sgtDayStart(monthKey(year, month)),
    end: sgtDayStart(monthKey(nextYear, nextMonth)),
  };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function sgtWeekday(input: Date | string = new Date()): string {
  // timeZone: UTC because the shift has already been applied above.
  return shifted(input).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

// Whole days from one SGT day to another, positive when `to` is later. Built
// from day keys rather than elapsed milliseconds so it counts calendar days,
// not 24-hour blocks.
export function sgtDaysBetween(from: Date | string, to: Date | string): number {
  const a = Date.parse(sgtDayStart(sgtDateKey(from)));
  const b = Date.parse(sgtDayStart(sgtDateKey(to)));
  return Math.round((b - a) / 86_400_000);
}

// Human-readable SGT stamp for the capture parser's prompt, which needs the
// user's wall clock rather than an instant to resolve "tomorrow" against.
// Composes a "YYYY-MM-DD" and an "HH:MM" back into an absolute instant. The
// explicit offset is what stops a bare date parsing as UTC midnight, which is
// 8am here and lands the value eight hours off the date that was picked.
export function sgtInstant(dateKey: string, time = "00:00"): string {
  return `${dateKey}T${time || "00:00"}:00.000${SGT_OFFSET}`;
}

export function sgtTimeOfDay(input: Date | string): string {
  const d = shifted(input);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// Tasks have no all-day flag: that is an event property. A task is simply due
// on a date, and carries a clock time only when one was actually given.
// A date-only due date is written at SGT midnight (by the edit form and by the
// parser), so midnight is the sentinel for "no time was specified".
export function taskDueHasTime(dueAt: string): boolean {
  return sgtTimeOfDay(dueAt) !== "00:00";
}

export function sgtDateTimeLabel(input: Date | string = new Date()): string {
  const d = shifted(input);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.toISOString().slice(0, 10)} ${hh}:${mm}`;
}
