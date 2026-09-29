import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * "`/console` behind Supabase Auth, staff only" (SYSTEM-DESIGN.md §11.1) -
 * also refreshes the session cookie on every request (@supabase/ssr's own
 * documented split with the Server Component client, which can't write
 * cookies during a render). Named `proxy`, not `middleware` - Next.js 16
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
  const isConsoleRoute = pathname.startsWith("/console") && pathname !== "/console/sign-in";

  if (isConsoleRoute && !user) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/console/sign-in";
    return NextResponse.redirect(signInUrl);
  }
  if (pathname === "/console/sign-in" && user) {
    const consoleUrl = request.nextUrl.clone();
    consoleUrl.pathname = "/console";
    return NextResponse.redirect(consoleUrl);
  }

  return response;
}

export const config = {
  matcher: ["/console/:path*"],
};
