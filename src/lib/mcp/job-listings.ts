import { createServiceClient } from "@/lib/supabase/service";

export type JobListingInput = {
  title: string;
  company?: string | null;
  url: string;
  location?: string | null;
  summary?: string | null;
  deadline?: string | null;
};

export type SubmitResult = {
  accepted: number;
  rejected: { url: string; reason: string }[];
};

const MAX_LISTINGS_PER_CALL = 50;
const MAX_TEXT = 2000;

function trimTo(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// The dedupe key. Tracking parameters differ run to run for the same posting,
// so a listing that arrived via a newsletter link on Monday and a direct link
// on Tuesday would otherwise land as two rows. Host is lowercased and the
// fragment dropped for the same reason.
export function normalizeUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_|ref$|ref_|fbclid$|gclid$|mc_cid$|mc_eid$|source$|trk$|trackingId$)/i.test(key)) {
      parsed.searchParams.delete(key);
    }
  }
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }
  return parsed.toString();
}

// "2026-09-01" only. A deadline that arrives as prose ("end of September") is
// dropped rather than guessed at, since a wrong date on a job application is
// worse than no date.
function normalizeDeadline(value: unknown): string | null {
  const text = trimTo(value, 32);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return Number.isNaN(Date.parse(text)) ? null : text;
}

export async function submitJobListings(
  userId: string,
  listings: unknown,
): Promise<SubmitResult> {
  if (!Array.isArray(listings)) {
    throw new Error("listings must be an array");
  }
  if (listings.length === 0) {
    return { accepted: 0, rejected: [] };
  }
  if (listings.length > MAX_LISTINGS_PER_CALL) {
    throw new Error(`too many listings in one call (max ${MAX_LISTINGS_PER_CALL})`);
  }

  const rejected: SubmitResult["rejected"] = [];
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const raw of listings) {
    const listing = (raw ?? {}) as Record<string, unknown>;
    const rawUrl = typeof listing.url === "string" ? listing.url : "";
    const title = trimTo(listing.title, 300);
    const url = rawUrl ? normalizeUrl(rawUrl) : null;

    if (!url) {
      rejected.push({ url: rawUrl || "(missing)", reason: "url is missing or not a valid http(s) URL" });
      continue;
    }
    if (!title) {
      rejected.push({ url, reason: "title is required" });
      continue;
    }
    // Postgres rejects an upsert whose batch contains the same conflict key
    // twice, so a duplicate within one call has to be collapsed here.
    if (seen.has(url)) {
      rejected.push({ url, reason: "duplicate url within this request" });
      continue;
    }
    seen.add(url);

    rows.push({
      user_id: userId,
      title,
      company: trimTo(listing.company, 200),
      url,
      location: trimTo(listing.location, 200),
      summary: trimTo(listing.summary, MAX_TEXT),
      deadline: normalizeDeadline(listing.deadline),
      source: "mcp",
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) return { accepted: 0, rejected };

  const db = createServiceClient();
  // `status` and `entry_id` are left out of the update set on purpose: a
  // listing already marked applied or dismissed must not be resurrected as
  // "new" by tomorrow's run over the same inbox.
  const { error } = await db
    .from("job_listings")
    .upsert(rows, { onConflict: "user_id,url", ignoreDuplicates: false });

  if (error) throw new Error(`could not save listings: ${error.message}`);

  return { accepted: rows.length, rejected };
}
