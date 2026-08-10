import { sortForDay } from "@/lib/calendar";
import { formatAgendaTime } from "@/lib/format";
import type { Entry } from "@/lib/db/types";

// Renders nothing on an empty day rather than an empty-state card. Most days
// have nothing scheduled, and a permanent "nothing today" box on the home
// screen is clutter the other sections already cover.
export function HomeSchedule({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return null;

  return (
    <>
      <div className="label d2">today</div>
      <div className="card alt d2 schedule">
        {sortForDay(entries).map((e) => (
          <div key={e.id} className="schedule-row">
            <span className="schedule-time">{formatAgendaTime(e)}</span>
            <span className={`schedule-title ${e.status === "done" ? "done" : ""}`.trim()}>
              {e.title}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
