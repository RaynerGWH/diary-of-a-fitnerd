import { createClient } from "@/lib/supabase/server";
import { isAllowed } from "@/lib/auth/allow-list";

export type AllowedUser = { id: string; email: string };

// Server Actions are their own HTTP entry point: middleware guards page
// navigations, but a POST straight at an action skips that entirely. Anyone
// holding a Supabase session (the anon key and project URL are public by
// design, so an account can exist without ever being allow-listed) would
// otherwise reach action bodies directly. Foreign-key failures against
// `profiles` do stop the writes, but only *after* the work is done, which for
// the capture path means a paid OpenRouter call on someone else's behalf.
// So every action re-checks identity here, at the top, before doing anything.
export async function requireAllowedUser(): Promise<AllowedUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");
  if (!isAllowed(user.email)) throw new Error("not authorized");
  return { id: user.id, email: user.email! };
}
