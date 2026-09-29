import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * The console's own Supabase Auth session (staff sign-in) - the `anon`
 * key, cookie-bound. This is a separate concern from data access: RLS
 * grants nothing to `anon`/`authenticated` on any application table
 * (migration 007), so this client can prove *who is signed in* but reads
 * no conversation/ticket/escalation data itself - `lib/supabase/admin.ts`
 * does that, only after this confirms a session exists.
 */
export async function supabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component render, where cookies can't be
          // written - middleware.ts is what refreshes the session in that
          // case (the @supabase/ssr docs' own documented split).
        }
      },
    },
  });
}
