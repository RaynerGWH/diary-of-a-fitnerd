# Future ideas / deferred scope

Things explicitly deferred out of the chat-capture feature (2026-08-08), kept
here so they don't get lost.

- **Voice input.** Speech-to-text into the chat box. Dictated messages
  should probably get stricter confidence flagging than typed ones (typed
  text is already "in your tone" and needs less scrutiny).
- **Multi-entry parsing.** One chat message producing multiple entries
  (e.g. "gym at 6, and spent $12 on lunch" → a task + an expenditure log).
  v1 is strictly one entry per message.
- **Real reminders / push notifications.** v1 only sets `due_at`/`occurred_at`
  on entries, no notification system. Would need push infra, a
  cron/worker to check due entries, and a service worker for PWA push.
- **Edit UI for entries.** Chat-capture v1 only lets you correct the most
  recently created entry via a follow-up chat message. Anything older that's
  flagged `needs_review` has no in-app edit form yet, fix by delete +
  relog. A real edit form is still "add if/when actually needed" per
  CLAUDE.md.
