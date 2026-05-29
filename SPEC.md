# Fitnerds! — build brief

A private fitness app for two people (Rayner + Ada). Both can see each other's
activity in real time. Built to be fun now and feed an AI recommendation engine later.

**Stack:** Next.js 15 (App Router, TypeScript) · Supabase (Postgres + Auth + Realtime) ·
Tailwind · deployed on Vercel.

Three files define this project:
- `SPEC.md` — this file (decisions, plan, design)
- `schema.sql` — the database (paste into Supabase SQL Editor)
- `Fitnerds!-home-mockup.html` — **the canonical look. Match it exactly.**

---

## Locked decisions

- **Two users only**, allow-listed by email. Both read everything; each writes only their own data. (Enforced in `schema.sql` via the `allowed_emails` table + `handle_new_user` trigger + RLS.)
- **Fitness First has no public API.** Classes are entered manually. Flow: pick **location → dropdown of classes at that location → start**. A `/manage` screen lets either user bulk-paste the weekly schedule.
- **Workout logging is full:** exercise → sets → reps/weight (optional RPE per set).
- **End-of-session feedback:** enjoyment (1–5) + mood/energy. Captured from day one — it can't be backfilled and it's the most valuable rec signal.
- **Surprise card** on finish: after rating, flip a hand-drawn card. Rule-based for now (PR / streak / first-time / volume / "both trained today"), with rarity tiers (common→legendary). Cards collect into a **shared deck** both users see. Card art/flavor becomes AI-generated in v2.
- **Realtime:** live "who's training now" status, live set updates when peeking a session, and card pops — all via Supabase Realtime (websocket goes to Supabase, not Vercel, which is why this works on serverless).

## Scope

**v1 (build now)**
1. Magic-link auth, allow-list gated → `/denied` for anyone else.
2. Dashboard: live status of both users + recent sessions + deck peek.
3. Start flow: location → class dropdown → press start.
4. Active workout: running timer, log exercises/sets/reps/weight, live to the other person.
5. End flow: enjoyment + mood → surprise-card reveal.
6. History (both users) + Deck (shared).
7. `/manage`: bulk-paste FF schedule + manage locations/exercises.

**v2 (later — schema already supports it)**
- AI recs for classes and workouts based on both users' history + the enjoyment/mood signals.
- Two users is too sparse for pure collaborative filtering → lean content-based (catalog features in `ff_classes`/`exercises`) + `user_prefs` for cold-start + cross-discovery between the two of them.

## Data model (see `schema.sql` for the real thing)

Recsys shape: **catalog + interactions + signals.**
- Catalog: `ff_locations`, `ff_classes` (category/intensity/instructor — content features), `exercises` (category/muscle/equipment), `card_defs`.
- Users: `profiles`, `user_prefs` (goals, preferred class types, availability, injuries).
- Interactions: `workouts` (one per session) + `workout_sets`.
- Signals: `enjoyment` + `mood` on `workouts` (+ implicit recency/frequency from timestamps).
- Gamification: `user_cards` (the earned deck).

## Design system (extract from the mockup — it is the source of truth)

Comic / hand-drawn Excalidraw aesthetic, **mobile-first** (they're on phones at the gym).

- **Fonts (Google):** `Shantell Sans` (UI + display), `Caveat` (loose handwritten accents).
- **Colors:** paper `#f0ebe0` · cream `#faf7ef` · ink `#20201e` · Rayner `#2f4fe0` (soft `#e1e6fd`) · Ada `#ef5a6b` (soft `#fcdfe2`) · highlighter `#ffe066` · live red `#ff3b30`.
- **Hand-drawn boxes:** the wobble comes from asymmetric border-radius, e.g.
  `border-radius: 255px 18px 225px 15px / 15px 225px 15px 255px;` (keep a second variant and alternate so cards don't look identical), `2.5px solid ink` border.
- **Sticker depth:** hard offset shadow, no blur — `box-shadow: 4px 4px 0 var(--ink)`.
- **Background:** faint dot grid (`radial-gradient` dots over paper) — the Excalidraw canvas feel.
- **Motion:** staggered `rise` fade-up on load; pulsing `ping` ring on the live dot; a flip + rarity glow on the card reveal.
- **Icons:** hand-drawn inline SVG strokes (round caps, slight wobble). No icon library — keeps it cohesive.
- Each user gets their signature color everywhere their activity appears.

## Build order (suggested for Claude Code)

1. `npx create-next-app@latest` (TS, App Router, Tailwind, `src/`, alias `@/*`). Add `@supabase/ssr` + `@supabase/supabase-js`.
2. Supabase client utils (browser + server) and `middleware.ts` that: gets the user, checks email is allow-listed, else redirect `/denied`.
3. In Supabase: run `schema.sql`; enable Email auth (magic link); edit `allowed_emails` with the real two emails; seed a couple of `ff_locations`.
4. Auth: `/login` (magic link), `/auth/callback` route, gating.
5. Global styling: port the mockup tokens into `globals.css` + Tailwind theme, load the fonts.
6. Dashboard → Start → Active → End-with-card → History → Deck → Manage.
7. Realtime subscriptions on `workouts` + `workout_sets` (+ `user_cards`).
8. Surprise-card rule engine (server action or Supabase Edge Function): on workout end, detect PR/streak/first/volume, pick a `card_def`, insert a `user_cards` row, return it for the reveal.
9. Deploy: push to GitHub → import to Vercel → set env vars.

## Env (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ALLOWED_EMAILS=rayner@...,ada@...
```

## Stays on your side (your accounts / keys)
- Create the Supabase project; copy URL + anon key; run `schema.sql`; turn on Email auth.
- Create the Vercel project, connect the GitHub repo, add the env vars, deploy.
- Put your real emails in `allowed_emails` (SQL) **and** `ALLOWED_EMAILS` (env).
