"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LiveBanner } from "./LiveBanner";
import type { WorkoutWithMeta } from "@/lib/db/queries";

export function DashboardLive({
  initial,
  currentUserId,
}: {
  initial: WorkoutWithMeta[];
  currentUserId: string;
}) {
  const [active, setActive] = useState(initial);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("dashboard-active-workouts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workouts" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  useEffect(() => setActive(initial), [initial]);

  if (active.length === 0) return null;

  return (
    <>
      {active.map((w) => (
        <LiveBanner
          key={w.id}
          workout={w}
          peekHref={w.user_id === currentUserId ? `/workout/${w.id}` : `/workout/${w.id}/peek`}
        />
      ))}
    </>
  );
}
