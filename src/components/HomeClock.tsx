"use client";

import { useEffect, useState } from "react";
import { formatDayHeading, formatEntryTime } from "@/lib/format";
import { sgtDateKey } from "@/lib/time";

// Seeded from the server's clock rather than starting empty, so the first
// paint already shows the time and the markup React hydrates against matches
// what the server sent. The effect below takes over from there.
export function HomeClock({ initialIso }: { initialIso: string }) {
  const [now, setNow] = useState(initialIso);

  useEffect(() => {
    const tick = () => setNow(new Date().toISOString());
    // The server's value is a request old by the time it renders, so correct
    // it immediately rather than waiting for the first boundary.
    tick();

    // Aligned to the next minute so the display flips when the minute actually
    // changes, instead of drifting up to 59 seconds behind it.
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => {
        tick();
        interval = setInterval(tick, 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  return (
    <div className="clock d1">
      <div className="clock-date">{formatDayHeading(sgtDateKey(now))}</div>
      <div className="clock-time">{formatEntryTime(now, false)}</div>
    </div>
  );
}
