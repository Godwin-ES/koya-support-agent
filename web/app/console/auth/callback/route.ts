import { NextResponse, type NextRequest } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/server";

/**
 * Completes a Supabase invite/magic-link redirect (PKCE flow, Supabase's
 * current default - `exchangeCodeForSession`, verified against its live
 * docs, not assumed). `scripts/create-staff-user.mjs` remains the way to
 * create a staff account with a chosen password directly; this route is
 * the other way in - Supabase's own dashboard "Invite user" sends a real
 * email with a link here, which had nowhere to land before this existed.
 * `proxy.ts` excludes `/console/auth/*` from its sign-in gate, since this
 * request arrives with no session cookie yet - that's exactly what it's
 * here to establish.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const redirectTo = request.nextUrl.clone();
  redirectTo.search = "";

  if (!code) {
    redirectTo.pathname = "/console/sign-in";
    return NextResponse.redirect(redirectTo);
  }

  const supabase = await supabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  redirectTo.pathname = error ? "/console/sign-in" : "/console/auth/set-password";
  return NextResponse.redirect(redirectTo);
}
