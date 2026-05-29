"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";
import type { WorkoutWithMeta } from "@/lib/db/queries";

export function LiveBanner({ workout, peekHref }: { workout: WorkoutWithMeta; peekHref: string }) {
  const [elapsed, setElapsed] = useState(() => secondsSince(workout.started_at));
  useEffect(() => {
    const id = setInterval(() => setElapsed(secondsSince(workout.started_at)), 1000);
    return () => clearInterval(id);
  }, [workout.started_at]);

  const name = workout.profile?.display_name ?? workout.profile?.email ?? "someone";
  const locName = workout.location?.name ?? "—";
  const cls = workout.class?.name ?? workout.title ?? workout.type;

  return (
    <div className="card live-card d1">
      <div className="row1">
        <span className="pulse" />
        <span className="who">{name} is training now</span>
      </div>
      <div className="meta">
        {locName} · {cls} · <span className="timer">{formatDuration(elapsed)} in</span>
      </div>
      <Link className="peek-btn" href={peekHref}>
        peek at the session →
      </Link>
    </div>
  );
}

function secondsSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}
