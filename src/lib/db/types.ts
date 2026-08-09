export type UUID = string;

export type Profile = {
  id: UUID;
  email: string;
  display_name: string | null;
  created_at: string;
};

export type EntryType = "task" | "note" | "log" | "event";
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
  amount: number | null;
  currency: string | null;
  source: EntrySource;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
};

export type Tag = {
  id: UUID;
  user_id: UUID;
  name: string;
};

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: UUID;
  user_id: UUID;
  role: ChatRole;
  content: string;
  entry_id: UUID | null;
  created_at: string;
};
