import type { ReactNode } from "react";
import { Clock, Headset, ShieldCheck, UserRoundCheck, type LucideIcon } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";

type Audience = "customer" | "staff";

const PANEL: Record<Audience, { heading: string; body: string; points: Array<{ icon: LucideIcon; title: string; text: string }> }> = {
  customer: {
    heading: "Support that picks up.",
    body: "Talk or type to RelayPay about payments, payouts, invoices or your account.",
    points: [
      { icon: Clock, title: "Answers in seconds", text: "No hold music, no queue to wait in." },
      { icon: UserRoundCheck, title: "A person when you need one", text: "Anything we can't resolve goes to our team." },
      { icon: ShieldCheck, title: "Private by design", text: "We never ask for card numbers or passwords." },
    ],
  },
  staff: {
    heading: "The support console.",
    body: "Review conversations, work the queue and track evaluation runs.",
    points: [
      { icon: Headset, title: "Every conversation", text: "Turn by turn, with sources and tool calls." },
      { icon: UserRoundCheck, title: "Tickets and escalations", text: "One queue, with safe concurrent edits." },
      { icon: ShieldCheck, title: "Invite only", text: "Staff access is granted by an administrator." },
    ],
  },
};

/** The shared frame for every auth flow: a brand panel beside the form on wide screens, the form alone on phones. */
export function AuthShell({ title, subtitle, audience = "customer", children }: { title: string; subtitle?: string; audience?: Audience; children: ReactNode }) {
  const panel = PANEL[audience];
  return (
    <div className="flex min-h-dvh bg-[var(--color-bg)]">
      <aside className="relative hidden w-[44%] max-w-[560px] flex-col justify-between overflow-hidden bg-[var(--color-primary)] p-12 text-white lg:flex">
        <DotPattern />
        <div className="relative">
          <span className="select-none text-xl font-semibold tracking-tight">
            Relay<span className="text-[#7cc4ca]">Pay</span>
          </span>
        </div>
        <div className="relative">
          <h2 className="text-balance text-4xl font-semibold leading-tight tracking-tight">{panel.heading}</h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-white/75">{panel.body}</p>
          <ul className="mt-10 flex flex-col gap-6">
            {panel.points.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-lg)] bg-white/10 ring-1 ring-inset ring-white/15">
                  <Icon className="size-5 text-[#7cc4ca]" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="mt-0.5 block text-sm text-white/70">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/70">© RelayPay</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[400px] animate-fade-in">
          <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
            <Wordmark className="text-2xl lg:hidden" />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-[var(--color-text)] lg:mt-0">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">{subtitle}</p>}
          </div>
          <div className="rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-lg)] sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

function DotPattern() {
  return (
    <svg aria-hidden="true" className="absolute inset-0 h-full w-full text-white/[0.07]">
      <defs>
        <pattern id="auth-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#auth-dots)" />
      <circle cx="100%" cy="0" r="220" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="100%" cy="0" r="340" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
