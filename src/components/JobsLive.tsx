"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Same mechanism as EntriesLive, pointed at job_listings. This is what makes
// the 10am connector run appear on an open /jobs tab without a reload.
export function JobsLive({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("job-listings-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_listings", filter: `user_id=eq.${userId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return null;
}
