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
│   ├── page.tsx                  Today view: open tasks + today's logs + stats
│   ├── login/                    Email + password sign-in
│   ├── auth/callback/route.ts    OAuth code exchange
│   ├── denied/                   Allow-list rejection page
│   ├── capture/                  Quick-add form: type → category → title/body → save
│   └── entries/                  Timeline of everything, filterable by category
├── components/                   PhoneFrame, Header, BottomNav, EntryCard, CaptureForm, EntriesLive
├── lib/
│   ├── supabase/                 Browser + server + middleware clients (@supabase/ssr)
│   ├── auth/allow-list.ts        ALLOWED_EMAILS env parse + membership check
│   ├── auth/current-user.ts      Server helper: profile from auth.uid()
│   ├── db/queries.ts             Server-side query helpers (today tasks/logs, streak, filters)
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

## Setup (one-time, on Rayner's side)

1. Create a Supabase project (or reuse the old Fitnerds! one). If reusing a project that still has the old fitness tables, run `migrations/0001_migrate_to_rayner_os.sql` first. Then paste `schema.sql` into the SQL editor and run it.
2. Edit the `>>> EDIT` line in `allowed_emails` with the real email.
3. Enable Email auth in Supabase Auth settings (password sign-in, not magic link/OTP).
4. In Supabase Dashboard → Authentication → Users, manually add the user: real email + a password, with "Auto Confirm User" checked. There's no self-serve sign-up UI in the app; single user, so the account is created once, by hand.
5. Copy `.env.example` to `.env.local`. Fill in the URL + anon key from Supabase project settings → API. Put the real email in `ALLOWED_EMAILS`.
6. `npm install && npm run dev` → open `http://localhost:3000`.

## Common edits

- **Add a new category:** add it to `CATEGORIES` in `src/lib/db/types.ts`. Chips in `CaptureForm` and the `/entries` filter bar pick it up automatically; no migration needed since `category` is a plain text column.
- **Change a token (color, shadow, radius):** edit `:root` in `src/app/globals.css`. The Tailwind theme in `tailwind.config.ts` mirrors a few of these so utility classes work too, but the raw CSS tokens are the source of truth.
- **Editing/reordering entries:** not built in v1. `EntryCard` only supports toggle-done (tasks) and delete. Add an edit form if/when that's actually needed.

## Deployment (not yet done)

User asked **to be asked first** before any Vercel deploy. When green-lit:
1. `git push` to GitHub.
2. Import repo into Vercel.
3. Add env vars in Vercel project settings (same three as `.env.local`).
4. Set Supabase Auth → Site URL to the Vercel deployment URL (still relevant if password-reset emails get added later).

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
