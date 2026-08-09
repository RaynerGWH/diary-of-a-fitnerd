"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toggleTaskStatus, deleteEntry } from "@/app/entries/actions";
import { formatRelative, formatDueDate } from "@/lib/format";
import type { Entry, EntryStatus } from "@/lib/db/types";

const TYPE_LABEL: Record<Entry["type"], string> = {
  task: "task",
  note: "note",
  log: "log",
  event: "event",
};

export function EntryCard({
  entry,
  variant,
  delayClass,
}: {
  entry: Entry;
  variant?: "alt";
  delayClass?: string;
}) {
  const router = useRouter();
  // Optimistic: flip instantly on click, reconcile with the server in the
  // background instead of waiting on the round trip before updating anything.
  const [status, setStatus] = useState<EntryStatus | null>(entry.status);
  const [removed, setRemoved] = useState(false);

  useEffect(() => setStatus(entry.status), [entry.status]);

  const isTask = entry.type === "task";
  const isDone = status === "done";
  const overdue =
    isTask && !isDone && entry.due_at !== null && new Date(entry.due_at) < new Date();

  async function onToggle() {
    const next = isDone ? "open" : "done";
    setStatus(next);
    try {
      await toggleTaskStatus(entry.id, next);
      router.refresh();
    } catch {
      setStatus(entry.status);
    }
  }

  async function onDelete() {
    setRemoved(true);
    try {
      await deleteEntry(entry.id);
      router.refresh();
    } catch {
      setRemoved(false);
    }
  }

  if (removed) return null;

  return (
    <div className={`card ${variant === "alt" ? "alt" : ""} ${delayClass ?? ""}`.trim()}>
      <div className="entry">
        {isTask ? (
          <button
            type="button"
            className={`check ${isDone ? "done" : ""}`}
            onClick={onToggle}
            aria-label={isDone ? "mark open" : "mark done"}
          >
            {isDone ? "✓" : ""}
          </button>
        ) : null}
        <div className="flex-1">
          <div className={`t ${isDone ? "done" : ""}`}>{entry.title}</div>
          {entry.body && <div className="b">{entry.body}</div>}
          {entry.needs_review && (
            <div className="chips">
              <span className="chip warn">needs review</span>
            </div>
          )}
          <div className={`meta ${overdue ? "overdue" : ""}`}>
            <span>{TYPE_LABEL[entry.type]}</span>
            <span>·</span>
            <span>{entry.category}</span>
            {entry.amount !== null && (
              <>
                <span>·</span>
                <span>
                  {entry.currency ?? ""} {entry.amount}
                </span>
              </>
            )}
            {isTask && entry.due_at ? (
              <>
                <span>·</span>
                <span>{overdue ? "overdue" : `due ${formatDueDate(entry.due_at)}`}</span>
              </>
            ) : (
              <>
                <span>·</span>
                <span>{formatRelative(entry.occurred_at)}</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label="delete entry"
          className="text-[color:var(--muted)] text-[13px]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
