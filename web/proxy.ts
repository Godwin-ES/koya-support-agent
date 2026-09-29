import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isStaff } from "@/lib/auth";

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

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
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

  const { pathname } = request.nextUrl;

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

  const isPublicAuthRoute = pathname === "/sign-in" || pathname === "/sign-up";
  if (pathname === "/" && !user) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/sign-in";
    return NextResponse.redirect(signInUrl);
  }
  if (isPublicAuthRoute && user) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: ["/console/:path*", "/", "/sign-in", "/sign-up"],
};
