"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, type EntryType } from "@/lib/db/types";

const TYPES: { value: EntryType; label: string }[] = [
  { value: "task", label: "tasks" },
  { value: "log", label: "logs" },
  { value: "event", label: "events" },
];

export function EntriesFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const type = searchParams.get("type") ?? "";
  const category = searchParams.get("category") ?? "";
  const q = searchParams.get("q") ?? "";

  const [searchInput, setSearchInput] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the input in sync if the URL changes from elsewhere (back/forward nav).
  useEffect(() => setSearchInput(q), [q]);

  function updateParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function onSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParams({ q: value }), 350);
  }

  return (
    <div className="flex flex-col gap-2">
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
          className={`chip ${!type ? "hi" : ""}`}
          onClick={() => updateParams({ type: "" })}
        >
          all
        </button>
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            className={`chip ${type === t.value ? "hi" : ""}`}
            onClick={() => updateParams({ type: t.value })}
          >
            {t.label}
          </button>
        ))}
      </div>

      <select
        className="field"
        value={category}
        onChange={(e) => updateParams({ category: e.target.value })}
      >
        <option value="">all categories</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
