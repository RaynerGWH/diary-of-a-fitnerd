"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";

export function WorkoutTimer({ startedAt }: { startedAt: string }) {
  const [secs, setSecs] = useState(() =>
    Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)),
  );
  useEffect(() => {
    const id = setInterval(
      () => setSecs(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))),
      1000,
    );
    return () => clearInterval(id);
  }, [startedAt]);
  return <span className="timer">{formatDuration(secs)}</span>;
}
