# Exercise Library + Tap-to-Log — design

**Date:** 2026-05-29
**Status:** Approved, implementing
**App:** Fitnerds! (private 2-user fitness app; Next.js 15 + Supabase)

## Context

First feature of a larger batch of feedback. Visual language was decided as
**Direction C (hybrid)**: Strava/Hevy-grade legibility and data layout, while
keeping Fitnerds' identity (ink borders, hard-offset shadows, highlighter,
the blue+red user-dot duo). This spec covers only the exercise library +
tap-to-log; later specs cover muscle-group %, hours/week, progress-vs-last,
goal-aware coaching, and the pre-workout checklist/nudge. The schema here is
shaped so those drop in cleanly.

## Scope

**In:** preloaded searchable exercise library (~870, with images), exercise
picker, active-workout rewrite into exercise *blocks*, custom-exercise
fallback, `/manage` import. New screens built in Direction C.

**Out (future specs):** muscle-group %, hours/week, progress-vs-last, coaching,
checklist/nudge. Block drag-reorder and supersets are out of v1 (schema
supports ordering; UI deferred).

## Data source

[free-exercise-db](https://github.com/yuhonas/free-exercise-db) — ~873
exercises, **public domain (Unlicense)**. Fields per exercise: `name`,
`primaryMuscles[]`, `secondaryMuscles[]`, `equipment`, `category`, `force`,
`level`, `mechanic`, `instructions[]`, `images[]`. The JSON (~1 MB, no images)
is bundled at `src/data/exercises.json`. Images are referenced via the
**jsDelivr CDN** (`cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/<path>`)
— no image hosting to set up.

## Schema changes (additive migration — safe on the ~empty prod DB)

Delivered as `migrations/0001_exercise_library.sql` (paste into Supabase SQL
editor) and mirrored into `schema.sql`.

- **Extend `exercises`**: add `slug text unique` (stable import key),
  `primary_muscles text[]`, `secondary_muscles text[]`, `force`, `level`,
  `mechanic`, `instructions text[]`, `image_urls text[]`,
  `is_custom boolean default false`. Keep existing `primary_muscle` / `category`
  / `equipment` (populated on import for back-compat).
- **New `workout_exercises`** (the block): `id uuid pk`,
  `workout_id → workouts(id) on delete cascade`, `exercise_id → exercises(id)`,
  `exercise_name text not null` (snapshot), `order_index int not null default 0`,
  `created_at`. Index on `workout_id`. RLS mirrors `workout_sets` (read all
  authenticated; write only if you own the parent workout). Added to realtime
  publication + `replica identity full`.
- **`workout_sets`**: add `workout_exercise_id → workout_exercises(id) on delete cascade`
  (nullable for back-compat). `set_index` becomes per-block.

## Seeding mechanism

`/manage` → **"Load / update exercise library"** button → server action reads
bundled JSON and **upserts in batches via the authenticated server client**
(RLS already allows signed-in users to edit `exercises`). Idempotent on `slug`.
**No `service_role` key anywhere.**

## Components

- **`ExercisePicker`** (client modal): search box; filter chips for body part
  (Chest/Back/Shoulders/Arms/Legs/Core/Cardio, mapped from fine-grained
  muscles) + equipment; tappable rows (thumbnail + name + muscle·equipment);
  `+` adds a block. "Create custom" inserts an `is_custom` exercise then adds it.
- **Active workout rewrite** (`/workout/[id]`): renders blocks ordered by
  `order_index`; each block = card (thumbnail, name, muscle/equipment) + sets
  table (set/kg/reps/RPE/✓) + inline "+ add set" + remove. "+ ADD EXERCISE"
  opens the picker.
- **`logSet`** action now takes `workout_exercise_id`; `set_index` computed
  per block. New actions: `addExerciseToWorkout`, `removeWorkoutExercise`.
- **`/manage` exercises section**: shows count + import button + custom
  exercises only (not an 870-row list).
- **Direction C primitives**: introduce clean-C card/stat/table styles in
  `globals.css`; apply to screens this spec touches. Migrating the rest of the
  app to C is a follow-up pass.

## Realtime & peek

Peek + own session subscribe to `workout_exercises` (filter `workout_id`) and
`workout_sets`. Added blocks and sets stream live to the partner.

## Testing

Vitest (new, minimal). Unit-test pure logic: dataset-entry → exercise-row
mapper, muscle → body-part grouping, per-block `set_index` computation.

## Manual steps for the user (cannot be automated — their Supabase)

1. Run `migrations/0001_exercise_library.sql` in the Supabase SQL editor.
2. After deploy, open `/manage` → "Load / update exercise library".
