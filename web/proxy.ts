import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasAppAccess, isStaff } from "@/lib/auth";
import { CONSOLE_AUTH_COOKIE } from "@/lib/supabase/cookie-names";

/**
 * Two gates behind the same Supabase Auth session check: `/console`
 * (staff *specifically* - `isStaff()`, not just "signed in", since every
 * customer account satisfies "signed in" too now - a real gap found and
 * fixed in Task 13/14: any public sign-up could reach the console before
 * this) and the public voice page itself (`/`, any signed-in account -
 * "no account, no call" was a deliberate move off the original fully-
 * anonymous design). Also refreshes
 * the session cookie on every request (@supabase/ssr's own documented
 * split with the Server Component client, which can't write cookies
 * during a render). Named `proxy`, not `middleware` - Next.js 16
 * deprecated and renamed the file convention (confirmed against this
 * project's own installed docs, `node_modules/next/dist/docs/.../proxy.md`
 * - a real build warning caught this, not something assumed from memory).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  // Console pages use the console's own session cookie; everything else the
  // customer app's (lib/supabase/server.ts - they're kept apart on purpose).
  const isConsolePath = pathname.startsWith("/console");
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    ...(isConsolePath ? { cookieOptions: { name: CONSOLE_AUTH_COOKIE } } : {}),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The invite-completion flow arrives with no session cookie yet - that's
  // exactly what it establishes, so it can't be behind this same gate.
  if (pathname.startsWith("/console/auth/")) return response;

  const isConsoleRoute = pathname.startsWith("/console") && pathname !== "/console/sign-in";
  if (isConsoleRoute && !isStaff(user)) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/console/sign-in";
    return NextResponse.redirect(signInUrl);
  }
  if (pathname === "/console/sign-in" && isStaff(user)) {
    const consoleUrl = request.nextUrl.clone();
    consoleUrl.pathname = "/console";
    return NextResponse.redirect(consoleUrl);
  }

  // Invite-only: a signed-in account without access (made through
  // Supabase's public sign-up endpoint, not an invite) is treated as
  // signed out here, and refused at sign-in itself.
  if ((pathname === "/" || pathname.startsWith("/history")) && !hasAppAccess(user)) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/sign-in";
    return NextResponse.redirect(signInUrl);
  }
  if (pathname === "/sign-in" && hasAppAccess(user)) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: ["/console/:path*", "/", "/history/:path*", "/sign-in"],
};
