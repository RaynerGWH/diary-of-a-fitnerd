import { describe, expect, it } from "vitest";
import {
  MAX_SERIES_OCCURRENCES,
  addMonths,
  buildMonthGrid,
  expandWeekly,
  groupByDay,
  isOverdue,
  sortForDay,
} from "./calendar";
import type { Entry } from "./db/types";

function entry(over: Partial<Entry>): Entry {
  return {
    id: "id",
    user_id: "u",
    type: "event",
    category: "school",
    title: "t",
    body: null,
    status: null,
    due_at: null,
    occurred_at: "2026-08-10T02:00:00.000Z",
    ends_at: null,
    all_day: false,
    series_id: null,
    amount: null,
    currency: null,
    source: "app",
    needs_review: false,
    created_at: "2026-08-10T02:00:00.000Z",
    updated_at: "2026-08-10T02:00:00.000Z",
    calendar_at: "2026-08-10T02:00:00.000Z",
    ...over,
  };
}

describe("buildMonthGrid", () => {
  it("is always six full weeks, so paging months never resizes the grid", () => {
    for (const [y, m] of [
      [2026, 2],
      [2026, 8],
      [2027, 1],
    ] as const) {
      const weeks = buildMonthGrid(y, m);
      expect(weeks).toHaveLength(6);
      expect(weeks.flat()).toHaveLength(42);
    }
  });

  it("starts on the Monday on or before the 1st", () => {
    // 1 August 2026 is a Saturday, so the grid opens on Monday 27 July.
    expect(buildMonthGrid(2026, 8)[0][0].key).toBe("2026-07-27");
  });

  it("marks days outside the month", () => {
    const flat = buildMonthGrid(2026, 8).flat();
    expect(flat.find((c) => c.key === "2026-07-27")?.inMonth).toBe(false);
    expect(flat.find((c) => c.key === "2026-08-01")?.inMonth).toBe(true);
  });

  it("runs consecutively with no gaps or repeats", () => {
    const keys = buildMonthGrid(2026, 8)
      .flat()
      .map((c) => c.key);
    expect(new Set(keys).size).toBe(42);
    for (let i = 1; i < keys.length; i++) {
      const gap = Date.parse(`${keys[i]}T00:00:00Z`) - Date.parse(`${keys[i - 1]}T00:00:00Z`);
      expect(gap).toBe(86_400_000);
    }
  });
});

describe("addMonths", () => {
  it("rolls forward over a year boundary", () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("rolls backward over a year boundary", () => {
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe("expandWeekly", () => {
  const start = "2026-08-10T02:00:00.000Z"; // Monday 10am SGT

  it("emits one occurrence per week up to and including the end date", () => {
    const out = expandWeekly(start, null, "2026-08-31");
    expect(out.map((o) => o.occurredAt.slice(0, 10))).toEqual([
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
      "2026-08-31",
    ]);
  });

  it("holds the wall-clock time steady across occurrences", () => {
    const times = expandWeekly(start, null, "2026-09-30").map((o) => o.occurredAt.slice(11, 16));
    expect(new Set(times).size).toBe(1);
  });

  it("carries the duration onto every occurrence", () => {
    const out = expandWeekly(start, "2026-08-10T04:00:00.000Z", "2026-08-24");
    for (const occ of out) {
      expect(Date.parse(occ.endsAt!) - Date.parse(occ.occurredAt)).toBe(2 * 3_600_000);
    }
  });

  it("leaves endsAt null when there is no duration", () => {
    expect(expandWeekly(start, null, "2026-08-17")[0].endsAt).toBeNull();
  });

  it("still emits the first occurrence when the end date precedes the start", () => {
    // A bad rule degrades to a single entry rather than silently logging nothing.
    expect(expandWeekly(start, null, "2020-01-01")).toHaveLength(1);
  });

  it("caps a runaway rule", () => {
    expect(expandWeekly(start, null, "2099-01-01")).toHaveLength(MAX_SERIES_OCCURRENCES);
  });
});

describe("isOverdue", () => {
  const friday = "2026-08-14T00:00:00.000+08:00"; // all-day tasks sit at SGT midnight
  const fridayMorning = new Date("2026-08-14T01:00:00.000Z"); // 9am SGT, same day

  it("does not call an all-day task overdue on the day it is due", () => {
    const task = entry({ type: "task", status: "open", due_at: friday, all_day: true });
    expect(isOverdue(task, fridayMorning)).toBe(false);
  });

  it("calls it overdue once that day has passed", () => {
    const task = entry({ type: "task", status: "open", due_at: friday, all_day: true });
    expect(isOverdue(task, new Date("2026-08-15T01:00:00.000Z"))).toBe(true);
  });

  it("compares instants when a real time was given", () => {
    const task = entry({
      type: "task",
      status: "open",
      due_at: "2026-08-14T09:00:00.000+08:00",
      all_day: false,
    });
    expect(isOverdue(task, new Date("2026-08-14T02:00:00.000Z"))).toBe(true); // 10am SGT
    expect(isOverdue(task, new Date("2026-08-14T00:00:00.000Z"))).toBe(false); // 8am SGT
  });

  it("is never true for a done task, an undated task, or a non-task", () => {
    expect(
      isOverdue(entry({ type: "task", status: "done", due_at: friday, all_day: true }), fridayMorning),
    ).toBe(false);
    expect(
      isOverdue(entry({ type: "task", status: "open", due_at: null }), fridayMorning),
    ).toBe(false);
    expect(
      isOverdue(entry({ type: "event", status: null, due_at: friday }), fridayMorning),
    ).toBe(false);
  });
});

describe("groupByDay", () => {
  it("buckets on the SGT day, not the UTC one", () => {
    // 23:00 UTC is already the next morning in Singapore.
    const grouped = groupByDay([entry({ id: "a", calendar_at: "2026-08-09T23:00:00.000Z" })]);
    expect([...grouped.keys()]).toEqual(["2026-08-10"]);
  });

  it("skips entries with no calendar date", () => {
    expect(groupByDay([entry({ calendar_at: null })]).size).toBe(0);
  });
});

describe("sortForDay", () => {
  it("puts all-day entries first, then orders by time", () => {
    const out = sortForDay([
      entry({ id: "late", calendar_at: "2026-08-10T09:00:00.000Z" }),
      entry({ id: "allday", all_day: true, calendar_at: "2026-08-10T16:00:00.000Z" }),
      entry({ id: "early", calendar_at: "2026-08-10T02:00:00.000Z" }),
    ]);
    expect(out.map((e) => e.id)).toEqual(["allday", "early", "late"]);
  });

  it("leads with the task when two things share a time", () => {
    const out = sortForDay([
      entry({ id: "event", type: "event" }),
      entry({ id: "task", type: "task" }),
    ]);
    expect(out[0].id).toBe("task");
  });
});
