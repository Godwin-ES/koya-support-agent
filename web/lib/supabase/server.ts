import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { CONSOLE_AUTH_COOKIE } from "./cookie-names";

/**
 * The console keeps its own sign-in, in its own cookie, separate from the
 * customer app's. They used to share one cookie, so signing in to the
 * console replaced the customer app's session under a tab that was still
 * open - its next navigation ran as a different user than the page was
 * rendered for and failed ("This page couldn't load") until a refresh. Now
 * each app has its own session: signing in or out of one never touches the
 * other, and both can be signed in at once, as different people.
 */
/**
 * A cookie-bound Supabase Auth client with the `anon` key - it proves who is
 * signed in, but reads no application data itself (RLS grants `anon` and
 * `authenticated` nothing, migration 007); `lib/supabase/admin.ts` does that,
 * after this confirms a session.
 */
async function cookieBoundClient(cookieName?: string) {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component render, where cookies can't be
          // written - proxy.ts refreshes the session in that case (the
          // @supabase/ssr docs' own documented split).
        }
      },
    },
  });
}

/** The customer app's session. */
export function supabaseServerClient() {
  return cookieBoundClient();
}

/** The staff console's session - its own cookie, independent of the customer app's. */
export function supabaseConsoleClient() {
  return cookieBoundClient(CONSOLE_AUTH_COOKIE);
}
