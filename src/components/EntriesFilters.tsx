"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, type EntryType } from "@/lib/db/types";

const TYPES: { value: EntryType; label: string }[] = [
  { value: "task", label: "tasks" },
  { value: "log", label: "logs" },
  { value: "event", label: "events" },
];

// Wraps the results as well as the controls, because both depend on whether a
// filter change is in flight. Next doesn't render loading.tsx for a
// search-param change on the same route segment, so without this nothing on
// screen moves between the tap and the server's response.
export function EntriesFilters({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const type = searchParams.get("type") ?? "";
  const category = searchParams.get("category") ?? "";
  const q = searchParams.get("q") ?? "";
  const view = searchParams.get("view") === "calendar" ? "calendar" : "list";

  const [searchInput, setSearchInput] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // router.push inside a transition leaves searchParams on the old value until
  // the new page commits, so without this the chip you tapped stays visibly
  // unselected for the whole round trip.
  const [pendingType, setPendingType] = useState<string | null>(null);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

  // Keep the input in sync if the URL changes from elsewhere (back/forward nav).
  useEffect(() => setSearchInput(q), [q]);

  // The URL caught up, so the real params are authoritative again.
  useEffect(() => {
    setPendingType(null);
    setPendingCategory(null);
  }, [type, category]);

  const shownType = pendingType ?? type;
  const shownCategory = pendingCategory ?? category;

  // Typing counts as loading: the debounced request hasn't been sent yet, but
  // the list on screen is already answering a stale query.
  const loading = isPending || searchInput !== q;

  function updateParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  function onSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParams({ q: value }), 350);
  }

  function onTypeChange(value: string) {
    setPendingType(value);
    updateParams({ type: value });
  }

  function onCategoryChange(value: string) {
    setPendingCategory(value);
    updateParams({ category: value });
  }

  return (
    // Fills the stack and scrolls internally, so the controls below stay put
    // and only the results move. Filtering something you have to scroll back
    // up to reach is the thing this prevents.
    <div className="entries-pane">
      <div className="flex flex-col gap-2">
        <div className="view-toggle">
          {(["list", "calendar"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`view-btn ${view === v ? "on" : ""}`}
              aria-pressed={view === v}
              // Clearing month on the way out keeps a stale month from
              // reappearing the next time the calendar is opened.
              onClick={() => updateParams({ view: v === "list" ? "" : v, month: "" })}
            >
              {v}
            </button>
          ))}
        </div>

        <input
          type="search"
          className="field"
          placeholder="search entries..."
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
        />

        <div className="chips">
          <button
            type="button"
            className={`chip ${!shownType ? "hi" : ""}`}
            onClick={() => onTypeChange("")}
          >
            all
          </button>
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`chip ${shownType === t.value ? "hi" : ""}`}
              onClick={() => onTypeChange(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <select
          className="field"
          value={shownCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
        >
          <option value="">all categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Always rendered so appearing mid-filter doesn't shift the list down. */}
        <div className="filter-status" aria-live="polite">
          {loading ? <span className="pending-word">filtering...</span> : null}
        </div>
      </div>

      <div className={`results ${loading ? "results-stale" : ""}`.trim()}>{children}</div>
    </div>
  );
}
