import { redirect } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { BottomNav } from "@/components/BottomNav";
import { EntryCard } from "@/components/EntryCard";
import { EntriesFilters } from "@/components/EntriesFilters";
import { CalendarMonth } from "@/components/CalendarMonth";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { getCalendarMonth, getEntries } from "@/lib/db/queries";
import { sgtDateKey } from "@/lib/time";
import type { EntryType } from "@/lib/db/types";

const VALID_TYPES: EntryType[] = ["task", "log", "event"];

// "YYYY-MM" from the URL, falling back to the current Singapore month. Parsed
// here rather than trusted, since it comes straight off a query string.
function parseMonth(raw: string | undefined): { year: number; month: number } {
  const matched = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (matched) {
    const year = Number(matched[1]);
    const month = Number(matched[2]);
    if (month >= 1 && month <= 12 && year >= 1970 && year <= 9999) return { year, month };
  }
  const key = sgtDateKey();
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
}

export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    type?: string;
    q?: string;
    view?: string;
    month?: string;
  }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { category, type, q, view, month } = await searchParams;
  const validType = VALID_TYPES.includes(type as EntryType) ? (type as EntryType) : undefined;

  if (view === "calendar") {
    const { year, month: monthNum } = parseMonth(month);
    const entries = await getCalendarMonth(profile.id, year, monthNum, {
      category,
      type: validType,
      search: q,
    });

    return (
      <PhoneFrame nav={<BottomNav active="entries" />}>
        <EntriesFilters>
          {/* Keyed so paging months resets the selected day rather than
              holding a date that is no longer on screen. */}
          <CalendarMonth
            key={`${year}-${monthNum}`}
            year={year}
            month={monthNum}
            entries={entries}
          />
        </EntriesFilters>
      </PhoneFrame>
    );
  }

  const entries = await getEntries(profile.id, { category, type: validType, search: q, limit: 50 });

  return (
    <PhoneFrame nav={<BottomNav active="entries" />}>
      <EntriesFilters>
        {entries.length === 0 ? (
          <div className="card alt d2">
            <div className="text-[14px] text-[color:var(--muted)]">nothing here yet.</div>
          </div>
        ) : (
          entries.map((e, i) => (
            <EntryCard
              key={e.id}
              entry={e}
              variant={i % 2 === 0 ? undefined : "alt"}
              delayClass={`d${Math.min(6, 2 + (i % 4))}`}
            />
          ))
        )}
      </EntriesFilters>
    </PhoneFrame>
  );
}
