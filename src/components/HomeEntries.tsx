"use client";

import { useState } from "react";
import { EntryCard } from "./EntryCard";
import { PulseIcon } from "./Doodle";
import { CATEGORIES, type Entry } from "@/lib/db/types";

export function HomeEntries({ tasks, logs }: { tasks: Entry[]; logs: Entry[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const [tasksExpanded, setTasksExpanded] = useState(true);

  const counts = new Map<string, number>();
  for (const e of [...tasks, ...logs]) {
    counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  }
  const total = tasks.length + logs.length;

  const filteredTasks = category ? tasks.filter((e) => e.category === category) : tasks;
  const filteredLogs = category ? logs.filter((e) => e.category === category) : logs;

  return (
    <>
      <div className="chips d2">
        <button
          type="button"
          className={`chip ${!category ? "hi" : ""}`}
          onClick={() => setCategory(null)}
        >
          all &middot; {total}
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`chip ${category === c ? "hi" : ""}`}
            style={{ opacity: counts.get(c) ? 1 : 0.5 }}
            onClick={() => setCategory(c)}
          >
            {c} &middot; {counts.get(c) ?? 0}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="label label-toggle d3"
        onClick={() => setTasksExpanded((v) => !v)}
        aria-expanded={tasksExpanded}
      >
        <span>outstanding tasks{filteredTasks.length > 0 ? ` (${filteredTasks.length})` : ""}</span>
        <span className={`label-arrow ${tasksExpanded ? "open" : ""}`} aria-hidden="true">
          &#9656;
        </span>
      </button>
      {tasksExpanded &&
        (filteredTasks.length === 0 ? (
          <div className="card alt d3">
            <div className="text-[14px] text-[color:var(--muted)]">
              {category ? "nothing here for this category." : "nothing outstanding, nice, or add one above."}
            </div>
          </div>
        ) : (
          filteredTasks.map((e, i) => (
            <EntryCard key={e.id} entry={e} variant="alt" delayClass={`d${Math.min(6, 3 + i)}`} />
          ))
        ))}

      <div className="label d4">
        <PulseIcon size={20} />
        logged today
      </div>
      {filteredLogs.length === 0 ? (
        <div className="card d4">
          <div className="text-[14px] text-[color:var(--muted)]">
            {category ? "nothing here for this category." : "nothing logged yet today."}
          </div>
        </div>
      ) : (
        filteredLogs.map((e, i) => (
          <EntryCard key={e.id} entry={e} delayClass={`d${Math.min(6, 4 + i)}`} />
        ))
      )}
    </>
  );
}
