import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";
import { VoicePageClient } from "@/components/voice/voice-page-client";
import { hasAppAccess } from "@/lib/auth";
import { signOut } from "./actions";

/**
 * The voice page's own session check (SYSTEM-DESIGN.md §11.1) - "defence
 * in depth alongside proxy.ts", the same double-check pattern the
 * console's `(authenticated)/layout.tsx` already uses. Hands the access
 * token down to the client component: agent-server now verifies it
 * server-side (`supabase.auth.getUser(token)`) instead of hashing an IP,
 * since every caller now has a real account.
 */
export default async function VoicePage() {
  const supabase = await supabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/sign-in");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!hasAppAccess(user)) redirect("/sign-in");

  const name = session.user.user_metadata?.name;
  return <VoicePageClient accessToken={session.access_token} onSignOut={signOut} userName={typeof name === "string" && name.trim() ? name : null} userEmail={session.user.email ?? null} />;
}
