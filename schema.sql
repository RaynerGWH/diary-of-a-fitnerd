-- ============================================================
-- Fitnerds! — Supabase schema
-- Shared fitness app for two allow-listed users (Rayner + Ada).
-- Designed so a future recommendation engine can train on it:
--   catalog (items) + interactions (events) + signals (feedback).
-- Paste this into Supabase -> SQL Editor and run.
-- Sections marked  >>> EDIT  need your real values.
-- day_of_week convention: 0 = Sunday ... 6 = Saturday (JS getDay()).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- ACCESS CONTROL: only these two emails ever get a profile.
-- >>> EDIT: put your real emails here.
-- ------------------------------------------------------------
create table if not exists public.allowed_emails (
  email text primary key
);
insert into public.allowed_emails (email) values
  ('rayner@example.com'),   -- >>> EDIT
  ('ada@example.com')       -- >>> EDIT
on conflict do nothing;

-- ------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text,
  color         text,                       -- signature hex, e.g. '#2f4fe0'
  created_at    timestamptz not null default now()
);

-- Cold-start / content-based signal for v2 recs (no rec model yet, but capture intent).
create table if not exists public.user_prefs (
  user_id               uuid primary key references public.profiles(id) on delete cascade,
  goals                 text[] default '{}',   -- {strength, endurance, weight_loss, ...}
  preferred_class_types text[] default '{}',   -- {hiit, spin, yoga, ...}
  available_days        int[]  default '{}',   -- 0..6
  preferred_times       text[] default '{}',   -- {morning, lunch, evening}
  avoid_notes           text,                  -- injuries / no-go movements
  updated_at            timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CATALOG (the recommendable items + their content features)
-- ------------------------------------------------------------
create table if not exists public.ff_locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.ff_classes (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.ff_locations(id) on delete cascade,
  name         text not null,
  category     text,            -- hiit | spin | yoga | strength | cycle | ...  (content feature)
  intensity    int,             -- 1..5                                          (content feature)
  instructor   text,
  day_of_week  int,             -- 0..6
  start_time   time,
  duration_min int,
  created_at   timestamptz not null default now()
);

create table if not exists public.exercises (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  category       text,          -- push | pull | legs | core | cardio (content feature)
  primary_muscle text,
  equipment      text,
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- INTERACTIONS (one row per training session) + SIGNALS
-- ------------------------------------------------------------
create table if not exists public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  type         text not null default 'strength'
                 check (type in ('strength','class','cardio','other')),
  location_id  uuid references public.ff_locations(id),
  class_id     uuid references public.ff_classes(id),
  title        text,
  status       text not null default 'active'
                 check (status in ('active','completed','abandoned')),
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  duration_sec int,
  -- SIGNALS (captured at end-of-session; CANNOT be backfilled later):
  enjoyment    smallint check (enjoyment between 1 and 5),
  mood         text,            -- 'strong' | 'wiped' | 'energised' | ...
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists workouts_user_started_idx on public.workouts (user_id, started_at desc);
-- fast lookup of who is training right now (live status):
create index if not exists workouts_active_idx on public.workouts (status) where status = 'active';

create table if not exists public.workout_sets (
  id            uuid primary key default gen_random_uuid(),
  workout_id    uuid not null references public.workouts(id) on delete cascade,
  exercise_id   uuid references public.exercises(id),
  exercise_name text not null,        -- denormalised so freeform sets still log
  set_index     int  not null default 1,
  reps          int,
  weight        numeric(6,2),
  rpe           smallint,             -- optional per-set effort, nice for recs later
  logged_at     timestamptz not null default now()
);
create index if not exists workout_sets_workout_idx on public.workout_sets (workout_id);

-- ------------------------------------------------------------
-- SURPRISE CARDS (gamified end-of-workout reveal + shared deck)
-- card_defs = templates; user_cards = earned instances.
-- ------------------------------------------------------------
create table if not exists public.card_defs (
  id       uuid primary key default gen_random_uuid(),
  code     text not null unique,     -- 'pr_lift' | 'streak_7' | 'first_class' | 'tonnage' | ...
  title    text not null,
  flavor   text,
  rarity   text not null default 'common'
             check (rarity in ('common','rare','epic','legendary')),
  trigger  text,                     -- human note on how it's earned
  art_key  text                      -- which doodle to render
);

create table if not exists public.user_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  card_def_id uuid references public.card_defs(id),
  workout_id  uuid references public.workouts(id) on delete set null,
  title       text not null,         -- snapshot (dynamic cards have session-specific text)
  flavor      text,
  rarity      text not null default 'common',
  earned_at   timestamptz not null default now()
);
create index if not exists user_cards_user_idx on public.user_cards (user_id, earned_at desc);

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
-- Both users may READ everything (they share the app).
-- Each user may only WRITE their own workouts/sets/cards/prefs.
-- Catalogs are shared: any signed-in user can edit them.
-- ------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.user_prefs    enable row level security;
alter table public.ff_locations  enable row level security;
alter table public.ff_classes    enable row level security;
alter table public.exercises     enable row level security;
alter table public.workouts      enable row level security;
alter table public.workout_sets  enable row level security;
alter table public.card_defs     enable row level security;
alter table public.user_cards    enable row level security;

-- profiles
create policy "read profiles"   on public.profiles for select to authenticated using (true);
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- user_prefs
create policy "read prefs"   on public.user_prefs for select to authenticated using (true);
create policy "write own prefs" on public.user_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- shared catalogs: read + write for any signed-in user
create policy "read locations"  on public.ff_locations for select to authenticated using (true);
create policy "edit locations"  on public.ff_locations for all to authenticated using (true) with check (true);
create policy "read classes"    on public.ff_classes  for select to authenticated using (true);
create policy "edit classes"    on public.ff_classes  for all to authenticated using (true) with check (true);
create policy "read exercises"  on public.exercises   for select to authenticated using (true);
create policy "edit exercises"  on public.exercises   for all to authenticated using (true) with check (true);
create policy "read carddefs"   on public.card_defs   for select to authenticated using (true);
create policy "edit carddefs"   on public.card_defs   for all to authenticated using (true) with check (true);

-- workouts: read all, write own
create policy "read workouts"   on public.workouts for select to authenticated using (true);
create policy "insert own workout" on public.workouts for insert to authenticated
  with check (user_id = auth.uid());
create policy "update own workout" on public.workouts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own workout" on public.workouts for delete to authenticated
  using (user_id = auth.uid());

-- workout_sets: read all, write only if you own the parent workout
create policy "read sets" on public.workout_sets for select to authenticated using (true);
create policy "write own sets" on public.workout_sets for all to authenticated
  using (exists (select 1 from public.workouts w
                 where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.workouts w
                      where w.id = workout_id and w.user_id = auth.uid()));

-- user_cards: read all (shared deck), write own
create policy "read cards" on public.user_cards for select to authenticated using (true);
create policy "write own cards" on public.user_cards for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- REALTIME: stream these tables to the clients.
-- replica identity full so UPDATE/DELETE payloads include old row.
-- ------------------------------------------------------------
alter table public.workouts     replica identity full;
alter table public.workout_sets replica identity full;
alter table public.user_cards   replica identity full;

alter publication supabase_realtime add table public.workouts;
alter publication supabase_realtime add table public.workout_sets;
alter publication supabase_realtime add table public.user_cards;

-- ------------------------------------------------------------
-- STARTER CARD DEFS (tweak / expand freely)
-- ------------------------------------------------------------
insert into public.card_defs (code, title, flavor, rarity, trigger, art_key) values
  ('first_session', 'First Rep',        'Everyone starts somewhere.',        'common',    'first ever logged session',        'spark'),
  ('tonnage',       'Heavy Hauler',     'You moved a small car today.',      'common',    'session volume milestone',         'dumbbell'),
  ('streak_7',      'Week Warrior',     '7 days, no excuses.',               'rare',      '7-day streak',                     'flame'),
  ('pr_lift',       'New Personal Best','Numbers don''t lie.',               'epic',      'beat a logged PR on any lift',     'trophy'),
  ('first_class',   'Class Act',        'Tried something new.',              'rare',      'first time doing a class type',    'star'),
  ('together',      'In Sync',          'You both trained today.',           'rare',      'both users train same day',        'hearts'),
  ('legend_30',     'Iron Habit',       '30-day streak. Respect.',           'legendary', '30-day streak',                    'crown')
on conflict (code) do nothing;
