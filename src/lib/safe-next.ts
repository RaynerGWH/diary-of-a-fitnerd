// Both /login and /welcome bounce the user onward to a `next` path taken from
// the query string, so both have to refuse an absolute URL: otherwise
// /login?next=https://evil.example sends someone to an attacker's page at the
// exact moment they've just typed a password, which is a ready-made phishing
// hand-off. Only same-origin paths pass, and "//host" is rejected too since
// browsers read a protocol-relative URL as an absolute one.
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  return next;
}
