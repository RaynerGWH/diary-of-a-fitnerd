"use client";

import { CATEGORIES, type EntryType } from "@/lib/db/types";
import { sgtDateKey, sgtDayStart } from "@/lib/time";

export type EditForm = {
  type: EntryType;
  category: string;
  title: string;
  body: string;
  dueAt: string;
  amount: string;
  currency: string;
};

const TYPE_LABEL: Record<EntryType, string> = {
  task: "task",
  log: "log",
  event: "event",
};
const TYPES: EntryType[] = ["task", "log", "event"];

export function formFromEntryLike(e: {
  type: EntryType;
  category: string;
  title: string;
  body: string | null;
  due_at: string | null;
  amount: number | null;
  currency: string | null;
}): EditForm {
  return {
    type: e.type,
    category: e.category,
    title: e.title,
    body: e.body ?? "",
    // Slicing the ISO string took the UTC date, which is the previous day for
    // anything due in the first eight hours of an SGT day.
    dueAt: e.due_at ? sgtDateKey(e.due_at) : "",
    amount: e.amount !== null ? String(e.amount) : "",
    currency: e.currency ?? "SGD",
  };
}

// Inverse of formFromEntryLike: turns the (string-based, input-friendly) form
// state back into the typed fields the server actions expect.
export function fieldsFromForm(form: EditForm) {
  return {
    type: form.type,
    category: form.category.trim().toLowerCase() || "other",
    title: form.title.trim(),
    body: form.body.trim() || null,
    // A bare "YYYY-MM-DD" parses as UTC midnight, which is 8am the same day in
    // Singapore. Anchoring to SGT midnight keeps the date the user picked.
    dueAt: form.dueAt ? sgtDayStart(form.dueAt) : null,
    // The form offers a date with no time, so a due date set here is by
    // definition all-day. Left undefined when there is none, so editing an
    // event does not clobber a time it never showed.
    allDay: form.dueAt ? true : undefined,
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

      {form.type === "task" && (
        <div>
          <span className="field-label">due</span>
          <input
            type="date"
            className="field"
            value={form.dueAt}
            onChange={(e) => onChange((f) => ({ ...f, dueAt: e.target.value }))}
          />
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
