import { VoicePageClient } from "@/components/voice/voice-page-client";
import { getCurrentAccount } from "@/lib/server/current-account";
import { getOpenChat } from "@/lib/server/history";
import { signOut } from "./actions";

/** Public general support; a signed-in account additionally gets its own private context and history. */
export default async function VoicePage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const account = await getCurrentAccount();
  // A chat left open (a refresh, a closed tab, History's "Continue") opens straight back up.
  const openChat = account ? await getOpenChat(account.user.id, (await searchParams).chat) : null;
  return (
    <VoicePageClient
      accessToken={account?.accessToken ?? null}
      onSignOut={signOut}
      userName={account?.displayName ?? null}
      userEmail={account?.user.email ?? null}
      greetingName={account?.greetingName ?? null}
      openChat={openChat}
    />
  );
}
