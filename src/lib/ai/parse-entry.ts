import { CATEGORIES, type EntryType } from "@/lib/db/types";
import { callOpenRouter } from "./openrouter";

const ENTRY_TYPES: EntryType[] = ["task", "note", "log", "event"];
const KNOWN_FIELDS = ["type", "category", "title", "body", "dueAt", "occurredAt", "amount", "currency"];

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ParsedEntry = {
  isCorrection: boolean;
  type: EntryType;
  category: string;
  title: string;
  body: string | null;
  dueAt: string | null;
  occurredAt: string | null;
  amount: number | null;
  currency: string | null;
  uncertainFields: string[];
  reason: string | null;
  reply: string;
};

function buildSystemPrompt(now: Date): string {
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  return `You are the parser behind a personal daily-ops journal's chat capture box.
Turn the user's message into exactly one journal entry as JSON.

Current date/time: ${now.toISOString()} (${weekday}). Resolve relative dates ("tomorrow", "friday") against this.

Fields to return, all required:
- isCorrection (boolean): true only if this message is clearly correcting/adjusting the entry you just logged in the previous turn (e.g. "actually make it due tomorrow", "no, category should be work"), not a new independent thing.
- type: one of "task" | "note" | "log" | "event".
- category: one of ${CATEGORIES.join(", ")} if it clearly fits, else a short freeform lowercase word.
- title: short (a few words), in the user's own words, not a restatement.
- body: optional extra detail, or null.
- dueAt: ISO 8601 datetime, only for tasks with a due date, else null.
- occurredAt: ISO 8601 datetime this happened/happens, else null to default to now.
- amount: number, only if this is an expenditure with a clear amount, else null.
- currency: 3-letter currency code if amount is set, else null.
- uncertainFields: array of the field names above you're genuinely unsure about (e.g. ambiguous category, no clear date despite a due-date-sounding message). Empty array if confident.
- reason: one short sentence explaining the uncertainty, or null if uncertainFields is empty.
- reply: a short (under 12 words), casual first-person confirmation of what you logged, no emoji.

Respond with ONLY a JSON object with exactly these fields.`;
}

function isValidIsoDate(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && !Number.isNaN(new Date(v).getTime());
}

// Defensive against whatever the model actually returns: unknown/missing
// fields fall back to safe defaults and get added to uncertainFields, so a
// malformed parse is flagged for review instead of silently saved wrong.
export function validateParsed(raw: unknown, fallbackTitle: string): ParsedEntry {
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
    type = "note";
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
  const amount = typeof r.amount === "number" && Number.isFinite(r.amount) ? r.amount : null;
  const currency =
    amount !== null
      ? typeof r.currency === "string" && r.currency.trim()
        ? r.currency.trim().toUpperCase()
        : "SGD"
      : null;

  const reply = typeof r.reply === "string" && r.reply.trim() ? r.reply.trim() : "logged that";
  const reason = typeof r.reason === "string" && r.reason.trim() ? r.reason.trim() : null;

  return {
    isCorrection: r.isCorrection === true,
    type,
    category,
    title,
    body,
    dueAt,
    occurredAt,
    amount,
    currency,
    uncertainFields: Array.from(uncertain),
    reason,
    reply,
  };
}

export async function parseMessage(message: string, context: ChatTurn[]): Promise<ParsedEntry> {
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
  return validateParsed(parsed, message);
}
