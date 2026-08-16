"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setJobStatus, deleteJobListing, promoteToTask } from "@/app/jobs/actions";
import { formatRelative, formatDueDate } from "@/lib/format";
import type { JobListing } from "@/lib/db/types";

// Deadlines are date-only, so they are compared against the start of today
// rather than the current instant: a listing closing today is still open.
function deadlineState(deadline: string | null): "none" | "past" | "soon" | "later" {
  if (!deadline) return "none";
  const due = new Date(`${deadline}T23:59:59+08:00`).getTime();
  const now = Date.now();
  if (due < now) return "past";
  if (due - now < 7 * 24 * 60 * 60 * 1000) return "soon";
  return "later";
}

export function JobCard({
  listing,
  variant,
  delayClass,
}: {
  listing: JobListing;
  variant?: "alt";
  delayClass?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(listing.status);
  const [onBoard, setOnBoard] = useState(listing.entry_id !== null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closing = deadlineState(listing.deadline);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "that didn't work, try again");
    } finally {
      setBusy(false);
    }
  }

  async function onStatus(next: typeof status) {
    const previous = status;
    setStatus(next);
    // Dismissing drops the card out of the default view, so it disappears
    // straight away rather than sitting there looking untouched.
    if (next === "dismissed") setRemoved(true);
    try {
      await setJobStatus(listing.id, next);
      router.refresh();
    } catch {
      setStatus(previous);
      setRemoved(false);
    }
  }

  if (removed) return null;

  return (
    <div className={`card ${variant === "alt" ? "alt" : ""} ${delayClass ?? ""}`.trim()}>
      <div className="entry">
        <div className="flex-1 entry-content">
          <div className="t">
            <a href={listing.url} target="_blank" rel="noopener noreferrer">
              {listing.title}
            </a>
          </div>

          {listing.company && (
            <div className="b">
              {listing.company}
              {listing.location ? ` · ${listing.location}` : ""}
            </div>
          )}
          {listing.summary && <div className="b">{listing.summary}</div>}

          <div className="chips">
            {status !== "applied" && (
              <button
                type="button"
                className="chip"
                disabled={busy}
                onClick={() => onStatus("applied")}
              >
                applied
              </button>
            )}
            {status === "new" && (
              <button
                type="button"
                className="chip"
                disabled={busy}
                onClick={() => onStatus("saved")}
              >
                save
              </button>
            )}
            {!onBoard && (
              <button
                type="button"
                className="chip hi"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await promoteToTask(listing.id);
                    setOnBoard(true);
                    setStatus("saved");
                  })
                }
                title="add an application task with this deadline"
              >
                add task
              </button>
            )}
            <button
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => onStatus("dismissed")}
            >
              dismiss
            </button>
          </div>

          {error && <div className="mt-2 text-[13px] text-[color:var(--urgent)]">{error}</div>}

          <div className={`meta ${closing === "past" ? "overdue" : ""}`}>
            <span className="meta-type">{status}</span>
            {listing.deadline && (
              <>
                <span>·</span>
                <span>
                  {closing === "past"
                    ? "closed"
                    : `closes ${formatDueDate(`${listing.deadline}T23:59:59+08:00`)}`}
                </span>
              </>
            )}
            {closing === "soon" && (
              <>
                <span>·</span>
                <span>this week</span>
              </>
            )}
            <span>·</span>
            <span>found {formatRelative(listing.created_at)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => run(() => deleteJobListing(listing.id))}
          disabled={busy}
          aria-label="delete listing"
          className="shrink-0 text-[color:var(--urgent)] text-[13px]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
