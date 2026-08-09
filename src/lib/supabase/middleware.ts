import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowed } from "@/lib/auth/allow-list";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/denied"];
const WELCOME_PATH = "/welcome";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
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

  if (!user) {
    if (isPublic) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
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
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
