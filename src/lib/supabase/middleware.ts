import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowed } from "@/lib/auth/allow-list";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/denied"];
const WELCOME_PATH = "/welcome";

// Machine entry points: the MCP endpoint, the OAuth token endpoint, and the
// discovery documents. These are called by Anthropic's servers with a bearer
// token and no cookies, so the session redirects below would answer a JSON-RPC
// request with an HTML login page and a 307 instead of the 401 the client needs
// to start the OAuth flow. They authenticate themselves; see
// src/lib/mcp/oauth.ts. /oauth/authorize is deliberately NOT here: that one is
// a real page a human signs into.
const MACHINE_PATHS = ["/api/mcp", "/oauth/token", "/.well-known/"];

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  // Checked before the Supabase client is even built: these paths have no
  // session to refresh, and every request to them would otherwise pay a
  // round-trip to Supabase Auth for nothing.
  if (MACHINE_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // The query string is part of where the user was going, not decoration:
  // /oauth/authorize carries the client id, PKCE challenge and state, and
  // sending someone to a bare /oauth/authorize after login loses the whole
  // authorization request.
  const returnTo = pathname + request.nextUrl.search;

  if (!user) {
    if (isPublic) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", returnTo);
    return NextResponse.redirect(url);
  }

  // Signed in. Enforce allow-list everywhere except /denied (so user can see the reason).
  if (!isAllowed(user.email) && pathname !== "/denied") {
    const url = request.nextUrl.clone();
    url.pathname = "/denied";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Signed in and allowed: bounce away from /login.
  if (isAllowed(user.email) && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // First authenticated page view this browser session: show the welcome
  // screen before anything else, same "next" redirect pattern as /login.
  // The "welcomed" cookie is a session cookie (no max-age), set client-side
  // when "Enter" is clicked, so this fires again next time the browser (not
  // just the tab) is reopened.
  if (pathname !== WELCOME_PATH && !isPublic && !request.cookies.get("welcomed")) {
    const url = request.nextUrl.clone();
    url.pathname = WELCOME_PATH;
    url.search = "";
    url.searchParams.set("next", returnTo);
    return NextResponse.redirect(url);
  }

  return response;
}
