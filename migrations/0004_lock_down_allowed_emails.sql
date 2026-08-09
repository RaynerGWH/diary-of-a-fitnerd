-- ============================================================
-- 0004: enable RLS on allowed_emails.
--
-- Every other table in this schema had RLS enabled; this one did not, and a
-- table in the `public` schema without RLS is readable by anyone holding the
-- anon key. That key is public by design (it ships in the browser bundle so
-- the realtime websocket can be opened directly), so in practice this meant
-- `select * from allowed_emails` returned the owner's real email address to
-- any stranger who found the project URL.
--
-- No policies are added on purpose. RLS with zero policies denies every
-- client, which is exactly right here: nothing in the app reads this table
-- over PostgREST. The only reader is handle_new_user(), and that function is
-- `security definer`, so it bypasses RLS and keeps working unchanged.
--
-- Same pattern already used for telegram_inbox.
-- ============================================================

alter table public.allowed_emails enable row level security;
