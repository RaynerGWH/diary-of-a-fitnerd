-- ============================================================
-- 0001 — Exercise library + tap-to-log blocks
-- Run this in the Supabase SQL editor on an existing project that
-- already has the base schema.sql applied. Idempotent (safe to re-run).
-- New projects get all of this from schema.sql directly.
-- ============================================================

-- ---- Extend the exercises catalog with content features --------------
alter table public.exercises
  add column if not exists slug              text,
  add column if not exists primary_muscles   text[] not null default '{}',
  add column if not exists secondary_muscles text[] not null default '{}',
  add column if not exists force             text,
  add column if not exists level             text,
  add column if not exists mechanic          text,
  add column if not exists instructions      text[] not null default '{}',
  add column if not exists image_urls        text[] not null default '{}',
  add column if not exists is_custom         boolean not null default false;

create unique index if not exists exercises_slug_key on public.exercises (slug);

-- ---- workout_exercises: one row per exercise added to a session ------
-- (the "block"). Sets hang off this so an added-but-unlogged exercise
-- still persists and streams to a peeking partner.
create table if not exists public.workout_exercises (
  id            uuid primary key default gen_random_uuid(),
  workout_id    uuid not null references public.workouts(id) on delete cascade,
  exercise_id   uuid references public.exercises(id),
  exercise_name text not null,
  order_index   int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists workout_exercises_workout_idx
  on public.workout_exercises (workout_id, order_index);

-- ---- Link sets to their block ----------------------------------------
alter table public.workout_sets
  add column if not exists workout_exercise_id uuid
    references public.workout_exercises(id) on delete cascade;
create index if not exists workout_sets_we_idx
  on public.workout_sets (workout_exercise_id);

-- ---- RLS: read all, write only if you own the parent workout ---------
alter table public.workout_exercises enable row level security;

drop policy if exists "read workout_exercises" on public.workout_exercises;
create policy "read workout_exercises" on public.workout_exercises
  for select to authenticated using (true);

drop policy if exists "write own workout_exercises" on public.workout_exercises;
create policy "write own workout_exercises" on public.workout_exercises
  for all to authenticated
  using (exists (select 1 from public.workouts w
                 where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.workouts w
                      where w.id = workout_id and w.user_id = auth.uid()));

-- ---- Realtime --------------------------------------------------------
alter table public.workout_exercises replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.workout_exercises;
exception when duplicate_object then null; end $$;
