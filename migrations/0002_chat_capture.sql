-- ============================================================
-- Migration: chat capture
--
-- Adds needs_review to entries (low-confidence LLM parses get
-- flagged instead of silently saved wrong) and capture_chat (the
-- chat transcript behind the /capture chat UI).
--
-- For an existing Supabase project already running schema.sql.
-- On a brand new project, schema.sql alone already includes this.
-- ============================================================

alter table public.entries
  add column if not exists needs_review boolean not null default false;

create table if not exists public.capture_chat (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  entry_id   uuid references public.entries(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists capture_chat_user_created_idx
  on public.capture_chat (user_id, created_at desc);

alter table public.capture_chat enable row level security;

create policy "read own capture_chat" on public.capture_chat for select to authenticated
  using (user_id = auth.uid());
create policy "write own capture_chat" on public.capture_chat for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
