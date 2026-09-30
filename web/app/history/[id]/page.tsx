import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAccount } from "@/lib/server/current-account";
import { getHistoryDetail } from "@/lib/server/history";
import { AppHeader } from "@/components/voice/app-header";
import { PrivacyNote } from "@/components/voice/privacy-note";
import { initialsFrom } from "@/components/conversation/avatars";
import { MessageThread } from "@/components/conversation/message-thread";
import { ChannelIcon, OutcomeBadge, channelLabel, durationLabel, formatWhen } from "@/components/history/history-parts";
import { signOut } from "../../actions";

export const metadata = { title: "Conversation · RelayPay Support" };

/** One past conversation, read-only - only ever the signed-in account's own. */
export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await requireAccount();
  const detail = await getHistoryDetail(account.user.id, id);
  if (!detail) notFound();
  const initials = initialsFrom(account.displayName, account.user.email ?? null);

  return (
    <div className="bg-dot-grid flex min-h-dvh flex-col">
      <AppHeader displayName={account.displayName} email={account.user.email ?? null} initials={initials} onSignOut={signOut} showSignOut current="history" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/history" className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] text-sm font-medium text-[var(--color-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All conversations
        </Link>

        <section aria-label="Conversation" className="mt-4 flex flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
          <div className="flex items-center gap-4 border-b border-[var(--color-border)] px-5 py-4">
            <ChannelIcon channel={detail.channel} />
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold text-[var(--color-text)]">{channelLabel(detail.channel)}</h1>
              <p className="text-xs text-[var(--color-text-muted)]">
                {formatWhen(detail.startedAt)}
                {durationLabel(detail.durationSeconds) ? ` · ${durationLabel(detail.durationSeconds)}` : ""}
              </p>
            </div>
            <OutcomeBadge outcome={detail.outcome} inProgress={detail.inProgress} />
          </div>
          {detail.inProgress && detail.channel === "web_text" && (
            <div className="flex flex-col gap-3 border-b border-[var(--color-border)] bg-[var(--color-accent-softer)] px-5 py-3.5 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-[var(--color-text)]">This chat is still open. Pick up where you left off.</p>
              <Link href={`/?chat=${detail.id}`} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-sm)] hover:bg-[var(--color-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">
                Continue this chat
              </Link>
            </div>
          )}
          <MessageThread
            messages={detail.messages}
            userInitials={initials}
            label="Transcript"
            className="max-h-[70dvh] bg-[var(--color-bg)]"
            emptyState={<p className="py-10 text-center text-sm text-[var(--color-text-muted)]">Nothing was said in this conversation.</p>}
          />
        </section>
      </main>
      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]/70">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <PrivacyNote />
        </div>
      </footer>
    </div>
  );
}
