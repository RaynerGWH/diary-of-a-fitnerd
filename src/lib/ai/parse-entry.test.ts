import { describe, it, expect } from "vitest";
import { validateParsed } from "./parse-entry";

describe("validateParsed", () => {
  it("passes through a well-formed response unchanged", () => {
    const result = validateParsed(
      {
        isCorrection: false,
        type: "task",
        category: "gym",
        title: "leg day",
        body: null,
        dueAt: "2026-08-09T10:00:00.000Z",
        occurredAt: null,
        amount: null,
        currency: null,
        uncertainFields: [],
        reason: null,
        reply: "logged: leg day, due tomorrow",
      },
      "leg day tomorrow",
    );
    expect(result.type).toBe("task");
    expect(result.category).toBe("gym");
    expect(result.title).toBe("leg day");
    expect(result.dueAt).toBe("2026-08-09T10:00:00.000Z");
    expect(result.uncertainFields).toEqual([]);
  });

  it("defaults to note and flags type when type is missing or invalid", () => {
    const result = validateParsed({ title: "something" }, "fallback");
    expect(result.type).toBe("note");
    expect(result.uncertainFields).toContain("type");
  });

  it("falls back to the raw message as title and flags it when title is missing", () => {
    const result = validateParsed({ type: "note" }, "gym at 6pm");
    expect(result.title).toBe("gym at 6pm");
    expect(result.uncertainFields).toContain("title");
  });

  it("nulls out an unparseable dueAt instead of throwing", () => {
    const result = validateParsed({ type: "task", title: "x", dueAt: "not a date" }, "x");
    expect(result.dueAt).toBeNull();
  });

  it("defaults currency to SGD when an amount is set but currency is missing", () => {
    const result = validateParsed({ type: "log", title: "lunch", amount: 12.5 }, "lunch");
    expect(result.amount).toBe(12.5);
    expect(result.currency).toBe("SGD");
  });

  it("leaves amount and currency null when no amount is given", () => {
    const result = validateParsed({ type: "note", title: "x", currency: "USD" }, "x");
    expect(result.amount).toBeNull();
    expect(result.currency).toBeNull();
  });

  it("drops unknown field names out of uncertainFields", () => {
    const result = validateParsed(
      { type: "note", title: "x", uncertainFields: ["category", "not_a_real_field"] },
      "x",
    );
    expect(result.uncertainFields).toEqual(["category"]);
  });

  it("handles completely malformed input without throwing", () => {
    const result = validateParsed("not even an object", "the raw message");
    expect(result.title).toBe("the raw message");
    expect(result.type).toBe("note");
    expect(result.reply).toBe("logged that");
  });
});
