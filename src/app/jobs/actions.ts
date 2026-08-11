"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAllowedUser } from "@/lib/auth/require-user";
import { JOB_STATUSES, type JobStatus } from "@/lib/db/types";

export async function setJobStatus(listingId: string, next: JobStatus) {
  const user = await requireAllowedUser();
  if (!JOB_STATUSES.includes(next)) throw new Error("unknown status");

  const supabase = await createClient();
  const { error } = await supabase
    .from("job_listings")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", listingId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/jobs");
}

// Deleting is rarer than dismissing on purpose: a dismissed listing still
// blocks tomorrow's scrape from re-adding it, and a deleted one does not.
export async function deleteJobListing(listingId: string) {
  const user = await requireAllowedUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("job_listings")
    .delete()
    .eq("id", listingId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/jobs");
}

// Promotes a listing into a real task on the board, so an application with a
// deadline lands on the calendar alongside everything else. The link back is
// recorded on the listing so it can't be promoted twice.
export async function promoteToTask(listingId: string) {
  const user = await requireAllowedUser();
  const supabase = await createClient();

  const { data: listing, error: readError } = await supabase
    .from("job_listings")
    .select("*")
    .eq("id", listingId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!listing) throw new Error("listing not found");
  if (listing.entry_id) throw new Error("already on the board");

  const title = listing.company ? `Apply: ${listing.title} @ ${listing.company}` : `Apply: ${listing.title}`;

  const { data: entry, error: insertError } = await supabase
    .from("entries")
    .insert({
      user_id: user.id,
      type: "task",
      category: "work",
      title,
      body: [listing.location, listing.url].filter(Boolean).join("\n"),
      status: "open",
      // A date-only deadline is stored as the end of that day so the task is
      // not marked overdue from midnight onwards on the day it is due.
      due_at: listing.deadline ? `${listing.deadline}T23:59:59+08:00` : null,
    })
    .select("*")
    .single();
  if (insertError) throw new Error(insertError.message);

  const { error: linkError } = await supabase
    .from("job_listings")
    .update({ entry_id: entry.id, status: "saved", updated_at: new Date().toISOString() })
    .eq("id", listingId)
    .eq("user_id", user.id);
  if (linkError) throw new Error(linkError.message);

  revalidatePath("/jobs");
  revalidatePath("/");
  revalidatePath("/entries");
}
