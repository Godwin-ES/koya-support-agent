import { VoicePageClient } from "@/components/voice/voice-page-client";
import { requireAccount } from "@/lib/server/current-account";
import { signOut } from "./actions";

/** The voice page (SYSTEM-DESIGN.md §11.1) - signed-in, invited accounts only; hands the access token down for agent-server to verify. */
export default async function VoicePage() {
  const account = await requireAccount();
  return (
    <VoicePageClient
      accessToken={account.accessToken}
      onSignOut={signOut}
      userName={account.displayName}
      userEmail={account.user.email ?? null}
      greetingName={account.greetingName}
      companyName={account.companyName}
    />
  );
}
