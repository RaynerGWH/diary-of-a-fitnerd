-- ============================================================
-- Short-term memory for the agent: LangGraph checkpoints.
--
-- The graph saves its state after every step, keyed by thread_id,
-- which is what lets a conversation survive between requests. Without
-- it, "actually make that $500" arrives with no idea what "that" is.
--
-- Written by hand rather than by LangGraph's own PostgresSaver,
-- because that library needs a direct Postgres connection and this
-- deployment can only reach Supabase over HTTPS. A custom
-- BaseCheckpointSaver talks to these tables through PostgREST, the
-- same path everything else in the service uses.
--
-- That also means these live in `public` and are reachable by the
-- REST API, so the RLS at the bottom is not optional.
--
-- Supersedes the `langgraph` schema created in 0007, which was for
-- the library-managed tables we are no longer using.
--
-- Run after 0007_agent_search_and_threads.sql.
-- ============================================================

-- ------------------------------------------------------------
-- CHECKPOINTS: one row per graph step.
--
-- The whole checkpoint is stored as a single serialized blob rather
-- than being split into per-channel rows. LangGraph's own SQLite saver
-- does the same. It costs some write amplification on a long thread
-- and saves an entire table plus a join, which at one user is the
-- right trade.
--
-- `checkpoint` is base64 text, not bytea: PostgREST returns bytea in
-- a hex format that needs unwrapping on every read, and base64 costs
-- ~33% size on data that is already small.
-- ------------------------------------------------------------
create table if not exists public.agent_checkpoints (
  thread_id            text not null,
  -- Namespace for subgraphs. Empty string for the top-level graph,
  -- never null, because it is part of the primary key.
  checkpoint_ns        text not null default '',
  checkpoint_id        text not null,
  parent_checkpoint_id text,
  -- Serializer tag, e.g. "msgpack". Stored because the deserializer
  -- needs to know how the blob was written.
  type                 text,
  checkpoint           text not null,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  primary key (thread_id, checkpoint_ns, checkpoint_id)
);

-- Resuming a thread asks for its newest checkpoint, which is this
-- index. checkpoint_id is a UUIDv6-style sortable id, so ordering by
-- it descending gives most-recent-first without a timestamp compare.
create index if not exists agent_checkpoints_thread_idx
  on public.agent_checkpoints (thread_id, checkpoint_ns, checkpoint_id desc);

-- ------------------------------------------------------------
-- CHECKPOINT WRITES: pending values from tasks that have run but
-- whose step has not been committed yet.
--
-- This is what makes a resumed run pick up mid-step instead of
-- redoing work: writes already produced are replayed rather than
-- recomputed.
-- ------------------------------------------------------------
create table if not exists public.agent_checkpoint_writes (
  thread_id     text not null,
  checkpoint_ns text not null default '',
  checkpoint_id text not null,
  task_id       text not null,
  idx           integer not null,
  channel       text not null,
  type          text,
  value         text,
  created_at    timestamptz not null default now(),
  primary key (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

create index if not exists agent_checkpoint_writes_lookup_idx
  on public.agent_checkpoint_writes (thread_id, checkpoint_ns, checkpoint_id);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
--
-- These hold conversation state: everything typed into the capture
-- box, plus whatever the agent read back out of `entries`. They sit
-- in `public`, so PostgREST serves them, and the anon key is public
-- because the browser opens its realtime socket with it.
--
-- RLS on with no policies is the correct setting. The agent holds the
-- service_role key and bypasses RLS entirely; nobody else has any
-- business reading these. Same reasoning as the oauth tables in 0006.
-- ------------------------------------------------------------
alter table public.agent_checkpoints       enable row level security;
alter table public.agent_checkpoint_writes enable row level security;

-- The langgraph schema from 0007 is no longer used. Dropped only if
-- empty, so this is a no-op rather than a data loss if anything did
-- land there.
drop schema if exists langgraph restrict;
