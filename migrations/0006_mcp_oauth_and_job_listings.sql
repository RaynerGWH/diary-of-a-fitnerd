-- ============================================================
-- Custom MCP connector: job listings + OAuth authorization server.
--
-- Adds the ingest table the MCP tool writes into, plus the three
-- tables that make this app an OAuth 2.1 authorization server so
-- claude.ai can connect to it as a custom connector.
--
-- Run after 0005_calendar.sql.
-- ============================================================

-- ------------------------------------------------------------
-- JOB LISTINGS: raw ingest from the daily Gmail scrape, same shape of
-- idea as telegram_inbox. Kept out of `entries` because the daily
-- re-run needs a real dedupe key (the posting URL) and because a
-- listing carries company/location/deadline that have nowhere honest
-- to live on an entry. Promoting one into an actual task writes an
-- `entries` row and records it here as entry_id.
-- ------------------------------------------------------------
create table if not exists public.job_listings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  company     text,
  url         text not null,
  location    text,
  summary     text,
  deadline    date,
  -- new: just arrived. saved: worth a look. applied: sent. dismissed: no.
  status      text not null default 'new'
                check (status in ('new','saved','applied','dismissed')),
  -- Which connector run produced this row, for tracing a bad scrape back
  -- to its day without keeping the whole raw email.
  source      text not null default 'mcp',
  entry_id    uuid references public.entries(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- The upsert target. The scrape re-surfaces the same posting every
  -- morning until it disappears from the inbox, so re-submitting a URL
  -- must refresh the existing row rather than pile up duplicates.
  unique (user_id, url)
);
create index if not exists job_listings_user_created_idx
  on public.job_listings (user_id, created_at desc);
create index if not exists job_listings_user_status_idx
  on public.job_listings (user_id, status);

-- ------------------------------------------------------------
-- OAUTH: this app is both the resource server (the MCP endpoint) and
-- the authorization server that protects it. Claude is a single
-- pre-registered client, so there is no RFC 7591 registration table:
-- the client id and secret live in env vars.
-- ------------------------------------------------------------

-- Authorization codes. Single-use and short-lived; `consumed_at` is set
-- rather than the row deleted so a replayed code is detectably a replay
-- instead of just an unknown code.
create table if not exists public.oauth_auth_codes (
  code                  text primary key,
  user_id               uuid not null references public.profiles(id) on delete cascade,
  client_id             text not null,
  redirect_uri          text not null,
  scope                 text not null,
  -- PKCE. S256 only: the spec allows "plain" and OAuth 2.1 forbids it.
  code_challenge        text not null,
  code_challenge_method text not null default 'S256' check (code_challenge_method = 'S256'),
  -- RFC 8707 resource indicator, echoed back into the access token's
  -- audience so a token minted for this server can't be replayed at another.
  resource              text,
  expires_at            timestamptz not null,
  consumed_at           timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists oauth_auth_codes_expiry_idx on public.oauth_auth_codes (expires_at);

-- Access and refresh tokens. Opaque rather than JWT: one extra indexed
-- lookup per MCP request buys instant revocation, which matters more here
-- than statelessness for a server that handles one request a day.
-- Only the SHA-256 of each token is stored, so a dump of this table does
-- not hand over working credentials.
create table if not exists public.oauth_tokens (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  client_id          text not null,
  scope              text not null,
  access_token_hash  text not null unique,
  refresh_token_hash text unique,
  audience           text,
  expires_at         timestamptz not null,
  revoked_at         timestamptz,
  last_used_at       timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists oauth_tokens_user_idx on public.oauth_tokens (user_id);
create index if not exists oauth_tokens_refresh_idx on public.oauth_tokens (refresh_token_hash);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.job_listings     enable row level security;
alter table public.oauth_auth_codes enable row level security;
alter table public.oauth_tokens     enable row level security;

-- The owner reads and manages their own listings from the app.
create policy "read own job_listings" on public.job_listings for select to authenticated
  using (user_id = auth.uid());
create policy "write own job_listings" on public.job_listings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The OAuth tables deliberately have no policy for `authenticated`. Codes and
-- token hashes are only ever touched by route handlers holding the
-- service_role key; the anon key is public, so a readable token table would
-- be a readable credential table.

-- Listings stream over realtime for the same reason entries do: a connector
-- write at 10am should appear on /jobs without a manual refresh.
alter table public.job_listings replica identity full;
alter publication supabase_realtime add table public.job_listings;
