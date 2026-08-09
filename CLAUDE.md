# Rayner OS: orientation for Claude

A private, single-user daily-ops journal (Rayner). Next.js 15 (App Router,
TS, `src/`) · Supabase (Postgres + Auth + Realtime) · Tailwind · Vercel
target. **Read [`SPEC.md`](SPEC.md) first**: it has the decisions and
constraints. This repo is **open source (public code, private data)**. See
SPEC.md's "Locked decisions" for what that means in practice.

## How the pieces fit

```
src/
├── app/
│   ├── page.tsx                  Home view: greeting + today's tasks/logs, filterable by category
│   ├── login/                    Email + password sign-in
│   ├── auth/callback/route.ts    OAuth code exchange
│   ├── denied/                   Allow-list rejection page
│   ├── welcome/                  One-time-per-browser-session welcome screen, gated by middleware
│   ├── capture/                  Chat capture (LLM-parsed), the only entry point
│   └── entries/                  Timeline of everything: search + type pills + category select
├── components/                   PhoneFrame, Header, HomeGreeting, HomeEntries, EntriesFilterBar, BottomNav, EntryCard, ChatCapture, EntriesLive
├── lib/
│   ├── supabase/                 Browser + server + middleware clients (@supabase/ssr)
│   ├── auth/allow-list.ts        ALLOWED_EMAILS env parse + membership check
│   ├── auth/current-user.ts      Server helper: profile from auth.uid()
│   ├── ai/                       OpenRouter client + chat-capture message → entry parsing/validation
│   ├── db/queries.ts             Server-side query helpers (today tasks/logs, filters, chat history)
│   ├── db/types.ts               TS types mirroring schema.sql + CATEGORIES constant
│   └── format.ts                 Relative-time / due-date formatters
└── middleware.ts (root)          Per-request session refresh + allow-list redirect
```

## Locked architectural facts

- **Allow-list is enforced twice.** SQL trigger `handle_new_user` only creates a profile for emails in `allowed_emails`. App middleware also redirects non-listed users to `/denied`. The env var `ALLOWED_EMAILS` mirrors the SQL table. Currently just one email, but the mechanism supports more.
- **`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are intentionally public.** The browser opens the Supabase realtime websocket directly (this is what makes realtime work on Vercel serverless). Security is enforced by RLS in `schema.sql`: every table policy is owner-only (`user_id = auth.uid()`), unlike the old fitness-app predecessor which had shared-read policies for two users. **Never** add `NEXT_PUBLIC_` to `service_role` or anything else.
- **One `entries` table, not per-domain tables.** `type` (`task | note | log | event`) + `category` (chip-picked, see `CATEGORIES` in `db/types.ts`) together classify everything. Adding a new category is a UI constant change, not a migration.
- **Realtime is wired in one place:** `EntriesLive` subscribes to `entries` filtered by `user_id` → `router.refresh()`. This is what will make a future Telegram-bot insert show up on the dashboard live.
- **No knowledge graph in Postgres.** That's deliberately deferred to Neo4j later. Don't add an edges/links table here without checking with the user first (see SPEC.md).
- **`telegram_inbox` exists but nothing writes to it yet.** No webhook route built. When building one: `service_role` key only, server-side, never `NEXT_PUBLIC_`.
- **Chat capture (`/capture`) is the only entry point.** The old chip-based `/capture/manual` fallback has been removed. Typed messages are parsed into an `entries` row by an LLM via OpenRouter (`src/lib/ai/`), auto-saved immediately. Uncertain parses get `needs_review = true` instead of blocking on a confirm step: that flag surfaces as a badge on `EntryCard` wherever the entry is shown. A follow-up chat message can correct *only* the most recently created entry, and only within a 15-minute window of it (`CORRECTION_WINDOW_MS` in `src/app/capture/chat-actions.ts`); resolved via the latest `capture_chat` row with a matching `entry_id`. The "restart chat" button in `ChatCapture` clears the visible thread and also hands the server an explicit cutoff, so the next message ignores everything before that click regardless of the 15-minute window. There's no general edit UI yet, so fixing an entry outside the correction window (or an older flagged one) means delete + relog. `OPENROUTER_API_KEY` is server-only, read in `src/lib/ai/openrouter.ts`, never `NEXT_PUBLIC_`.
- **`capture_chat` holds the chat transcript**, not the entries themselves. Page load reads the last 3 hours for display; only the last ~6 rows are sent to the LLM as context per request, to keep token cost bounded. That context (and the correction target) is dropped once the last message is more than 15 minutes old, even if it's still inside the visible 3-hour window: without that cutoff, the LLM has no sense that time passed and will blend a genuinely new, unrelated message into the stale entry instead of creating a separate one.
- **Typography is Newsreader (display/serif) + Inter (body/UI), app-wide.** Set via `next/font/google` in `layout.tsx` as `--font-newsreader`/`--font-inter`. The original Shantell Sans/Caveat hand-drawn fonts have been fully retired (not just the welcome screen); the hand-drawn *shapes* (sketchy card borders, sticker shadows, doodle SVG icons) are untouched for now, this was a typography-only pass. `WelcomeScreen` still keeps its own local paper/ink/pine color palette though, separate from the `:root` tokens in `globals.css`, pending a wider color revamp.
- **Home (`/`) leads with a rotating greeting, not a static wordmark.** `HomeGreeting` (Server Component) picks a random line from a hardcoded list each render (no question marks: this is a greeting, not a chat prompt), standing in for the old "Rayner OS" wordmark on this one page, cactus icon beside it. `/capture` (`CapturePage`'s `pickGreeting()`) does the same for its own greeting (there, questions are fine, e.g. "What's up, Rayner?", since it's prompting a chat reply), both server-side so there's no hydration risk from the randomness. The old open-tasks/streak stat tiles are gone; `HomeEntries` (client component) renders a category-chip row with live counts (tasks + logs today, per category) that filters both the "today's tasks" and "logged today" sections client-side. `getDayStreak`/`getOpenTaskCount` were removed from `db/queries.ts` since nothing calls them anymore.
- **The app has a logo now: a cactus.** `CactusIcon` in `Doodle.tsx`, drawn in the same stroked-path style as the other nav icons but colored (`.cactus-icon` stroke + `.cactus-flower` fill) instead of plain `--ink`, marking it as the brand mark rather than a utility icon. It replaced the "Rayner OS" text wordmark in `Header` (used on `/entries` and `/capture`), sits beside the greeting on home, and also appears centered on `/welcome` and the empty-chat-thread placeholder in `ChatCapture`.
- **Primary accent is green, not blue.** `--accent`/`--accent-soft` in `globals.css` (and the mirrored `rayner`/`rayner-soft` Tailwind tokens, currently unused as utility classes) were changed from blue to the same pine green (`#1e4d3b`) the welcome screen already used, tying the two palettes together. Affects `.check.done`, `.chip-btn.on`, `.sticker-btn.primary`, `.capture-hero`, and `.bubble.user`.
- **`PhoneFrame` takes an optional `className` and forwards its ref,** specifically so every screen (including `/welcome`) renders inside the exact same phone shape/size — one abstraction, not a one-off per screen. `WelcomeScreen` uses `<PhoneFrame className="phone-welcome">` (a modifier class for its distinct paper/ink/pine palette); it's a normal page now (see below), not a fixed-position overlay, so body's own flex centering positions it same as everywhere else.
- **`/welcome` is a real route, gated by middleware, not a client-side popup.** Any authenticated + allowed request without a `welcomed` cookie gets redirected to `/welcome?next=<original path>` (`src/lib/supabase/middleware.ts`, same `next`-param pattern as the `/login` redirect); `/welcome` itself is excluded from that check to avoid a loop. Clicking "Enter" (`WelcomeScreen`) sets `welcomed=1` as a session cookie (no `max-age`, so it clears when the browser closes, not just the tab) and navigates to `next`. This replaced an earlier version (`WelcomeSplash`) that was a client component overlaying the home page via `sessionStorage` — that approach fought the router and didn't compose with deep links; the middleware + real route approach does.
- **`/entries` filters by search + type + category, driven by `EntriesFilterBar`** (client component, reads/writes URL search params via `useRouter`/`useSearchParams`). Search debounces 350ms before updating the URL; `getEntries` in `db/queries.ts` does the actual `ilike` match on title/body server-side (sanitized against PostgREST filter-syntax injection via `sanitizeSearchTerm`), not a client-side filter over an already-fetched page. Type is a 5-pill row (all/tasks/notes/logs/events); category moved from a flat chip row into a `<select>` to cut down on visual clutter.

## Setup (one-time, on Rayner's side)

1. Create a Supabase project (or reuse the old Fitnerds! one). If reusing a project that still has the old fitness tables, run `migrations/0001_migrate_to_rayner_os.sql` first. Then paste `schema.sql` into the SQL editor and run it.
2. Edit the `>>> EDIT` line in `allowed_emails` with the real email.
3. Enable Email auth in Supabase Auth settings (password sign-in, not magic link/OTP).
4. In Supabase Dashboard → Authentication → Users, manually add the user: real email + a password, with "Auto Confirm User" checked. There's no self-serve sign-up UI in the app; single user, so the account is created once, by hand.
5. Copy `.env.example` to `.env.local`. Fill in the URL + anon key from Supabase project settings → API. Put the real email in `ALLOWED_EMAILS`. Add an `OPENROUTER_API_KEY` from [openrouter.ai/keys](https://openrouter.ai/keys) for the chat capture parser.
6. `npm install && npm run dev` → open `http://localhost:3000`.

## Common edits

- **Add a new category:** add it to `CATEGORIES` in `src/lib/db/types.ts`. The `/entries` filter bar picks it up automatically; no migration needed since `category` is a plain text column.
- **Change a token (color, shadow, radius):** edit `:root` in `src/app/globals.css`. The Tailwind theme in `tailwind.config.ts` mirrors a few of these so utility classes work too, but the raw CSS tokens are the source of truth.
- **Editing/reordering entries:** not built in v1. `EntryCard` only supports toggle-done (tasks) and delete. Add an edit form if/when that's actually needed.

## Branching & release workflow

- **`main`** is production. Its Vercel deployment is the real, public production domain.
- **`staging-<major>-<minor>`** (e.g. `staging-1-1`) is a long-lived release branch, one per "big feature" cycle. Vercel auto-deploys it to its own branch URL (`<project>-git-staging-1-1-<scope>.vercel.app`).
- New work branches off the **current** `staging-<major>-<minor>` (not off `main`) as `feature/...`, and merges back into that same staging branch when done.
- Once everything intended for that release has been tested on its staging branch, merge `staging-<major>-<minor>` → `main`. The branch is **kept, not deleted**: a permanent record of that release.
- Immediately after, cut the next one: `staging-<major>-<minor+1>` off the fresh `main`, and repeat.
- Vercel Deployment Protection (Vercel Authentication) should stay enabled so old `staging-*` URLs don't need to be torn down for security: keeping a branch's deployment alive forever is fine as long as it's gated behind login.

## Deployment

Already live on Vercel via the GitHub integration: pushes auto-deploy, no manual `vercel` CLI steps needed locally. `main` is production; see "Branching & release workflow" above for how work gets there. Env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ALLOWED_EMAILS`, `OPENROUTER_API_KEY`) live in Vercel Project Settings → Environment Variables, separate from local `.env`; a new one needs adding there too, not just locally. If setting this project up fresh on a new Vercel project: import the repo, add those four env vars, and set Supabase Auth → Site URL to the production domain.

## v2 hooks (already wired in the schema, not built yet)

- `telegram_inbox`: raw bot messages, `service_role`-only, no RLS policy for `authenticated`. Build the webhook as a Next.js API route that inserts here (and optionally auto-creates an `entries` row).
- `tags` + `entry_tags`: many-to-many tagging exists in the schema; no UI yet.
- Neo4j graph: future, separate system. Populated from `entries`/`tags`, not from anything in this Postgres schema.

## Style conventions (hard rules)

- **Never use em dashes** anywhere in this project: not in code, comments, docs, commit messages, or UI copy. Use a period, comma, colon, or parentheses instead.
- **Commits do not credit Claude as a co-author.** No `Co-Authored-By: Claude` trailer, ever.

## History

This repo started as **Fitnerds!**, a two-user fitness app for Rayner + Ada
(see git history before the Rayner OS rewrite). The Supabase auth/PWA/realtime
scaffolding and hand-drawn design system were carried over; the fitness
domain (workouts, classes, surprise cards) was fully replaced.
