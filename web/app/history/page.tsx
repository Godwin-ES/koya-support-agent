import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { requireAccount } from "@/lib/server/current-account";
import { listHistory } from "@/lib/server/history";
import { AppHeader } from "@/components/voice/app-header";
import { PrivacyNote } from "@/components/voice/privacy-note";
import { initialsFrom } from "@/components/conversation/avatars";
import { ChannelIcon, OutcomeBadge, channelLabel, durationLabel, formatWhen, partitionHistoryItems } from "@/components/history/history-parts";
import type { HistoryItem } from "@/lib/server/history";
import { signOut } from "../actions";

export const metadata = { title: "History · RelayPay Support" };

function HistorySection({ title, items }: { title: "Calls" | "Chats"; items: HistoryItem[] }) {
  return (
    <section aria-labelledby={`${title.toLowerCase()}-heading`}>
      <div className="mb-3 flex items-center gap-2">
        <h2 id={`${title.toLowerCase()}-heading`} className="text-base font-semibold text-[var(--color-primary)]">{title}</h2>
        <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">No {title.toLowerCase()} yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/history/${item.id}`}
                className="group flex items-center gap-4 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)] [transition-property:border-color,box-shadow,transform] [transition-duration:var(--transition-fast)] hover:-translate-y-0.5 hover:border-[var(--color-accent)]/40 hover:shadow-[var(--shadow-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              >
                <ChannelIcon channel={item.channel} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--color-text)]">{item.opener ?? "No messages"}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-text-muted)]">
                    <span>{channelLabel(item.channel)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatWhen(item.startedAt)}</span>
                    {durationLabel(item.durationSeconds) && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{durationLabel(item.durationSeconds)}</span>
                      </>
                    )}
                    <OutcomeBadge outcome={item.outcome} inProgress={item.inProgress} />
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-[var(--color-text-muted)] [transition:transform_var(--transition-fast)] group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Read-only history of this account's own calls and chats. */
export default async function HistoryPage() {
  const account = await requireAccount();
  const items = await listHistory(account.user.id);
  const history = partitionHistoryItems(items);

  return (
    <div className="bg-dot-grid flex min-h-dvh flex-col">
      <AppHeader displayName={account.displayName} email={account.user.email ?? null} initials={initialsFrom(account.displayName, account.user.email ?? null)} onSignOut={signOut} showSignOut current="history" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-primary)]">Your conversations</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Past calls and chats with RelayPay support. Open one to read it again.</p>

        {items.length === 0 ? (
          <div className="mt-8 flex flex-col items-center rounded-[var(--radius-2xl)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <History className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-4 text-sm font-semibold text-[var(--color-text)]">No conversations yet</p>
            <p className="mt-1 max-w-xs text-sm text-[var(--color-text-muted)]">Your calls and chats will appear here once you&apos;ve had one.</p>
            <Link href="/" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-sm)] hover:bg-[var(--color-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">
              Talk to support
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-8">
            <HistorySection title="Calls" items={history.calls} />
            <HistorySection title="Chats" items={history.chats} />
          </div>
        )}
      </main>
      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]/70">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <PrivacyNote />
        </div>
      </footer>
    </div>
  );
}
