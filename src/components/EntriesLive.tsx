"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Refreshes the page whenever `entries` changes. This is the mechanism that will
// make Telegram-bot captures show up on the dashboard without a manual reload.
export function EntriesLive({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("entries-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "entries", filter: `user_id=eq.${userId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return null;
}
