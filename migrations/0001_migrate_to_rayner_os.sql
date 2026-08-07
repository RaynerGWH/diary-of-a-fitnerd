-- ============================================================
-- Migration: Fitnerds! -> Rayner OS
--
-- For reusing an existing Supabase project that still has the old
-- Fitnerds! fitness schema. Not needed on a brand new project;
-- there, schema.sql alone is enough.
--
-- profiles and allowed_emails are kept as-is: Rayner OS reuses them
-- unchanged, so they're not touched here.
-- ============================================================

drop table if exists public.workout_sets cascade;
drop table if exists public.workout_exercises cascade;
drop table if exists public.workouts cascade;
drop table if exists public.user_cards cascade;
drop table if exists public.card_defs cascade;
drop table if exists public.ff_classes cascade;
drop table if exists public.ff_locations cascade;
drop table if exists public.exercises cascade;
drop table if exists public.user_prefs cascade;

-- category is freeform text (school | work | ra | gym | diet | expenditure |
-- other) rather than an enum, so new categories never need a migration.
-- status/due_at apply to tasks only; amount/currency to expenditure entries.
create table if not exists public.entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  type         text not null check (type in ('task','note','log','event')),
  category     text not null default 'other',
  title        text not null,
  body         text,
  status       text check (status in ('open','done','archived')),
  due_at       timestamptz,
  occurred_at  timestamptz not null default now(),
  amount       numeric(10,2),
  currency     text,
  source       text not null default 'app' check (source in ('app','telegram')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists entries_user_occurred_idx on public.entries (user_id, occurred_at desc);
create index if not exists entries_user_category_idx on public.entries (user_id, category);
create index if not exists entries_open_tasks_idx on public.entries (user_id, due_at) where type = 'task' and status = 'open';

-- Separate from category: tags are freeform many-to-many, for cross-cutting
-- labels that don't fit a single category.
create table if not exists public.tags (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.profiles(id) on delete cascade,
  name     text not null,
  unique (user_id, name)
);

create table if not exists public.entry_tags (
  entry_id  uuid not null references public.entries(id) on delete cascade,
  tag_id    uuid not null references public.tags(id) on delete cascade,
  primary key (entry_id, tag_id)
);

-- Not wired up yet: exists so the future Telegram bot webhook can be built
-- without another migration.
create table if not exists public.telegram_inbox (
  id                  uuid primary key default gen_random_uuid(),
  telegram_message_id bigint,
  chat_id             bigint not null,
  raw_text            text not null,
  processed           boolean not null default false,
  entry_id            uuid references public.entries(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- Everything is private to its owner: no shared-read policies, unlike the
-- old Fitnerds! schema, since this is a personal journal, not a shared app.
alter table public.entries       enable row level security;
alter table public.tags          enable row level security;
alter table public.entry_tags    enable row level security;
alter table public.telegram_inbox enable row level security;

create policy "read own entries" on public.entries for select to authenticated
  using (user_id = auth.uid());
create policy "write own entries" on public.entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read own tags" on public.tags for select to authenticated
  using (user_id = auth.uid());
create policy "write own tags" on public.tags for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- entry_tags has no user_id of its own, so ownership is checked through the
-- parent entry.
create policy "read own entry_tags" on public.entry_tags for select to authenticated
  using (exists (select 1 from public.entries e where e.id = entry_id and e.user_id = auth.uid()));
create policy "write own entry_tags" on public.entry_tags for all to authenticated
  using (exists (select 1 from public.entries e where e.id = entry_id and e.user_id = auth.uid()))
  with check (exists (select 1 from public.entries e where e.id = entry_id and e.user_id = auth.uid()));

-- Deliberately no "authenticated" policy on telegram_inbox: only the
-- service_role key (bot webhook, server-side only) may touch this table.

-- entries streams over realtime so a future Telegram-bot insert shows up on
-- the dashboard live, without a manual refresh.
alter table public.entries replica identity full;
alter publication supabase_realtime add table public.entries;
