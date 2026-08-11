import { describe, expect, it, vi, beforeEach } from "vitest";
import { normalizeUrl, submitJobListings } from "./job-listings";

// The upsert payload is captured rather than sent anywhere: what matters here
// is which listings survive validation and what shape they arrive in.
const upsert = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: () => ({ upsert }) }),
}));

beforeEach(() => {
  upsert.mockClear();
});

describe("normalizeUrl", () => {
  it("keeps a plain posting URL intact", () => {
    expect(normalizeUrl("https://jobs.example.com/swe-intern")).toBe(
      "https://jobs.example.com/swe-intern",
    );
  });

  it("strips the tracking parameters a newsletter link arrives with", () => {
    expect(
      normalizeUrl("https://jobs.example.com/swe?utm_source=news&utm_campaign=aug&gclid=xyz"),
    ).toBe("https://jobs.example.com/swe");
  });

  it("keeps parameters that actually identify the posting", () => {
    expect(normalizeUrl("https://boards.example.com/apply?gh_jid=4821")).toBe(
      "https://boards.example.com/apply?gh_jid=4821",
    );
  });

  it("collapses the variations that would otherwise dedupe as separate rows", () => {
    const canonical = "https://jobs.example.com/swe";
    expect(normalizeUrl("https://JOBS.example.com/swe")).toBe(canonical);
    expect(normalizeUrl("https://jobs.example.com/swe/")).toBe(canonical);
    expect(normalizeUrl("https://jobs.example.com/swe#apply")).toBe(canonical);
    expect(normalizeUrl("  https://jobs.example.com/swe  ")).toBe(canonical);
  });

  it("refuses anything that isn't a http(s) URL", () => {
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("mailto:jobs@example.com")).toBeNull();
    // A javascript: URL would end up in an href on the jobs board.
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("submitJobListings", () => {
  const ok = { title: "SWE Intern", url: "https://jobs.example.com/swe" };

  it("accepts a valid listing and scopes it to the caller's user id", async () => {
    const result = await submitJobListings("user-1", [ok]);

    expect(result).toEqual({ accepted: 1, rejected: [] });
    const [rows] = upsert.mock.calls[0] as unknown as [Record<string, unknown>[]];
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      title: "SWE Intern",
      url: "https://jobs.example.com/swe",
      source: "mcp",
    });
  });

  it("never lets the tool arguments choose the user id", async () => {
    await submitJobListings("user-1", [{ ...ok, user_id: "someone-else" }]);

    const [rows] = upsert.mock.calls[0] as unknown as [Record<string, unknown>[]];
    expect(rows[0].user_id).toBe("user-1");
  });

  it("leaves status and entry_id out of the payload so a re-scrape can't undo a decision", async () => {
    await submitJobListings("user-1", [ok]);

    const [rows] = upsert.mock.calls[0] as unknown as [Record<string, unknown>[]];
    expect(rows[0]).not.toHaveProperty("status");
    expect(rows[0]).not.toHaveProperty("entry_id");
  });

  it("rejects listings missing a url or a title, and reports why", async () => {
    const result = await submitJobListings("user-1", [
      { title: "No link here" },
      { url: "https://jobs.example.com/untitled" },
      ok,
    ]);

    expect(result.accepted).toBe(1);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].reason).toMatch(/url/);
    expect(result.rejected[1].reason).toMatch(/title/);
  });

  it("collapses a url repeated within one call", async () => {
    // Postgres rejects an upsert whose batch hits the same conflict key twice,
    // so this has to be caught before the query, not by the database.
    const result = await submitJobListings("user-1", [ok, { ...ok, title: "Same posting" }]);

    expect(result.accepted).toBe(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/duplicate/);
  });

  it("treats a tracking-param variant as the same posting", async () => {
    const result = await submitJobListings("user-1", [
      ok,
      { ...ok, url: `${ok.url}?utm_source=newsletter` },
    ]);

    expect(result.accepted).toBe(1);
    expect(result.rejected[0].reason).toMatch(/duplicate/);
  });

  it("keeps only an unambiguous ISO deadline", async () => {
    await submitJobListings("user-1", [
      { ...ok, deadline: "2026-09-01" },
      { ...ok, url: "https://jobs.example.com/b", deadline: "end of September" },
      { ...ok, url: "https://jobs.example.com/c", deadline: "01/09/2026" },
    ]);

    const [rows] = upsert.mock.calls[0] as unknown as [Record<string, unknown>[]];
    expect(rows[0].deadline).toBe("2026-09-01");
    expect(rows[1].deadline).toBeNull();
    expect(rows[2].deadline).toBeNull();
  });

  it("does not touch the database when nothing survives validation", async () => {
    const result = await submitJobListings("user-1", [{ title: "no url" }]);

    expect(result.accepted).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a batch large enough to be a runaway scrape", async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      title: `Role ${i}`,
      url: `https://jobs.example.com/${i}`,
    }));

    await expect(submitJobListings("user-1", many)).rejects.toThrow(/too many/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a non-array payload", async () => {
    await expect(submitJobListings("user-1", { title: "x" })).rejects.toThrow(/must be an array/);
  });
});
