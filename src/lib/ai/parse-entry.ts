import { CATEGORIES, type EntryType } from "@/lib/db/types";
import { SGT_OFFSET, sgtDateTimeLabel, sgtWeekday } from "@/lib/time";
import { callOpenRouter } from "./openrouter";

const ENTRY_TYPES: EntryType[] = ["task", "log", "event"];
const KNOWN_FIELDS = [
  "type",
  "category",
  "title",
  "body",
  "dueAt",
  "occurredAt",
  "endsAt",
  "allDay",
  "repeat",
  "amount",
  "currency",
];

export type ChatTurn = { role: "user" | "assistant"; content: string };

// Weekly only. Anything richer is an RRULE, and an RRULE cannot be
// materialized into independently editable rows without inventing an
// exception model, which is the complexity this design exists to avoid.
export type RepeatRule = { freq: "weekly"; until: string };

export type NewEntryDraft = {
  type: EntryType;
  category: string;
  title: string;
  body: string | null;
  dueAt: string | null;
  occurredAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  repeat: RepeatRule | null;
  amount: number | null;
  currency: string | null;
  uncertainFields: string[];
  reason: string | null;
};

export type ParseResult =
  | { intent: "new"; entries: NewEntryDraft[]; reply: string }
  | { intent: "edit"; editQuery: string };

function buildSystemPrompt(now: Date): string {
  // The user's wall clock, not the server's. This runs on Vercel in UTC, so
  // deriving the weekday from the raw instant named the wrong day for the
  // eight hours after SGT midnight, and "friday" resolved a day early.
  return `You are the parser behind a personal daily-ops journal's chat capture box.

Current date/time: ${sgtDateTimeLabel(now)} Singapore time (${sgtWeekday(now)}). Resolve relative dates ("tomorrow", "friday") against this. Every date you return must be ISO 8601 carrying the ${SGT_OFFSET} offset.

First decide the user's intent:
- "new": logging one or more new things (the common case).
- "edit": changing/updating/completing something already logged before (e.g. "actually make the rent one $500", "mark the dentist task done", "the gym log should say 45 mins not 30"). This is about an OLD entry, not a new one.

If intent is "new", respond with exactly:
{
  "intent": "new",
  "entries": [ {...one object per distinct thing being logged...} ],
  "reply": "short (under 12 words), casual first-person confirmation of what you logged, no emoji. If multiple entries, briefly summarize all of them."
}
Split into multiple entries only when the message clearly describes multiple separate things (e.g. "pay rent and call mom tomorrow" -> two entries). One thing described one way is one entry, not several.

Each entry object:
- type: one of "task" | "log" | "event". "log" is the catch-all: thoughts, notes, records of what happened, expenses, anything that isn't a task or a scheduled event.
- category: one of ${CATEGORIES.join(", ")} if it clearly fits, else a short freeform lowercase word.
- title: short (a few words), in the user's own words, not a restatement.
- body: optional extra detail, or null.
- dueAt: ISO 8601 datetime, only for tasks with a due date, else null.
- occurredAt: ISO 8601 datetime this happened/happens, else null to default to now.
- endsAt: ISO 8601 datetime this finishes, only when a duration or end time is given ("tutorial 2 to 4pm"), else null.
- allDay: events only, true when the event fills a whole day ("public holiday on the 9th", "camp on saturday"). Always false for tasks and logs: a task being due on a date is not the same thing as filling that date.
- For a task due on a date with no time given ("submit by friday"), set dueAt to 00:00 on that date in ${SGT_OFFSET}. Midnight is how "no particular time" is recorded, so never invent a plausible-looking time like 09:00 or 17:00.
- repeat: {"freq":"weekly","until":"YYYY-MM-DD"} when something recurs weekly ("every monday", "tutorials every tuesday till 14 nov"). Only weekly recurrence is supported: if it repeats on any other cadence, set this to null and note it in uncertainFields. If a weekly thing has no stated end, use the last day of the current semester as a sensible bound, roughly 15 weeks out.
- amount: number, only if this is an expenditure with a clear amount, else null.
- currency: 3-letter currency code if amount is set, else null. Default to SGD when the message doesn't name a specific currency (e.g. a bare "$" amount), don't assume USD.
- uncertainFields: array of the field names above you're genuinely unsure about (e.g. ambiguous category, no clear date despite a due-date-sounding message). Empty array if confident.
- reason: one short sentence explaining the uncertainty, or null if uncertainFields is empty.

If intent is "edit", respond with exactly:
{
  "intent": "edit",
  "editQuery": "a few keywords describing the OLD entry being referenced (not the new value), to search for it by, e.g. for 'make the rent one $500' use 'rent'"
}

Respond with ONLY a JSON object, no other text.`;
}

function isValidIsoDate(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && !Number.isNaN(new Date(v).getTime());
}

// Defensive against whatever the model actually returns: unknown/missing
// fields fall back to safe defaults and get added to uncertainFields, so a
// malformed parse is flagged for review instead of silently saved wrong.
function validateEntryDraft(raw: unknown, fallbackTitle: string): NewEntryDraft {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const uncertain = new Set(
    Array.isArray(r.uncertainFields)
      ? r.uncertainFields.filter(
          (f): f is string => typeof f === "string" && KNOWN_FIELDS.includes(f),
        )
      : [],
  );

  let type: EntryType;
  if (typeof r.type === "string" && ENTRY_TYPES.includes(r.type as EntryType)) {
    type = r.type as EntryType;
  } else {
    type = "log";
    uncertain.add("type");
  }

  const category =
    typeof r.category === "string" && r.category.trim() ? r.category.trim().toLowerCase() : "other";

  let title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title) {
    title = fallbackTitle.slice(0, 120);
    uncertain.add("title");
  }

  const body = typeof r.body === "string" && r.body.trim() ? r.body.trim() : null;
  const dueAt = isValidIsoDate(r.dueAt) ? r.dueAt : null;
  const occurredAt = isValidIsoDate(r.occurredAt) ? r.occurredAt : null;
  // An end before its start is not a duration, so it is dropped rather than
  // stored as a negative-length event the calendar would have to defend against.
  const endsAt =
    isValidIsoDate(r.endsAt) && occurredAt !== null && Date.parse(r.endsAt) > Date.parse(occurredAt)
      ? r.endsAt
      : null;
  // Events only, whatever the model says: an all-day task is not a concept.
  const allDay = r.allDay === true && type === "event";
  const repeat = validateRepeat(r.repeat);
  const amount = typeof r.amount === "number" && Number.isFinite(r.amount) ? r.amount : null;
  const currency =
    amount !== null
      ? typeof r.currency === "string" && r.currency.trim()
        ? r.currency.trim().toUpperCase()
        : "SGD"
      : null;

  const reason = typeof r.reason === "string" && r.reason.trim() ? r.reason.trim() : null;

  return {
    type,
    category,
    title,
    body,
    dueAt,
    occurredAt,
    endsAt,
    allDay,
    repeat,
    amount,
    currency,
    uncertainFields: Array.from(uncertain),
    reason,
  };
}

function validateRepeat(raw: unknown): RepeatRule | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (r.freq !== "weekly") return null;
  if (typeof r.until !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.until)) return null;
  if (Number.isNaN(Date.parse(r.until))) return null;
  return { freq: "weekly", until: r.until };
}

export function validateParseResult(raw: unknown, fallbackTitle: string): ParseResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  if (r.intent === "edit") {
    const editQuery =
      typeof r.editQuery === "string" && r.editQuery.trim()
        ? r.editQuery.trim()
        : fallbackTitle.slice(0, 60);
    return { intent: "edit", editQuery };
  }

  // Defensive fallback: if the model forgot to wrap in "entries" (or sent an
  // empty array), treat the whole top-level object as a single entry draft
  // rather than silently producing nothing.
  const rawEntries = Array.isArray(r.entries) && r.entries.length > 0 ? r.entries : [r];
  const entries = rawEntries.map((e) => validateEntryDraft(e, fallbackTitle));
  const reply = typeof r.reply === "string" && r.reply.trim() ? r.reply.trim() : "logged that";

  return { intent: "new", entries, reply };
}

export async function parseMessage(message: string, context: ChatTurn[]): Promise<ParseResult> {
  const raw = await callOpenRouter([
    { role: "system", content: buildSystemPrompt(new Date()) },
    ...context,
    { role: "user", content: message },
  ]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  return validateParseResult(parsed, message);
}

// --- edit resolution: given DB-search candidates (deterministic keyword
// match, not the LLM's own memory), the LLM picks which one the user means
// and what should change. Kept as a separate call from parseMessage so the
// common "new entry" path never pays for it. ---

export type EditCandidate = {
  id: string;
  type: EntryType;
  category: string;
  title: string;
  body: string | null;
  dueAt: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
};

export type EditUpdates = {
  type?: EntryType;
  category?: string;
  title?: string;
  body?: string | null;
  dueAt?: string | null;
  amount?: number | null;
  currency?: string | null;
  occurredAt?: string;
  status?: "open" | "done";
};

export type EditResolution = {
  matchedId: string | null;
  updates: EditUpdates;
  reply: string;
  uncertain: boolean;
};

function describeCandidate(c: EditCandidate): string {
  const bits = [c.type, c.category, `"${c.title}"`];
  if (c.body) bits.push(c.body);
  if (c.dueAt) bits.push(`due ${c.dueAt}`);
  if (c.amount !== null) bits.push(`${c.currency ?? ""} ${c.amount}`.trim());
  if (c.status) bits.push(c.status);
  return `${bits.join(" · ")} [id=${c.id}]`;
}

function buildResolveEditPrompt(now: Date, candidates: EditCandidate[]): string {
  const list = candidates.map((c, i) => `${i + 1}. ${describeCandidate(c)}`).join("\n");

  return `You are the editor behind a personal daily-ops journal's chat capture box.
The user wants to update an existing entry. Here are candidate entries found by keyword search, most recent first:

${list}

Current date/time: ${sgtDateTimeLabel(now)} Singapore time (${sgtWeekday(now)}). Resolve relative dates against this, and return dates as ISO 8601 carrying the ${SGT_OFFSET} offset.

Decide which entry (if any) the user's message refers to, and what should change. If your best guess is the most recent of several similar candidates, still pick it (it's the best default), but set "uncertain": true whenever the message doesn't clearly distinguish which candidate it means, and don't guess silently just because one candidate happens to be more recent. Respond with exactly:
{
  "matchedId": "the id of the matching entry, or null if none of these are a good match",
  "updates": {
    // only include keys that should change: type, category, title, body, dueAt (ISO or null), amount, currency, occurredAt (ISO), status ("open" or "done", tasks only)
  },
  "reply": "short (under 12 words), casual first-person question PROPOSING the change, not confirming it (e.g. 'change rent to $500?' not 'updated rent to $500'), no emoji. The user still has to confirm before anything is saved",
  "uncertain": true if you're not confident this is the right entry or the right change, else false
}

Respond with ONLY a JSON object, no other text.`;
}

function validateEditUpdates(raw: unknown): EditUpdates {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const updates: EditUpdates = {};

  if (typeof r.type === "string" && ENTRY_TYPES.includes(r.type as EntryType)) {
    updates.type = r.type as EntryType;
  }
  if (typeof r.category === "string" && r.category.trim()) {
    updates.category = r.category.trim().toLowerCase();
  }
  if (typeof r.title === "string" && r.title.trim()) {
    updates.title = r.title.trim();
  }
  if (r.body === null) {
    updates.body = null;
  } else if (typeof r.body === "string" && r.body.trim()) {
    updates.body = r.body.trim();
  }
  if (r.dueAt === null) {
    updates.dueAt = null;
  } else if (isValidIsoDate(r.dueAt)) {
    updates.dueAt = r.dueAt;
  }
  if (typeof r.amount === "number" && Number.isFinite(r.amount)) {
    updates.amount = r.amount;
  }
  if (typeof r.currency === "string" && r.currency.trim()) {
    updates.currency = r.currency.trim().toUpperCase();
  }
  if (isValidIsoDate(r.occurredAt)) {
    updates.occurredAt = r.occurredAt;
  }
  if (r.status === "open" || r.status === "done") {
    updates.status = r.status;
  }

  return updates;
}

export function validateEditResolution(raw: unknown, candidateIds: Set<string>): EditResolution {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const matchedId =
    typeof r.matchedId === "string" && candidateIds.has(r.matchedId) ? r.matchedId : null;
  const updates = validateEditUpdates(r.updates);
  const reply = typeof r.reply === "string" && r.reply.trim() ? r.reply.trim() : "make this change?";
  const uncertain = r.uncertain === true || matchedId === null;

  return { matchedId, updates, reply, uncertain };
}

export async function resolveEdit(
  message: string,
  candidates: EditCandidate[],
): Promise<EditResolution> {
  const raw = await callOpenRouter([
    { role: "system", content: buildResolveEditPrompt(new Date(), candidates) },
    { role: "user", content: message },
  ]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  return validateEditResolution(parsed, new Set(candidates.map((c) => c.id)));
}
