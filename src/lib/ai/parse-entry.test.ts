import { describe, it, expect } from "vitest";
import { validateParseResult, validateEditResolution } from "./parse-entry";

describe("validateParseResult", () => {
  it("passes through a well-formed single-entry 'new' response unchanged", () => {
    const result = validateParseResult(
      {
        intent: "new",
        entries: [
          {
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
          },
        ],
        reply: "logged: leg day, due tomorrow",
      },
      "leg day tomorrow",
    );
    if (result.intent !== "new") throw new Error("expected new intent");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("task");
    expect(result.entries[0].category).toBe("gym");
    expect(result.entries[0].title).toBe("leg day");
    expect(result.entries[0].dueAt).toBe("2026-08-09T10:00:00.000Z");
    expect(result.entries[0].uncertainFields).toEqual([]);
    expect(result.reply).toBe("logged: leg day, due tomorrow");
  });

  it("splits a message into multiple entries when the model returns several", () => {
    const result = validateParseResult(
      {
        intent: "new",
        entries: [
          { type: "task", category: "other", title: "pay rent" },
          { type: "task", category: "other", title: "call mom" },
          { type: "task", category: "gym", title: "walk the dog" },
        ],
        reply: "logged 3 things",
      },
      "pay rent, call mom, and walk the dog",
    );
    if (result.intent !== "new") throw new Error("expected new intent");
    expect(result.entries).toHaveLength(3);
    expect(result.entries.map((e) => e.title)).toEqual(["pay rent", "call mom", "walk the dog"]);
  });

  it("defaults to log and flags type when type is missing or invalid", () => {
    const result = validateParseResult({ intent: "new", entries: [{ title: "something" }] }, "fallback");
    if (result.intent !== "new") throw new Error("expected new intent");
    expect(result.entries[0].type).toBe("log");
    expect(result.entries[0].uncertainFields).toContain("type");
  });

  it("falls back to the raw message as title and flags it when title is missing", () => {
    const result = validateParseResult({ intent: "new", entries: [{ type: "log" }] }, "gym at 6pm");
    if (result.intent !== "new") throw new Error("expected new intent");
    expect(result.entries[0].title).toBe("gym at 6pm");
    expect(result.entries[0].uncertainFields).toContain("title");
  });

  it("nulls out an unparseable dueAt instead of throwing", () => {
    const result = validateParseResult(
      { intent: "new", entries: [{ type: "task", title: "x", dueAt: "not a date" }] },
      "x",
    );
    if (result.intent !== "new") throw new Error("expected new intent");
    expect(result.entries[0].dueAt).toBeNull();
  });

  it("defaults currency to SGD when an amount is set but currency is missing", () => {
    const result = validateParseResult(
      { intent: "new", entries: [{ type: "log", title: "lunch", amount: 12.5 }] },
      "lunch",
    );
    if (result.intent !== "new") throw new Error("expected new intent");
    expect(result.entries[0].amount).toBe(12.5);
    expect(result.entries[0].currency).toBe("SGD");
  });

  it("leaves amount and currency null when no amount is given", () => {
    const result = validateParseResult(
      { intent: "new", entries: [{ type: "log", title: "x", currency: "USD" }] },
      "x",
    );
    if (result.intent !== "new") throw new Error("expected new intent");
    expect(result.entries[0].amount).toBeNull();
    expect(result.entries[0].currency).toBeNull();
  });

  it("drops unknown field names out of uncertainFields", () => {
    const result = validateParseResult(
      {
        intent: "new",
        entries: [{ type: "log", title: "x", uncertainFields: ["category", "not_a_real_field"] }],
      },
      "x",
    );
    if (result.intent !== "new") throw new Error("expected new intent");
    expect(result.entries[0].uncertainFields).toEqual(["category"]);
  });

  it("handles completely malformed input without throwing", () => {
    const result = validateParseResult("not even an object", "the raw message");
    if (result.intent !== "new") throw new Error("expected new intent");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].title).toBe("the raw message");
    expect(result.entries[0].type).toBe("log");
    expect(result.reply).toBe("logged that");
  });

  it("treats a missing entries array as a single entry instead of producing nothing", () => {
    const result = validateParseResult({ intent: "new", type: "task", title: "solo" }, "solo");
    if (result.intent !== "new") throw new Error("expected new intent");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].title).toBe("solo");
  });

  it("treats an empty entries array the same way", () => {
    const result = validateParseResult({ intent: "new", entries: [], title: "empty case" }, "fallback");
    if (result.intent !== "new") throw new Error("expected new intent");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].title).toBe("empty case");
  });

  it("returns an edit intent with the given editQuery", () => {
    const result = validateParseResult({ intent: "edit", editQuery: "rent" }, "make the rent one $500");
    expect(result.intent).toBe("edit");
    if (result.intent !== "edit") throw new Error("expected edit intent");
    expect(result.editQuery).toBe("rent");
  });

  it("falls back to the raw message for editQuery when missing", () => {
    const result = validateParseResult({ intent: "edit" }, "fix that thing");
    expect(result.intent).toBe("edit");
    if (result.intent !== "edit") throw new Error("expected edit intent");
    expect(result.editQuery).toBe("fix that thing");
  });
});

describe("validateEditResolution", () => {
  const candidateIds = new Set(["id-1", "id-2"]);

  it("keeps a matchedId that's actually one of the candidates", () => {
    const result = validateEditResolution({ matchedId: "id-1", updates: {}, reply: "ok" }, candidateIds);
    expect(result.matchedId).toBe("id-1");
    expect(result.uncertain).toBe(false);
  });

  it("nulls out a matchedId that isn't a real candidate and forces uncertain", () => {
    const result = validateEditResolution(
      { matchedId: "made-up-id", updates: {}, reply: "ok" },
      candidateIds,
    );
    expect(result.matchedId).toBeNull();
    expect(result.uncertain).toBe(true);
  });

  it("forces uncertain when matchedId is explicitly null", () => {
    const result = validateEditResolution({ matchedId: null, updates: {}, reply: "ok" }, candidateIds);
    expect(result.matchedId).toBeNull();
    expect(result.uncertain).toBe(true);
  });

  it("passes through valid update fields", () => {
    const result = validateEditResolution(
      {
        matchedId: "id-1",
        updates: {
          type: "task",
          category: "work",
          title: "new title",
          body: null,
          dueAt: "2026-08-10T00:00:00.000Z",
          amount: 500,
          currency: "sgd",
          occurredAt: "2026-08-09T00:00:00.000Z",
          status: "done",
        },
        reply: "updated",
        uncertain: false,
      },
      candidateIds,
    );
    expect(result.updates).toEqual({
      type: "task",
      category: "work",
      title: "new title",
      body: null,
      dueAt: "2026-08-10T00:00:00.000Z",
      amount: 500,
      currency: "SGD",
      occurredAt: "2026-08-09T00:00:00.000Z",
      status: "done",
    });
  });

  it("drops invalid update fields instead of throwing", () => {
    const result = validateEditResolution(
      {
        matchedId: "id-1",
        updates: { type: "not_a_type", status: "archived", dueAt: "not a date", amount: "not a number" },
        reply: "ok",
      },
      candidateIds,
    );
    expect(result.updates).toEqual({});
  });

  it("only includes keys the model actually sent", () => {
    const result = validateEditResolution(
      { matchedId: "id-1", updates: { title: "just the title" }, reply: "ok" },
      candidateIds,
    );
    expect(result.updates).toEqual({ title: "just the title" });
  });

  it("defaults reply when missing", () => {
    const result = validateEditResolution({ matchedId: "id-1", updates: {} }, candidateIds);
    expect(result.reply).toBe("make this change?");
  });

  it("respects an explicit uncertain:true even with a valid match", () => {
    const result = validateEditResolution(
      { matchedId: "id-1", updates: {}, reply: "ok", uncertain: true },
      candidateIds,
    );
    expect(result.uncertain).toBe(true);
  });

  it("handles completely malformed input without throwing", () => {
    const result = validateEditResolution("not even an object", candidateIds);
    expect(result.matchedId).toBeNull();
    expect(result.updates).toEqual({});
    expect(result.uncertain).toBe(true);
  });
});
