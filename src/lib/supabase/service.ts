import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// The service_role key bypasses RLS entirely. It exists here for exactly one
// reason: the MCP connector and the OAuth endpoints are machine-to-machine
// entry points with no Supabase session and therefore no auth.uid() for RLS to
// key off. Every caller below is responsible for scoping its own queries to a
// user_id it has already proven, because the database will not do it for them.
//
// Never import this from a Client Component, and never expose the key with a
// NEXT_PUBLIC_ prefix. Nothing outside src/lib/mcp and src/app/oauth should
// need it.
let cached: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set");
  }

  cached = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
