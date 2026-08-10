-- ============================================================
-- 0005: calendar
-- Adds the three things entries could not express, plus one
-- generated column so a calendar query is a single indexed scan.
-- Run this in Supabase -> SQL Editor against an existing project.
-- ============================================================

alter table public.entries
  add column if not exists ends_at   timestamptz,
  add column if not exists all_day   boolean not null default false,
  add column if not exists series_id uuid;

-- A task belongs on the calendar by its due date, everything else by when it
-- happened. Defining that once here keeps every calendar query a single
-- indexed range scan instead of two queries merged and re-sorted in the app,
-- and undated tasks fall out as null so they never appear on the grid.
alter table public.entries
  add column if not exists calendar_at timestamptz
  generated always as (case when type = 'task' then due_at else occurred_at end) stored;

create index if not exists entries_calendar_idx
  on public.entries (user_id, calendar_at)
  where calendar_at is not null;

-- Recurring events are materialized as ordinary rows sharing a series_id, so
-- each occurrence stays independently editable and tickable. This index is
-- what makes "delete the whole series" cheap.
create index if not exists entries_series_idx
  on public.entries (user_id, series_id)
  where series_id is not null;
