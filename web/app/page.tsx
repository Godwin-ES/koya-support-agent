import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";
import { VoicePageClient } from "@/components/voice/voice-page-client";
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

  return <VoicePageClient accessToken={session.access_token} onSignOut={signOut} />;
}
