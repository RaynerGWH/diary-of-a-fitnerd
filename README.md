# Welcome to my personal journal app!

What was first a fitness tracker for myself has now become a place for me to jot down everything I need to remember: tasks, logs, expenses, and events across school, work, etc. 

**For anyone who is here, FYI: the code is public but my data is not!** 

> [!NOTE]
> **`<< TEMPLATE >>`** This README is a starting point for you to edit.
> Placeholders marked `<< LIKE THIS >>` are yours to fill in or delete:
> screenshots, the live URL, and anything you would rather phrase in your own
> voice.

<< SCREENSHOT: the /capture chat box mid-conversation. This is the money shot,
put it right here. A second one of the home screen would not hurt. >>

**Live:** << your Vercel URL, or delete this line if you would rather not
publish it. The app is single-user and allow-listed, so a stranger clicking
through only ever reaches the sign-in screen. >>

---

## Where this came from

This repo did not start as a journal. It started as **Fitnerds!**, a fitness 
tracker that I built for myself: workout plan logs, live feedback about my workouts,
insights about how I should change up my diets and lifts. But I kept noticing 
that the thing I actually opened it for was not the workout logging. 
It was that it was the one app on my phone where writing something down took two seconds.

Meanwhile everything else in my life was scattered. Tasks in one notes app,
expenses in another, RA reminders in my head, gym notes in the fitness app,
random thoughts nowhere at all. The problem was never that I lacked apps. It
was that every app wanted me to decide, up front, what kind of thing I was
recording before it would let me record it.

So I completely dropped the fitness utility of this app and kept the structure. What survived was the
scaffolding I had already gotten right: Supabase auth, the realtime plumbing,
the PWA setup, and a hand-drawn design system I liked too much to throw away.
What replaced it was a single idea:

> Do not make me classify a thought in order to save it. Let me type my thoughts out in a chat box, then an LLM can work
> out what it was afterwards.

---

## How it works

### One table, not seven

The obvious schema for "tasks, expenses, gym logs, RA reminders" is one table
per domain. I did not do that, because it is a trap: seven tables means seven
CRUD surfaces, seven query paths, and a migration every time life adds a new
category.

Instead there is one `entries` table. Two columns classify everything:

- **`type`**: `task`, `log`, or `event`. Tasks have a status and a due date,
  events happen at a time, and `log` is the catch-all for everything else.
- **`category`**: freeform text (`school`, `work`, `ra`, `gym`, `diet`,
  `expenditure`, `other`).

Because `category` is plain text and not an enum, adding a new one is a
one-line change to a TypeScript constant. No migration. The filter UI picks it
up automatically.

There used to be a fourth type, `note`, until I admitted that I could not
articulate how a note differed from a log. It got merged away in a migration.
Deleting a concept is a feature.

### Capture is a chat box

`/capture` is the only way in. You type a sentence; an LLM (via OpenRouter)
parses it into one or more entries and saves them.

Three decisions here that were not obvious to me at the start:

**One message can be several things.** The parser returns an *array* of entry
drafts, not one object. "Pay rent and call mom tomorrow" is two tasks in a
single bulk insert. It only splits on genuinely distinct items though: a
sentence with a few extra clauses stays one entry. That is a judgment call the
model has to make, so it was tuned against the real model rather than against
mocks.

**Uncertainty is recorded, not resolved.** When the parser is unsure about a
field, it does not stop and ask. Blocking on a confirmation dialog defeats the
entire point of a fast capture box. Instead the entry saves immediately with a
`needs_review` flag, which shows up as a badge on the card. Fix it later, or
never. Capture never waits on you.

**Edits never auto-apply.** Saying "actually make the rent one $500" runs a
deliberately boring pipeline:

```
message  ->  classify intent ("new" vs "edit") + extract search keywords
         ->  deterministic ILIKE search over YOUR OWN entries  (Postgres, not the LLM)
         ->  LLM picks which candidate matched, and what changed
         ->  prefilled, still-editable form  ->  you press confirm
```

The middle step matters. The model never free-associates across the whole
dataset from memory; it only ever chooses among rows a plain keyword search
already returned. And the last step matters more: an edit is destructive in a
way a create is not, so a wrong guess must never be able to silently overwrite
something. Creates auto-save. Edits always end in a human confirming.

This replaced an earlier design (a 15-minute "correction window" that
auto-applied, and could only ever fix the single most recent entry) that was
both more magical and much worse.

### Realtime, wired once

One component, `EntriesLive`, subscribes to `entries` filtered by `user_id` and
calls `router.refresh()`. That is the whole realtime layer. The browser opens
the websocket to Supabase directly, which is what makes it work on Vercel's
serverless runtime, and it means a future Telegram bot inserting a row from
outside the app will show up on the dashboard live with no extra work.

---

## The security model

This is the part worth reading if you are here to evaluate the code, because
"public repo, private data" is easy to say and easy to get wrong.

**Two environment variables are public on purpose.**
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` ship in the
browser bundle. That is by design and it is how the realtime websocket gets
opened from the client. The anon key is not a secret, in the same way a
Firebase web API key is not a secret. Security does not come from hiding it.

**Security comes from row-level security.** Every table has RLS enabled and
every policy is owner-only (`user_id = auth.uid()`). Holding the anon key gets
you exactly nothing without a session, and a session gets you exactly your own
rows. Two tables (`allowed_emails`, `telegram_inbox`) have RLS on and *no*
client policies at all, which denies every client outright; the only things
that touch them are a `security definer` trigger and a future server-side
webhook.

**Access is allow-listed twice, at two different layers.** A SQL trigger
refuses to create a profile row for an email that is not in `allowed_emails`,
and the Next.js middleware redirects anyone not on the list to `/denied`. There
is no sign-up UI. Even if someone creates a Supabase account against the public
project URL, they have no profile row, so foreign keys reject their writes.

**Server Actions re-check identity themselves.** Middleware guards page
navigations, but a POST aimed straight at a Server Action never passes through
it. So every action calls `requireAllowedUser()` as its first line rather than
relying on the middleware to have done it. This matters most on the capture
path, where the check has to happen *before* the paid LLM call, not after.

**Secrets that are actually secret stay server-side.** `OPENROUTER_API_KEY` is
read only inside `src/lib/ai/openrouter.ts`. The `service_role` key is not used
by this app at all. Neither is ever prefixed `NEXT_PUBLIC_`.

**Untrusted input is treated as untrusted.** Search terms are sanitized against
PostgREST filter-syntax injection before they reach an `ilike`. Everything the
LLM returns is run through a validator that falls back to safe defaults instead
of trusting the shape of the JSON. Redirect targets from `?next=` must be
same-origin relative paths, so a crafted login link cannot bounce you to a
phishing page right after you type your password.

---

## Stack

| | |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript, Server Actions) |
| Database | Supabase (Postgres + Auth + Realtime) |
| Styling | Tailwind, over a hand-drawn design system |
| Parsing | OpenRouter (model configurable, defaults to a small fast one) |
| Tests | Vitest |
| Hosting | Vercel |

Typography is Newsreader for display and Inter for UI. The visual language
(sketchy borders, hard-offset sticker shadows, doodle SVG icons, a cactus for a
logo) is carried over from Fitnerds!, and the whole app renders inside a fixed
phone frame because it is a phone app that happens to run in a browser.

<< SCREENSHOT: the phone frame / design system, if you want to show it off >>

---

## Running it yourself

You need a Supabase project and an OpenRouter key.

```bash
git clone https://github.com/<< your-username >>/<< repo >>.git
cd << repo >>
npm install
cp .env.example .env.local
```

1. **Database.** Paste `schema.sql` into the Supabase SQL editor and run it.
   Edit the line marked `>>> EDIT` to hold your real email before running.
2. **Auth.** Enable email + password sign-in. There is no sign-up UI by
   design, so create your user by hand in Authentication -> Users with "Auto
   Confirm User" checked.
3. **Environment.** Fill in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
     Supabase project settings
   - `ALLOWED_EMAILS` with the same email you put in `allowed_emails`
   - `OPENROUTER_API_KEY` from [openrouter.ai/keys](https://openrouter.ai/keys)
4. **Go.**

```bash
npm run dev        # http://localhost:3000
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

Deploying to Vercel: import the repo and add the same four environment
variables in project settings. Set Supabase Auth -> Site URL to your
production domain.

---

## How I work on this

Conventions I hold myself to, written down so I keep holding myself to them.

### Branching

```
main                         production. always deployable.
 └── staging-x-x             one long-lived branch per release cycle
      └── feature/some-thing  branches off staging, merges back into staging
```

- **`main`** is production and maps to the real deployment. 
- **`staging-<major>-<minor>`** is a release branch, one per batch of work.
  Vercel gives it its own preview URL, so a whole release gets tested together
  before it goes near production.
- New work branches off the **current staging branch**, never off `main`, and
  merges back into that same staging branch.
- When a release is done: merge staging into `main`, then immediately cut the
  next staging branch off the fresh `main`.
- Old staging branches are **kept, never deleted**. Each one is a permanent
  record of a release, and its preview deployment stays alive behind Vercel's
  auth gate.

### The main coding style rule

- **Comments explain why, not what.** If a comment restates the line under it,
  it gets deleted. If a decision was non-obvious, it gets written down.

---

## License

[MIT](LICENSE). Use it, fork it, learn from it, build on it. The code is
yours to take; the data was never in here to begin with.

---

<< Optional closing line: who you are, and a link to the rest of your work. A
reader who got this far is interested. >>
