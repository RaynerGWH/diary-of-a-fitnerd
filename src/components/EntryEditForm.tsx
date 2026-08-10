"use client";

import { CATEGORIES, type EntryType } from "@/lib/db/types";
import { sgtDateKey, sgtInstant, sgtTimeOfDay, taskDueHasTime } from "@/lib/time";

// Dates and times are held as the separate strings the inputs actually use,
// and only composed into an instant on save. Keeping a half-typed date as a
// Date would mean guessing at what an incomplete value means.
export type EditForm = {
  type: EntryType;
  category: string;
  title: string;
  body: string;
  // Tasks. There is no all-day flag here on purpose: that is an event
  // property. A task is due on a date, optionally at a time.
  dueDate: string;
  dueTime: string;
  // Events and logs.
  startDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  amount: string;
  currency: string;
};

// A native <input type="time"> renders 12- or 24-hour by browser locale, with
// no way to force it, and the am/pm suffix gets clipped inside the phone
// frame. A select owns its own labels, so the clock is 24-hour everywhere.
const TIME_STEP_MINUTES = 15;
const TIME_OPTIONS: string[] = [];
for (let m = 0; m < 24 * 60; m += TIME_STEP_MINUTES) {
  TIME_OPTIONS.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
}

function TimeSelect({
  value,
  onChange,
  disabled,
  emptyLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  emptyLabel: string;
}) {
  // The chat parser can produce a time off the 15-minute grid ("14:05"). It is
  // added as its own option rather than dropped, so opening the form never
  // silently rounds or clears a time the user did not touch.
  const options =
    value && !TIME_OPTIONS.includes(value) ? [...TIME_OPTIONS, value].sort() : TIME_OPTIONS;

  return (
    <select
      className="field when-time"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

const TYPE_LABEL: Record<EntryType, string> = {
  task: "task",
  log: "log",
  event: "event",
};
const TYPES: EntryType[] = ["task", "log", "event"];

export type EntryLike = {
  type: EntryType;
  category: string;
  title: string;
  body: string | null;
  due_at: string | null;
  occurred_at?: string | null;
  ends_at?: string | null;
  all_day?: boolean;
  amount: number | null;
  currency: string | null;
};

export function formFromEntryLike(e: EntryLike): EditForm {
  const allDay = e.all_day ?? false;
  return {
    type: e.type,
    category: e.category,
    title: e.title,
    body: e.body ?? "",
    dueDate: e.due_at ? sgtDateKey(e.due_at) : "",
    // Midnight means no time was given, so the field stays empty rather than
    // showing a 00:00 the user never typed.
    dueTime: e.due_at && taskDueHasTime(e.due_at) ? sgtTimeOfDay(e.due_at) : "",
    startDate: e.occurred_at ? sgtDateKey(e.occurred_at) : "",
    startTime: e.occurred_at && !allDay ? sgtTimeOfDay(e.occurred_at) : "",
    endTime: e.ends_at && !allDay ? sgtTimeOfDay(e.ends_at) : "",
    allDay,
    amount: e.amount !== null ? String(e.amount) : "",
    currency: e.currency ?? "SGD",
  };
}

// Inverse of formFromEntryLike: turns the (string-based, input-friendly) form
// state back into the typed fields the server actions expect.
// Only tasks and events carry timings. A log is a record of something that
// happened; occurredAt stays undefined for one so editing it never rewrites
// when it happened, which would move it to a different day on the calendar.
export function fieldsFromForm(form: EditForm) {
  const isEvent = form.type === "event";
  const startDate = form.startDate || sgtDateKey();

  return {
    type: form.type,
    category: form.category.trim().toLowerCase() || "other",
    title: form.title.trim(),
    body: form.body.trim() || null,
    dueAt: form.type === "task" && form.dueDate ? sgtInstant(form.dueDate, form.dueTime) : null,
    occurredAt: isEvent ? sgtInstant(startDate, form.allDay ? "00:00" : form.startTime) : undefined,
    // An end without a start time is not a range, and an end at or before the
    // start is not a duration, so both collapse to null instead of being
    // stored as something the calendar would have to defend against.
    endsAt:
      isEvent && !form.allDay && form.startTime && form.endTime && form.endTime > form.startTime
        ? sgtInstant(startDate, form.endTime)
        : null,
    allDay: isEvent ? form.allDay : false,
    amount: form.amount.trim() ? Number(form.amount) : null,
    currency: form.amount.trim() ? form.currency.trim().toUpperCase() || "SGD" : null,
  };
}

// Shared by EntryCard's inline edit and ChatCapture's pending-edit
// confirmation card, so both surfaces edit the exact same fields the exact
// same way.
export function EntryEditForm({
  form,
  onChange,
}: {
  form: EditForm;
  onChange: (updater: (f: EditForm) => EditForm) => void;
}) {
  const isTask = form.type === "task";
  const isEvent = form.type === "event";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="field-label">type</span>
        <div className="chip-select">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip-btn ${form.type === t ? "on" : ""}`}
              onClick={() => onChange((f) => ({ ...f, type: t }))}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="field-label">category</span>
        <div className="chip-select">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip-btn ${form.category === c ? "on" : ""}`}
              onClick={() => onChange((f) => ({ ...f, category: c }))}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="field-label">title</span>
        <input
          className="field"
          value={form.title}
          onChange={(e) => onChange((f) => ({ ...f, title: e.target.value }))}
        />
      </div>

      <div>
        <span className="field-label">notes</span>
        <textarea
          className="field"
          value={form.body}
          onChange={(e) => onChange((f) => ({ ...f, body: e.target.value }))}
        />
      </div>

      {/* Logs get no timing controls at all: they record that something
          happened, not when it is scheduled for. */}
      {isTask && (
        <div>
          <span className="field-label">due</span>
          <div className="when-row">
            <input
              type="date"
              className="field"
              value={form.dueDate}
              onChange={(e) => onChange((f) => ({ ...f, dueDate: e.target.value }))}
            />
            {/* Optional on purpose: most deadlines are a day, not a moment.
                Left empty, the task is simply due that day. */}
            <TimeSelect
              value={form.dueTime}
              disabled={!form.dueDate}
              emptyLabel="any time"
              onChange={(v) => onChange((f) => ({ ...f, dueTime: v }))}
            />
          </div>
        </div>
      )}

      {isEvent && (
        <div className="flex flex-col gap-3">
          <div>
            <span className="field-label">starts</span>
            <div className="when-row">
              <input
                type="date"
                className="field"
                value={form.startDate}
                onChange={(e) => onChange((f) => ({ ...f, startDate: e.target.value }))}
              />
              <TimeSelect
                value={form.startTime}
                disabled={form.allDay}
                emptyLabel="--:--"
                onChange={(v) => onChange((f) => ({ ...f, startTime: v }))}
              />
            </div>
          </div>

          <div>
            <span className="field-label">ends</span>
            <div className="when-row">
              <button
                type="button"
                className={`chip-btn ${form.allDay ? "on" : ""}`}
                aria-pressed={form.allDay}
                onClick={() =>
                  onChange((f) => ({
                    ...f,
                    allDay: !f.allDay,
                    // Clearing the times keeps the stored row honest: an
                    // all-day event has no clock time to fall back to.
                    startTime: !f.allDay ? "" : f.startTime,
                    endTime: !f.allDay ? "" : f.endTime,
                  }))
                }
              >
                all day
              </button>
              <TimeSelect
                value={form.endTime}
                disabled={form.allDay || !form.startTime}
                emptyLabel="--:--"
                onChange={(v) => onChange((f) => ({ ...f, endTime: v }))}
              />
            </div>
          </div>
        </div>
      )}

      {form.category === "expenditure" && (
        <div className="flex gap-2">
          <div className="flex-1">
            <span className="field-label">amount</span>
            <input
              type="number"
              step="0.01"
              className="field"
              value={form.amount}
              onChange={(e) => onChange((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div className="w-20">
            <span className="field-label">currency</span>
            <input
              className="field"
              value={form.currency}
              onChange={(e) => onChange((f) => ({ ...f, currency: e.target.value }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
