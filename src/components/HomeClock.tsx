"use client";

import { useEffect, useState } from "react";
import { formatClockTime, formatDayHeading } from "@/lib/format";
import { sgtDateKey } from "@/lib/time";

// Seeded from the server's clock rather than starting empty, so the first
// paint already shows the time and the markup React hydrates against matches
// what the server sent. The effect below takes over from there.
export function HomeClock({ initialIso }: { initialIso: string }) {
  const [now, setNow] = useState(initialIso);

  useEffect(() => {
    // A self-correcting timeout rather than setInterval(1000): each tick
    // re-aims at the next whole second, so the display cannot drift, and a
    // backgrounded tab that throttles timers snaps straight back on resume.
    // The first call also fires immediately, since the server's value is
    // already a request old by the time it paints.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date().toISOString());
      timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="clock d1">
      <div className="clock-date">{formatDayHeading(sgtDateKey(now))}</div>
      <div className="clock-time">{formatClockTime(now)}</div>
    </div>
  );
}
