# Welcome to my personal journal app!

What was first a fitness tracker for myself has now become a place for me to jot down everything I need to remember: tasks, logs, expenses, and events across school, work, etc. 

**For anyone viewing this, the code is public but my data is not!** 

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

My **biggest pain point** was how my journal's logs were really random. I would write down a thought, then another, flip a few empty pages forward to "make room" for the previous thought. Then, my journal would be a mess of random thoughts, and I would have to flip through the pages to find what I was looking for. 

> Then I thought to myself: Why not just code an app out to just solve my own problems for once?

So I completely dropped the fitness utility of this app and kept the structure. What I kept was the
skeleton of the previous project I already had: Supabase auth, the PWA setup, and a hand-drawn design system I liked too much to throw away.
What replaced it was a single idea:

> Do not make me classify a thought in order to save it. Let me type my thoughts out in a chat box, then an LLM can work
> out what it was afterwards.

## My app in a nutshell :)

![A flow diagram of the app: a message typed into /capture is classified by intent, then either parsed into one or more new entries and stored, or matched against existing entries for an edit the user confirms.](readme-diagram.png)

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

Sidenote: I used OpenRouter because I wanted the ability to choose smaller, cheaper and faster models!

---

## Running it yourself

You need a Supabase project and an OpenRouter key.

```bash
git clone https://github.com/RaynerGWH/diary-of-a-fitnerd.git
cd diary-of-a-fitnerd
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
