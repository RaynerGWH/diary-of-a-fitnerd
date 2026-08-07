-- ============================================================
-- Migration: drop the old Fitnerds! fitness tables
--
-- Run this in the Supabase SQL editor BEFORE re-running schema.sql,
-- if reusing an existing Supabase project that still has the old
-- Fitnerds! schema (workouts, classes, exercises, cards, etc).
--
-- Not needed on a brand new Supabase project. There, schema.sql
-- alone is enough.
--
-- Safe to run more than once, all drops are IF EXISTS.
-- `profiles` and `allowed_emails` are kept as-is: Rayner OS reuses
-- them unchanged.
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

-- Next step: paste schema.sql into the SQL editor and run it. That
-- creates entries, tags, entry_tags, and telegram_inbox, and leaves
-- profiles/allowed_emails/handle_new_user untouched.
