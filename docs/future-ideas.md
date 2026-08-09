# Future ideas / deferred scope

Things explicitly deferred out of the chat-capture feature (2026-08-08), kept
here so they don't get lost.

- **Voice input.** Speech-to-text into the chat box. Dictated messages
  should probably get stricter confidence flagging than typed ones (typed
  text is already "in your tone" and needs less scrutiny).
- **Real reminders / push notifications.** v1 only sets `due_at`/`occurred_at`
  on entries, no notification system. Would need push infra, a
  cron/worker to check due entries, and a service worker for PWA push.
