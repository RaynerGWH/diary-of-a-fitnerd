"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createEntry } from "@/app/capture/actions";
import { CATEGORIES, type EntryType } from "@/lib/db/types";

const TYPES: { value: EntryType; label: string }[] = [
  { value: "task", label: "task" },
  { value: "note", label: "note" },
  { value: "log", label: "log" },
  { value: "event", label: "event" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="sticker-btn primary" disabled={pending}>
      {pending ? "saving..." : "save"}
    </button>
  );
}

export function CaptureForm() {
  const [type, setType] = useState<EntryType>("task");
  const [category, setCategory] = useState<string>("other");

  return (
    <form action={createEntry} className="card d1 flex flex-col gap-3">
      <div>
        <span className="field-label">type</span>
        <div className="chip-select">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`chip-btn ${type === t.value ? "on" : ""}`}
              onClick={() => setType(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="type" value={type} />
      </div>

      <div>
        <span className="field-label">category</span>
        <div className="chip-select">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip-btn ${category === c ? "on" : ""}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <input type="hidden" name="category" value={category} />
      </div>

      <div>
        <span className="field-label">title</span>
        <input name="title" required className="field" placeholder="what's up" autoFocus />
      </div>

      <div>
        <span className="field-label">notes (optional)</span>
        <textarea name="body" className="field" placeholder="details..." />
      </div>

      {type === "task" && (
        <div>
          <span className="field-label">due (optional)</span>
          <input type="date" name="dueAt" className="field" />
        </div>
      )}

      {category === "expenditure" && (
        <div className="flex gap-2">
          <div className="flex-1">
            <span className="field-label">amount</span>
            <input type="number" step="0.01" name="amount" className="field" placeholder="0.00" />
          </div>
          <div className="w-20">
            <span className="field-label">currency</span>
            <input name="currency" className="field" defaultValue="SGD" />
          </div>
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
