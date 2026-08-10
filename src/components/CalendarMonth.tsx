"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EntryCard } from "./EntryCard";
import { addMonths, buildMonthGrid, groupByDay, sortForDay } from "@/lib/calendar";
import { formatDayHeading } from "@/lib/format";
import { sgtDateKey } from "@/lib/time";
import type { Entry } from "@/lib/db/types";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const MAX_DOTS = 3;

// Dots are colored by type rather than category: there are only three types,
// and they map onto tokens that already exist. Per-category colors would need
// a palette this design system does not have yet.
function dotClass(entry: Entry): string {
  if (entry.type === "task") {
    const overdue =
      entry.status === "open" && entry.calendar_at !== null && new Date(entry.calendar_at) < new Date();
    return overdue ? "dot overdue" : "dot task";
  }
  return entry.type === "event" ? "dot event" : "dot log";
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function CalendarMonth({
  year,
  month,
  entries,
}: {
  year: number;
  month: number;
  entries: Entry[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const today = sgtDateKey();
  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const byDay = useMemo(() => groupByDay(entries), [entries]);

  // Land on today when it's in view, otherwise the 1st. Paging to another
  // month re-mounts this via the key in the page, so the selection follows.
  const [selected, setSelected] = useState(() =>
    today.startsWith(`${year}-${String(month).padStart(2, "0")}`)
      ? today
      : `${year}-${String(month).padStart(2, "0")}-01`,
  );

  const dayEntries = sortForDay(byDay.get(selected) ?? []);

  function goToMonth(delta: number) {
    const next = addMonths(year, month, delta);
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", `${next.year}-${String(next.month).padStart(2, "0")}`);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className={`cal ${isPending ? "results-stale" : ""}`.trim()}>
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={() => goToMonth(-1)} aria-label="previous month">
          &#9666;
        </button>
        <div className="cal-title">{monthLabel(year, month)}</div>
        <button type="button" className="cal-nav" onClick={() => goToMonth(1)} aria-label="next month">
          &#9656;
        </button>
      </div>

      <div className="cal-grid" role="grid">
        {DOW.map((d, i) => (
          <div key={i} className="cal-dow" aria-hidden="true">
            {d}
          </div>
        ))}
        {weeks.flat().map((cell) => {
          const dayItems = byDay.get(cell.key) ?? [];
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => setSelected(cell.key)}
              className={[
                "cal-day",
                cell.inMonth ? "" : "muted",
                cell.key === today ? "today" : "",
                cell.key === selected ? "on" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={`${formatDayHeading(cell.key)}, ${dayItems.length} entries`}
              aria-pressed={cell.key === selected}
            >
              <span className="cal-num">{Number(cell.key.slice(8))}</span>
              <span className="cal-dots">
                {dayItems.slice(0, MAX_DOTS).map((e) => (
                  <span key={e.id} className={dotClass(e)} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="label cal-agenda-label">{formatDayHeading(selected)}</div>
      {dayEntries.length === 0 ? (
        <div className="card alt d2">
          <div className="text-[14px] text-[color:var(--muted)]">nothing on this day.</div>
        </div>
      ) : (
        dayEntries.map((e, i) => (
          <EntryCard
            key={e.id}
            entry={e}
            showTime
            variant={i % 2 === 0 ? undefined : "alt"}
            delayClass={`d${Math.min(6, 2 + (i % 4))}`}
          />
        ))
      )}
    </div>
  );
}
