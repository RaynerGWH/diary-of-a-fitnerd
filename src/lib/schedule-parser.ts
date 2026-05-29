// Parse a free-form FF weekly schedule pasted by the user.
//
// Accepts a loose, line-by-line format. Lines that start with a day name
// switch the active day. Subsequent lines are class rows:
//
//   Mon
//   06:30  HIIT 45  Jess  45
//   18:00  Spin     Anna  45
//   Tue
//   07:00  Yoga     Mira  60
//
// Columns are whitespace-separated. Anything beyond column 4 is folded back
// into the instructor field. Time accepts HH:MM (24h) or H:MMam/pm.

export type ParsedClass = {
  day_of_week: number; // 0..6, Sun=0
  start_time: string;  // HH:MM:SS
  name: string;
  instructor: string | null;
  duration_min: number | null;
};

const DAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function parseTime(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/.exec(s);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (h > 23 || mins > 59) return null;
  return `${h.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:00`;
}

export function parseSchedule(text: string): ParsedClass[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: ParsedClass[] = [];
  let day = -1;
  for (const line of lines) {
    const lowFirst = line.split(/\s+/)[0].toLowerCase().replace(/[,:]$/, "");
    if (lowFirst in DAYS) {
      day = DAYS[lowFirst];
      continue;
    }
    if (day < 0) continue;
    const parts = line.split(/\s{2,}|\t+/).map((p) => p.trim()).filter(Boolean);
    // Fallback: split on whitespace if there were no multi-space separators.
    const cols = parts.length >= 2 ? parts : line.split(/\s+/);
    if (cols.length < 2) continue;
    const time = parseTime(cols[0]);
    if (!time) continue;
    const name = cols[1];
    const instructor = cols[2] ?? null;
    const lastNumeric = cols[cols.length - 1];
    const duration = /^\d+$/.test(lastNumeric) ? parseInt(lastNumeric, 10) : null;
    out.push({
      day_of_week: day,
      start_time: time,
      name,
      instructor: instructor && !/^\d+$/.test(instructor) ? instructor : null,
      duration_min: duration,
    });
  }
  return out;
}
