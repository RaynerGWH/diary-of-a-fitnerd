export type UUID = string;

export type Profile = {
  id: UUID;
  email: string;
  display_name: string | null;
  created_at: string;
};

export type EntryType = "task" | "log" | "event";
export type EntryStatus = "open" | "done" | "archived";
export type EntrySource = "app" | "telegram";

export const CATEGORIES = [
  "school",
  "work",
  "ra",
  "gym",
  "diet",
  "expenditure",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Entry = {
  id: UUID;
  user_id: UUID;
  type: EntryType;
  category: string;
  title: string;
  body: string | null;
  status: EntryStatus | null;
  due_at: string | null;
  occurred_at: string;
  ends_at: string | null;
  all_day: boolean;
  // Set on every occurrence of a recurring event. Occurrences are ordinary
  // rows, so this is the only thing tying them together.
  series_id: UUID | null;
  amount: number | null;
  currency: string | null;
  source: EntrySource;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
  // Generated in Postgres: due_at for tasks, occurred_at otherwise. Null for
  // undated tasks, which is what keeps them off the calendar.
  calendar_at: string | null;
  // Soft delete, set by the agent rather than the UI. The agent has to resolve
  // which entry you meant before it can delete one, and that resolution is
  // fallible, so its deletes stay recoverable. Every read filters this to null.
  deleted_at: string | null;
};

export type Tag = {
  id: UUID;
  user_id: UUID;
  name: string;
};

export const JOB_STATUSES = ["new", "saved", "applied", "dismissed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// Written by the MCP connector, not by the app's own capture flow. Kept
// separate from Entry because a posting has fields an entry has nowhere to put
// and because the daily re-scrape needs `url` as a dedupe key.
export type JobListing = {
  id: UUID;
  user_id: UUID;
  title: string;
  company: string | null;
  url: string;
  location: string | null;
  summary: string | null;
  deadline: string | null;
  status: JobStatus;
  source: string;
  // Set when a listing has been promoted into a real task on the board.
  entry_id: UUID | null;
  created_at: string;
  updated_at: string;
};

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: UUID;
  user_id: UUID;
  role: ChatRole;
  content: string;
  entry_id: UUID | null;
  // The conversation this message belongs to, and the LangGraph run that
  // produced it. Null on rows written before threading existed.
  thread_id: UUID | null;
  created_at: string;
};
