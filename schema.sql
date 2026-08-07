-- ============================================================
-- Rayner OS: Supabase schema
-- A personal daily-ops journal: tasks, notes, logs, schedule,
-- across school / work / RA / gym / diet / expenditure.
-- Designed so entries can later be exported into a Neo4j knowledge
-- graph and ingested from outside the app (telegram_inbox).
-- Paste this into Supabase -> SQL Editor and run.
-- Sections marked  >>> EDIT  need your real values.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- ACCESS CONTROL: only allow-listed emails ever get a profile.
-- >>> EDIT: put your real email(s) here.
-- ------------------------------------------------------------
create table if not exists public.allowed_emails (
  email text primary key
);
insert into public.allowed_emails (email) values
  ('rayner@example.com')   -- >>> EDIT
on conflict do nothing;

-- ------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text,
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ENTRIES: the atomic unit. A task, a note, a log, or an event.
-- category is freeform text (school | work | ra | gym | diet |
-- expenditure | other) so new categories never need a migration.
-- ------------------------------------------------------------
create table if not exists public.entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  type         text not null check (type in ('task','note','log','event')),
  category     text not null default 'other',
  title        text not null,
  body         text,
  status       text check (status in ('open','done','archived')),  -- tasks only
  due_at       timestamptz,                                        -- tasks/events
  occurred_at  timestamptz not null default now(),                 -- when it happened
  amount       numeric(10,2),                                      -- expenditure entries
  currency     text,                                                -- expenditure entries
  source       text not null default 'app' check (source in ('app','telegram')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists entries_user_occurred_idx on public.entries (user_id, occurred_at desc);
create index if not exists entries_user_category_idx on public.entries (user_id, category);
create index if not exists entries_open_tasks_idx on public.entries (user_id, due_at) where type = 'task' and status = 'open';

-- ------------------------------------------------------------
-- TAGS: freeform, many-to-many, orthogonal to category.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Note: no in-Postgres graph-edge table. The real knowledge graph
-- will live in Neo4j (populated from `entries` + `tags` later, likely
-- via an extraction pass) rather than manually-drawn links here.
-- Keeps one source of truth instead of syncing two.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- TELEGRAM INBOX: raw bot messages land here before (optionally)
-- becoming an entry. Not wired up yet; table exists so the bot can
-- be built without another migration.
-- ------------------------------------------------------------
create table if not exists public.telegram_inbox (
  id                  uuid primary key default gen_random_uuid(),
  telegram_message_id bigint,
  chat_id             bigint not null,
  raw_text            text not null,
  processed           boolean not null default false,
  entry_id            uuid references public.entries(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- ------------------------------------------------------------
-- NEW-USER TRIGGER: create a profile ONLY for allow-listed emails.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (select 1 from public.allowed_emails a
             where lower(a.email) = lower(new.email)) then
    insert into public.profiles (id, email, display_name)
    values (new.id, new.email, split_part(new.email, '@', 1))
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Everything is private to its owner. No shared-read policies:
-- unlike Fitnerds, this is a personal journal, not a shared app.
-- ------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.entries       enable row level security;
alter table public.tags          enable row level security;
alter table public.entry_tags    enable row level security;
alter table public.telegram_inbox enable row level security;

-- profiles
create policy "read own profile"   on public.profiles for select to authenticated using (id = auth.uid());
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- entries: fully private, owner only
create policy "read own entries" on public.entries for select to authenticated
  using (user_id = auth.uid());
create policy "write own entries" on public.entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- tags: fully private, owner only
create policy "read own tags" on public.tags for select to authenticated
  using (user_id = auth.uid());
create policy "write own tags" on public.tags for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- entry_tags: gated via parent entry ownership
create policy "read own entry_tags" on public.entry_tags for select to authenticated
  using (exists (select 1 from public.entries e where e.id = entry_id and e.user_id = auth.uid()));
create policy "write own entry_tags" on public.entry_tags for all to authenticated
  using (exists (select 1 from public.entries e where e.id = entry_id and e.user_id = auth.uid()))
  with check (exists (select 1 from public.entries e where e.id = entry_id and e.user_id = auth.uid()));

-- telegram_inbox: no client policies. Only the service_role key (bot webhook,
-- server-side only) touches this table. Deliberately no "authenticated" policy.

-- ------------------------------------------------------------
-- REALTIME: stream entries so a Telegram-bot insert shows up live
-- in the PWA without a refresh.
-- ------------------------------------------------------------
alter table public.entries replica identity full;
alter publication supabase_realtime add table public.entries;
