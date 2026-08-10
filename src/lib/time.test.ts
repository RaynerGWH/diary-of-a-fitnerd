import { describe, expect, it } from "vitest";
import {
  sgtDateKey,
  sgtDayBounds,
  sgtDaysBetween,
  sgtDateTimeLabel,
  sgtInstant,
  sgtMonthBounds,
  sgtTimeOfDay,
  sgtWeekday,
  taskDueHasTime,
} from "./time";

// The eight hours after SGT midnight are where every one of these used to be
// wrong, so most cases sit deliberately inside that window.
describe("sgtDateKey", () => {
  it("reads an instant late in the UTC day as the next SGT day", () => {
    expect(sgtDateKey("2026-08-09T23:00:00.000Z")).toBe("2026-08-10");
  });

  it("keeps SGT midnight itself on its own day", () => {
    expect(sgtDateKey("2026-08-09T16:00:00.000Z")).toBe("2026-08-10");
  });

  it("stays on the previous day one millisecond earlier", () => {
    expect(sgtDateKey("2026-08-09T15:59:59.999Z")).toBe("2026-08-09");
  });

  it("rolls the year over", () => {
    expect(sgtDateKey("2025-12-31T16:00:00.000Z")).toBe("2026-01-01");
  });
});

describe("sgtDayBounds", () => {
  it("brackets the full SGT day around an instant inside it", () => {
    const { start, end } = sgtDayBounds("2026-08-09T23:00:00.000Z");
    expect(start).toBe("2026-08-10T00:00:00.000+08:00");
    expect(end).toBe("2026-08-10T23:59:59.999+08:00");
  });

  it("produces a range that actually contains the instant it was built from", () => {
    const iso = "2026-08-09T23:00:00.000Z";
    const { start, end } = sgtDayBounds(iso);
    const t = Date.parse(iso);
    expect(t).toBeGreaterThanOrEqual(Date.parse(start));
    expect(t).toBeLessThanOrEqual(Date.parse(end));
  });
});

describe("sgtMonthBounds", () => {
  it("is half-open, ending at the first instant of the next month", () => {
    const { start, end } = sgtMonthBounds(2026, 8);
    expect(start).toBe("2026-08-01T00:00:00.000+08:00");
    expect(end).toBe("2026-09-01T00:00:00.000+08:00");
  });

  it("rolls December into the next year", () => {
    expect(sgtMonthBounds(2026, 12).end).toBe("2027-01-01T00:00:00.000+08:00");
  });

  it("pads single-digit months", () => {
    expect(sgtMonthBounds(2026, 1).start).toBe("2026-01-01T00:00:00.000+08:00");
  });
});

describe("sgtWeekday", () => {
  it("names the SGT weekday, not the UTC one", () => {
    // Sunday 23:00 UTC is already Monday morning in Singapore.
    expect(sgtWeekday("2026-08-09T23:00:00.000Z")).toBe("Monday");
  });
});

describe("sgtDaysBetween", () => {
  it("counts calendar days rather than 24-hour blocks", () => {
    // Under two hours apart, but either side of SGT midnight.
    expect(sgtDaysBetween("2026-08-09T15:00:00.000Z", "2026-08-09T16:30:00.000Z")).toBe(1);
  });

  it("is negative when the target is earlier", () => {
    expect(sgtDaysBetween("2026-08-10T04:00:00.000Z", "2026-08-09T04:00:00.000Z")).toBe(-1);
  });

  it("is zero within the same SGT day", () => {
    expect(sgtDaysBetween("2026-08-09T16:00:00.000Z", "2026-08-10T15:00:00.000Z")).toBe(0);
  });
});

describe("taskDueHasTime", () => {
  it("treats SGT midnight as no time given", () => {
    expect(taskDueHasTime("2026-08-14T00:00:00.000+08:00")).toBe(false);
  });

  it("does not mistake UTC midnight for it", () => {
    // This is the old 08:00 SGT artifact, which is a real time of day here.
    expect(taskDueHasTime("2026-08-14T00:00:00.000Z")).toBe(true);
  });

  it("sees a real time", () => {
    expect(taskDueHasTime("2026-08-14T17:30:00.000+08:00")).toBe(true);
  });
});

describe("sgtInstant", () => {
  it("anchors a bare date to SGT midnight rather than UTC midnight", () => {
    expect(sgtInstant("2026-08-14")).toBe("2026-08-14T00:00:00.000+08:00");
    expect(sgtDateKey(sgtInstant("2026-08-14"))).toBe("2026-08-14");
  });

  it("composes a time when one is given", () => {
    expect(sgtTimeOfDay(sgtInstant("2026-08-14", "17:30"))).toBe("17:30");
  });
});

describe("sgtDateTimeLabel", () => {
  it("renders the SGT wall clock", () => {
    expect(sgtDateTimeLabel("2026-08-09T23:15:00.000Z")).toBe("2026-08-10 07:15");
  });
});
