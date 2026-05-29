# Fitnerds! — orientation for Claude

A private fitness app for **exactly two users** (Rayner + Ada). Next.js 15
(App Router, TS, `src/`) · Supabase (Postgres + Auth + Realtime) · Tailwind ·
Vercel target. **Read [`SPEC.md`](SPEC.md) first** — it has the decisions and
constraints. **The canonical look is [`Fitnerds!-home-mockup.html`](Fitnerds!-home-mockup.html)**.

## How the pieces fit

```
src/
├── app/
│   ├── page.tsx                  Dashboard (live banner, start hero, stats, lately, deck peek)
│   ├── login/                    Magic-link sign-in
│   ├── auth/callback/route.ts    OAuth code exchange
│   ├── denied/                   Allow-list rejection page
│   ├── start/                    Pick location → class → start a workout
│   ├── workout/[id]/             Active session: timer + set logger + live SetList
│   ├── workout/[id]/peek/        Read-only view of the partner's session
│   ├── workout/[id]/end/         Enjoyment + mood + card reveal
│   ├── history/                  Both users' completed sessions
│   ├── deck/                     Shared card collection
│   └── manage/                   Locations, classes (bulk-paste), exercises
├── components/                   PhoneFrame, Header, BottomNav, ActivityCard, etc.
├── lib/
│   ├── supabase/                 Browser + server + middleware clients (@supabase/ssr)
│   ├── auth/allow-list.ts        ALLOWED_EMAILS env parse + membership check
│   ├── auth/current-user.ts      Server helper: profile from auth.uid()
│   ├── db/queries.ts             Server-side query helpers (workouts, classes, deck, streak)
│   ├── db/types.ts               TS types mirroring schema.sql
│   ├── cards/rules.ts            Surprise-card rule engine (called from finishWorkout)
│   ├── schedule-parser.ts        Parses pasted FF weekly schedule text
│   └── format.ts                 Duration / relative-time formatters
└── middleware.ts (root)          Per-request session refresh + allow-list redirect
```

## Locked architectural facts

- **Allow-list is enforced twice.** SQL trigger `handle_new_user` only creates a profile for emails in `allowed_emails`. App middleware also redirects non-listed users to `/denied`. The env var `ALLOWED_EMAILS` mirrors the SQL table.
- **`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are intentionally public.** The browser opens the Supabase realtime websocket directly (this is what makes realtime work on Vercel serverless). Security is enforced by RLS in `schema.sql`. **Never** add `NEXT_PUBLIC_` to `service_role` or anything else.
- **Mockup is the design oracle.** Tokens live in `src/app/globals.css`: paper / cream / ink / rayner / ada / hi / live, plus the `--sketch*` asymmetric border-radius variables and `4px 4px 0 ink` hard-offset shadows. Alternate `.card` and `.card.alt` so stacked cards don't look identical (matches mockup behavior).
- **Realtime is wired in three components**:
  - `DashboardLive` — subscribes to `workouts` (any change → `router.refresh()`).
  - `SetList` — subscribes to `workout_sets` filtered by workout id (peek + own session).
  - `DeckGrid` — subscribes to `user_cards`.
- **The card rule engine** (`src/lib/cards/rules.ts`) runs server-side at end-of-workout and picks the rarest qualifying card. Codes match the seeded `card_defs` rows in `schema.sql`: `first_session`, `pr_lift`, `legend_30`, `streak_7`, `first_class`, `together`, `tonnage`. Rarity tiebreak via `RARITY_WEIGHT`.

## Setup (one-time, on Rayner's side)

1. Create a Supabase project. Paste `schema.sql` into the SQL editor and run it.
2. Edit the two `>>> EDIT` lines in `allowed_emails` with the real emails. Seed a couple of `ff_locations` to make `/start` usable.
3. Enable Email auth → magic link in Supabase Auth settings.
4. Copy `.env.example` to `.env.local`. Fill in the URL + anon key from Supabase project settings → API. Put both real emails (comma-separated) in `ALLOWED_EMAILS`.
5. `npm install && npm run dev` → open `http://localhost:3000`.

## Common edits

- **Add a new card type:** add a row in `card_defs` (SQL) with a unique `code`. Add a new rule in `RULES` array in `src/lib/cards/rules.ts` that returns that code. The reveal page renders whatever the engine returns — no other edits needed.
- **Change a token (color, shadow, radius):** edit `:root` in `src/app/globals.css`. The Tailwind theme in `tailwind.config.ts` mirrors a few of these so utility classes work too, but the raw CSS tokens are the source of truth.
- **Bulk-load FF schedule:** `/manage` → pick a location → paste lines like `Mon\n07:00  HIIT 45  Jess  45`. Whitespace-separated, 4 columns. Toggle "replace" to wipe existing.

## Deployment (not yet done)

User asked **to be asked first** before any Vercel deploy. When green-lit:
1. `git push` to GitHub.
2. Import repo into Vercel.
3. Add env vars in Vercel project settings (same three as `.env.local`).
4. Set Supabase Auth → Site URL to the Vercel deployment URL so magic-link redirects work.

## v2 hooks (already wired in the schema)

- `user_prefs` (goals, preferred class types, availability, injuries) for cold-start recs.
- `enjoyment` + `mood` per workout are the recsys signal — captured from day one, never backfillable.
- `ff_classes` has content features (category, intensity, instructor) for content-based recs.
- `exercises` similarly carries category / primary_muscle / equipment.
