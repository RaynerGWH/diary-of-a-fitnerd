# Rayner OS: build brief

A personal daily-ops journal for one person (Rayner). Tasks, notes, logs, and
schedule entries across school / work / RA / gym / diet / expenditure, in one
place instead of scattered across notebook pages. Built to grow forever:
eventually feeding a Telegram-bot capture flow and a Neo4j knowledge graph.

**Stack:** Next.js 15 (App Router, TypeScript) · Supabase (Postgres + Auth +
Realtime) · Tailwind · deployed on Vercel · installable as a PWA.

Two files define this project:
- `SPEC.md`: this file (decisions, plan, design)
- `schema.sql`: the database (paste into Supabase SQL Editor)

This repo is **open source / public code**. The code, schema, and design are
free for anyone to read or fork. The actual data (your tasks, notes, RA
work, expenditure) is **never public**: it lives in your own private
Supabase project, gated behind email+password auth, an allow-list, and Postgres RLS.
Never commit real entries, real emails, or the `service_role` key.

## Locked decisions

- **Single user**, allow-listed by email (the mechanism supports adding more
  emails later without a redesign, same pattern as the app's fitness-app
  predecessor, just pointed at one person for now).
- **One unified `entries` table** is the atomic unit, not separate tables
  per domain. An entry has a `type` (`task | note | log | event`) and a
  freeform-but-guided `category` (school / work / ra / gym / diet /
  expenditure / other, picked via chips in the capture UI). This keeps the
  schema simple now and avoids seven half-finished domain-specific tables.
- **Capture is the core interaction.** One form, four type choices, one tap
  to a category chip, save. The whole point is friction low enough that
  logging something takes less effort than flipping to a new notebook page.
- **Today view is the home screen.** Open tasks (due/overdue first, then
  no-due-date) at the top, then everything logged today below. Planner-style,
  not an infinite feed: the app should answer "what should I look at right
  now."
- **No in-Postgres knowledge graph.** The real graph will live in **Neo4j**,
  populated from `entries` (and later an extraction pass) once there's enough
  data to make graphing worthwhile. Postgres stays a plain relational store,
  no `entry_links` table, no premature graph modeling.
- **Telegram bot ingestion is a fast-follow, not v1.** `telegram_inbox` exists
  in the schema so the webhook can be built without another migration, but
  the bot itself isn't wired up yet.
- **Realtime:** `entries` streams to the client so a future Telegram-bot
  insert shows up on the dashboard without a manual refresh, same mechanism
  the fitness-app predecessor used for "who's training now."

## Scope

**v1 (build now)**
1. Email+password auth, allow-list gated → `/denied` for anyone else. No self-serve sign-up; the one account is created by hand in the Supabase Dashboard.
2. Today view: open tasks + today's notes/logs + streak/open-count stats.
3. Capture flow: type → category chip → title/body → (due date | amount) → save.
4. Entries/timeline: browse everything, filter by category.

**v2 (later, schema already supports it)**
- Telegram bot webhook writes into `telegram_inbox`, optionally auto-creating
  an `entries` row.
- Export/sync `entries` (+ tags) into a Neo4j graph; explore connections
  between tasks, notes, and events instead of just a flat list.
- Editing entries in place (v1 only supports create / toggle-done / delete).
- Tag management UI (the `tags` + `entry_tags` tables exist; no UI yet).

## Data model (see `schema.sql` for the real thing)

- `profiles`: one row per allow-listed user.
- `entries`: the atomic unit: type, category, title, body, status (tasks
  only), due_at, occurred_at, amount/currency (expenditure), source
  (`app` | `telegram`).
- `tags` + `entry_tags`: freeform many-to-many tagging, orthogonal to
  category. No UI yet, schema-only for now.
- `telegram_inbox`: raw bot messages land here before becoming an entry.
  Server-side only (`service_role`), no client RLS policy.

## Design system

Carried over from the fitness-app predecessor's hand-drawn Excalidraw
aesthetic (`tandem-home-mockup.html` is the historical reference for the
visual language, not a live spec for this app's screens).

- **Fonts (Google):** `Shantell Sans` (UI + display), `Caveat` (loose
  handwritten accents).
- **Colors:** paper `#f0ebe0` · cream `#faf7ef` · ink `#20201e` · accent
  (blue) `#2f4fe0` · urgent (overdue/danger) `#ef5a6b` · highlighter `#ffe066`.
  The old two-person rayner/ada color split is gone; single user, one accent.
- **Hand-drawn boxes:** asymmetric border-radius wobble (`--sketch*` tokens
  in `globals.css`), `2.5px solid ink` border, alternate `.card`/`.card.alt`
  so stacked cards don't look identical.
- **Sticker depth:** hard offset shadow, no blur: `box-shadow: 4px 4px 0 ink`.
- **Background:** faint dot grid, the Excalidraw canvas feel.
- **Icons:** hand-drawn inline SVG strokes (`src/components/Doodle.tsx`), no
  icon library.

## Env (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ALLOWED_EMAILS=rayner@...
```

## Stays on your side (your accounts / keys)
- Create the Supabase project (or reuse the old Fitnerds! one, running
  `migrations/0001_migrate_to_rayner_os.sql` first to clear the old fitness
  tables); copy URL + anon key; run `schema.sql`; turn on Email auth.
- Create the Vercel project, connect the GitHub repo, add the env vars,
  deploy.
- Put your real email in `allowed_emails` (SQL) **and** `ALLOWED_EMAILS`
  (env). Never commit either with a real value: keep the placeholder in
  `schema.sql` and only fill the real one in the Supabase SQL editor / Vercel
  env settings.
