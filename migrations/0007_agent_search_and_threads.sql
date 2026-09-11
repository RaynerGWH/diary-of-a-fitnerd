-- ============================================================
-- Agent service: full-text search, soft delete, chat threads.
--
-- Groundwork for the Python LangGraph agent that replaces the
-- TypeScript capture parser. Safe to run before the agent exists:
-- nothing here changes existing behaviour on its own.
--
-- Run after 0006_mcp_oauth_and_job_listings.sql.
-- ============================================================

-- ------------------------------------------------------------
-- FULL-TEXT SEARCH
--
-- Replaces the edit-resolution lookup, which was a single ILIKE
-- over the whole query string:
--
--   .or(`title.ilike.%${term}%,body.ilike.%${term}%`)
--
-- The model returns "a few keywords", so that became a literal
-- substring match on "gym thing last week" and found nothing
-- unless that exact phrase appeared in a title. No word splitting,
-- no stemming, and the filler words actively poisoned the match.
--
-- A generated column rather than a trigger, matching calendar_at
-- below it: Postgres keeps it in step with title and body, so it
-- cannot drift the way trigger-maintained state does.
--
-- The two-argument to_tsvector is IMMUTABLE (the one-argument form
-- is only STABLE, because it reads the session's text search
-- config), which is what makes it legal in a generated column.
-- ------------------------------------------------------------
alter table public.entries
  add column if not exists fts tsvector
    generated always as (
      to_tsvector('english', title || ' ' || coalesce(body, ''))
    ) stored;

-- ------------------------------------------------------------
-- SOFT DELETE
--
-- The agent resolves which entry you meant, and resolution is the
-- flaky part. Pairing a shaky resolver with an irreversible delete
-- is the bad combination, so an agent delete sets this column and
-- the row stays recoverable. The UI keeps hard-deleting through
-- deleteEntry, where you picked the row yourself.
--
-- Every read in src/lib/db/queries.ts must filter `deleted_at is
-- null`. Missing one leaks ghost rows into that view.
-- ------------------------------------------------------------
alter table public.entries
  add column if not exists deleted_at timestamptz;

-- Partial: the deleted set is never searched, so it does not
-- belong in the index.
create index if not exists entries_fts_idx
  on public.entries using gin (fts)
  where deleted_at is null;

create index if not exists entries_live_idx
  on public.entries (user_id, occurred_at desc)
  where deleted_at is null;

-- ------------------------------------------------------------
-- CHAT THREADS
--
-- One thread per conversation. A new one is minted on "restart
-- chat", or when the newest message is older than the existing
-- 15-minute staleness window; otherwise the newest row's thread is
-- reused. That makes the thread id the conversation boundary, which
-- replaces the `after` timestamp the client used to carry.
--
-- It is also the join between a transcript row and the LangGraph
-- run that produced it, so a weird reply stops being guesswork.
--
-- Nullable on purpose: existing rows predate threading and
-- backfilling them would invent conversations that never happened.
-- ------------------------------------------------------------
alter table public.capture_chat
  add column if not exists thread_id uuid;

create index if not exists capture_chat_thread_idx
  on public.capture_chat (user_id, thread_id, created_at);

-- ------------------------------------------------------------
-- CHECKPOINTER SCHEMA
--
-- LangGraph creates its own tables on first run (checkpointer.setup()),
-- so they are not declared here. They hold conversation state, which
-- means they must not be reachable with the anon key -- that key is
-- public, because the browser opens its realtime socket with it.
--
-- Giving them their own schema is what enforces that, rather than RLS.
-- Supabase's PostgREST only serves schemas on an allowlist, and the
-- default allowlist is `public` alone, so a table in here has no HTTP
-- endpoint at all. Not "reachable but filtered by a policy you could get
-- wrong" -- simply no door. The agent is unaffected: it holds a direct
-- Postgres connection, which ignores PostgREST entirely.
--
-- The agent's connection string carries
--   ?options=-csearch_path%3Dlanggraph
-- so setup() creates its tables in here instead of public. Getting that
-- wrong is visible immediately (tables appear in public), rather than
-- being a silent exposure.
-- ------------------------------------------------------------
create schema if not exists langgraph;
