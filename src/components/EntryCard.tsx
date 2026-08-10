"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  toggleTaskStatus,
  deleteEntry,
  updateEntry,
  clearNeedsReview,
  deleteSeries,
} from "@/app/entries/actions";
import { formatRelative, formatDueDate, formatTimeRange } from "@/lib/format";
import { EntryEditForm, formFromEntryLike, fieldsFromForm, type EditForm } from "./EntryEditForm";
import type { Entry, EntryStatus } from "@/lib/db/types";

const TYPE_LABEL: Record<Entry["type"], string> = {
  task: "task",
  log: "log",
  event: "event",
};

export function EntryCard({
  entry,
  variant,
  delayClass,
  // Calendar agenda rows already sit under a date heading, so a relative
  // "3h ago" there is noise. The clock time is the useful part.
  showTime,
}: {
  entry: Entry;
  variant?: "alt";
  delayClass?: string;
  showTime?: boolean;
}) {
  const router = useRouter();
  const [localEntry, setLocalEntry] = useState(entry);
  const [status, setStatus] = useState<EntryStatus | null>(entry.status);
  const [needsReview, setNeedsReview] = useState(entry.needs_review);
  const [removed, setRemoved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(() => formFromEntryLike(entry));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setLocalEntry(entry);
    setStatus(entry.status);
    setNeedsReview(entry.needs_review);
  }, [entry]);

  const isTask = localEntry.type === "task";
  const isDone = status === "done";
  const overdue =
    isTask && !isDone && localEntry.due_at !== null && new Date(localEntry.due_at) < new Date();

  async function onToggle() {
    const next = isDone ? "open" : "done";
    setStatus(next);
    try {
      await toggleTaskStatus(localEntry.id, next);
      router.refresh();
    } catch {
      setStatus(entry.status);
    }
  }

  async function onDelete() {
    setRemoved(true);
    try {
      await deleteEntry(localEntry.id);
      router.refresh();
    } catch {
      setRemoved(false);
    }
  }

  // Two taps rather than a confirm dialog: the first turns the badge into the
  // question, the second answers it. Deleting a whole timetable by accident is
  // not recoverable, and this app has no modals.
  const [confirmSeries, setConfirmSeries] = useState(false);

  async function onDeleteSeries() {
    const seriesId = localEntry.series_id;
    if (!seriesId) return;
    setRemoved(true);
    try {
      await deleteSeries(seriesId);
      router.refresh();
    } catch {
      setRemoved(false);
      setConfirmSeries(false);
    }
  }

  async function onClearReview() {
    setNeedsReview(false);
    try {
      await clearNeedsReview(localEntry.id);
      router.refresh();
    } catch {
      setNeedsReview(true);
    }
  }

  function startEdit() {
    setForm(formFromEntryLike(localEntry));
    setSaveError(null);
    setEditing(true);
  }

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const fields = fieldsFromForm(form);
      const updated = await updateEntry(localEntry.id, {
        ...fields,
        title: fields.title || localEntry.title,
      });
      setLocalEntry(updated);
      setStatus(updated.status);
      setNeedsReview(updated.needs_review);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "couldn't save that, try again");
    } finally {
      setSaving(false);
    }
  }

  if (removed) return null;

  return (
    <div className={`card ${variant === "alt" ? "alt" : ""} ${delayClass ?? ""}`.trim()}>
      {editing ? (
        <div className="flex flex-col gap-3">
          <EntryEditForm form={form} onChange={setForm} />

          {saveError && <div className="text-[13px] text-[color:var(--urgent)]">{saveError}</div>}

          <div className="flex gap-2">
            <button
              type="button"
              className="sticker-btn primary"
              onClick={onSave}
              disabled={saving || !form.title.trim()}
            >
              {saving ? "saving..." : "save"}
            </button>
            <button
              type="button"
              className="sticker-btn"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              cancel
            </button>
          </div>
        </div>
      ) : (
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
          <div
            className="flex-1 entry-content"
            onClick={startEdit}
            role="button"
            tabIndex={0}
            aria-label={`edit ${localEntry.title}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                startEdit();
              }
            }}
          >
            <div className={`t ${isDone ? "done" : ""}`}>{localEntry.title}</div>
            {localEntry.body && <div className="b">{localEntry.body}</div>}
            {localEntry.series_id && (
              <div className="chips">
                <button
                  type="button"
                  className={`chip ${confirmSeries ? "warn" : ""}`.trim()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirmSeries) onDeleteSeries();
                    else setConfirmSeries(true);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  title="this event repeats weekly"
                >
                  {confirmSeries ? "delete every one?" : "repeats"}
                </button>
              </div>
            )}
            {needsReview && (
              <div className="chips">
                {/* Propagation stops here so confirming doesn't also trip the
                    card's own open-to-edit handlers. */}
                <button
                  type="button"
                  className="chip warn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearReview();
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  aria-label={`mark "${localEntry.title}" as reviewed`}
                  title="tap to confirm this looks right"
                >
                  needs review · tap to clear
                </button>
              </div>
            )}
            <div className={`meta ${overdue ? "overdue" : ""}`}>
              <span className="meta-type">{TYPE_LABEL[localEntry.type]}</span>
              <span>·</span>
              <span>{localEntry.category}</span>
              {localEntry.amount !== null && (
                <>
                  <span>·</span>
                  <span>
                    {localEntry.currency ?? ""} {localEntry.amount}
                  </span>
                </>
              )}
              {showTime ? (
                <>
                  <span>·</span>
                  <span>
                    {formatTimeRange(
                      localEntry.calendar_at ?? localEntry.occurred_at,
                      localEntry.ends_at,
                      localEntry.all_day,
                    )}
                  </span>
                  {overdue && (
                    <>
                      <span>·</span>
                      <span>overdue</span>
                    </>
                  )}
                </>
              ) : isTask && localEntry.due_at ? (
                <>
                  <span>·</span>
                  <span>{overdue ? "overdue" : `due ${formatDueDate(localEntry.due_at)}`}</span>
                </>
              ) : (
                <>
                  <span>·</span>
                  <span>{formatRelative(localEntry.occurred_at)}</span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onDelete}
            aria-label="delete entry"
            className="text-[color:var(--urgent)] text-[13px]"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
