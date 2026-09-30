import { VoicePageClient } from "@/components/voice/voice-page-client";
import { requireAccount } from "@/lib/server/current-account";
import { getOpenChat } from "@/lib/server/history";
import { signOut } from "./actions";

/** The voice page (SYSTEM-DESIGN.md §11.1) - signed-in, invited accounts only; hands the access token down for agent-server to verify. */
export default async function VoicePage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const account = await requireAccount();
  // A chat left open (a refresh, a closed tab, History's "Continue") opens straight back up.
  const openChat = await getOpenChat(account.user.id, (await searchParams).chat);
  return (
    <VoicePageClient
      accessToken={account.accessToken}
      onSignOut={signOut}
      userName={account.displayName}
      userEmail={account.user.email ?? null}
      greetingName={account.greetingName}
      openChat={openChat}
    />
  );
}
