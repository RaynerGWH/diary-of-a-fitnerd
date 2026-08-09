-- ============================================================
-- Migration: merge notes into logs
--
-- "note" and "log" were never meaningfully distinct entry types in
-- practice. Recategorizes existing 'note' rows as 'log' and tightens
-- the type constraint so new rows can't use 'note' again.
--
-- For an existing Supabase project already running schema.sql.
-- On a brand new project, schema.sql alone already reflects this.
-- ============================================================

update public.entries set type = 'log' where type = 'note';

alter table public.entries drop constraint if exists entries_type_check;
alter table public.entries
  add constraint entries_type_check check (type in ('task', 'log', 'event'));
