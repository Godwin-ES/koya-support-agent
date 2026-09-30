// Discord notifications (SYSTEM-DESIGN.md §10), in two channels:
//   alerts   - needs a person: new escalations, urgent tickets, failures,
//              outages, callers turned away, the daily spend threshold
//   activity - a feed: each finished conversation, limits reached, the
//              daily digest, evaluation runs
// Never a transcript, name or email in either - categories, counts, IDs and
// a link to the console, where staff read the rest. Sending never throws (a
// failed notification must never break a call) and is a no-op when that
// channel's webhook isn't set (tests, local dev without one).
import { formatDateTime } from "../domain/format-time";

const COLOR = { info: 0x1565c0, success: 0x1f7a4d, warning: 0xf9a825, danger: 0xc62828, neutral: 0x5b6472 } as const;

export type DiscordChannel = "alerts" | "activity";

export interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordMessage {
  title: string;
  description?: string;
  /** Where the title links to, relative to APP_URL ("/console/conversations/<id>"). */
  path?: string;
  color: number;
  fields?: DiscordField[];
}

const WEBHOOK_ENV: Record<DiscordChannel, string> = {
  alerts: "DISCORD_ALERTS_WEBHOOK_URL",
  activity: "DISCORD_ACTIVITY_WEBHOOK_URL",
};

export function appLink(path: string): string | undefined {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  return base ? `${base}${path}` : undefined;
}

/** The embed Discord receives - exported so tests can check exactly what would be sent. */
export function toDiscordPayload(message: DiscordMessage): Record<string, unknown> {
  const url = message.path ? appLink(message.path) : undefined;
  const fields = message.fields?.slice(0, 25).map((f) => ({ name: f.name.slice(0, 256), value: f.value.slice(0, 1024) || "-", inline: f.inline ?? true }));
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: message.title.slice(0, 256),
        ...(message.description ? { description: message.description.slice(0, 2000) } : {}),
        ...(url ? { url } : {}),
        ...(fields && fields.length > 0 ? { fields } : {}),
        color: message.color,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/** Whether this process can post to `channel` at all. Tests and local servers with Discord switched off can't. */
export function discordChannelEnabled(channel: DiscordChannel): boolean {
  return Boolean(process.env[WEBHOOK_ENV[channel]]);
}

export async function sendDiscord(channel: DiscordChannel, message: DiscordMessage): Promise<boolean> {
  const webhook = process.env[WEBHOOK_ENV[channel]];
  if (!webhook) return false;
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toDiscordPayload(message)),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`discord ${channel} message failed: HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error(`discord ${channel} message failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export function sendDiscordAlert(message: DiscordMessage): Promise<boolean> {
  return sendDiscord("alerts", message);
}

export function sendDiscordActivity(message: DiscordMessage): Promise<boolean> {
  return sendDiscord("activity", message);
}

// ---------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export function formatUsd(amount: number): string {
  return amount < 0.01 && amount > 0 ? "<$0.01" : `$${amount.toFixed(2)}`;
}

function formatWhen(iso: string): string {
  return Number.isNaN(new Date(iso).getTime()) ? iso : formatDateTime(iso);
}

// ---------------------------------------------------------------------
// #alerts
// ---------------------------------------------------------------------

export function newEscalationMessage(args: { conversationId: string; category: string; callbackTime?: string | null; customerId?: string | null }): DiscordMessage {
  const fields: DiscordField[] = [
    { name: "Category", value: args.category },
    { name: "Callback", value: args.callbackTime ? formatWhen(args.callbackTime) : "Not requested - follow up by email" },
  ];
  if (args.customerId) fields.push({ name: "Verified customer", value: args.customerId });
  return {
    title: `New escalation: ${args.category}`,
    description: "A customer needs human follow-up.",
    path: `/console/conversations/${args.conversationId}`,
    color: COLOR.warning,
    fields,
  };
}

/** Only high and urgent tickets alert - normal and low ones show up in the conversation's own activity message. */
export function newTicketMessage(args: { conversationId: string; category: string; priority: string; customerId?: string | null }): DiscordMessage {
  const fields: DiscordField[] = [
    { name: "Category", value: args.category },
    { name: "Priority", value: args.priority },
  ];
  if (args.customerId) fields.push({ name: "Verified customer", value: args.customerId });
  return {
    title: `New ${args.priority} ticket: ${args.category}`,
    description: "A support issue was logged for follow-up.",
    path: `/console/queue`,
    color: args.priority === "urgent" ? COLOR.danger : COLOR.warning,
    fields,
  };
}

export function claudeFailedMessage(args: { conversationId: string; kind: "temporary" | "account" | "bug"; detail: string }): DiscordMessage {
  const headline = args.kind === "account" ? "Claude account problem" : args.kind === "temporary" ? "Claude is having trouble" : "Claude call failed";
  return {
    title: headline,
    description: `A live call had to fall back and end early. ${args.detail}`.trim(),
    path: `/console/conversations/${args.conversationId}`,
    color: COLOR.danger,
  };
}

export function mcpDownMessage(args: { conversationId: string; detail: string }): DiscordMessage {
  return {
    title: "MCP server unreachable",
    description: `A caller couldn't be helped at all this turn - no lookups, no knowledge search. ${args.detail}`.trim(),
    path: `/console/conversations/${args.conversationId}`,
    color: COLOR.danger,
  };
}

export function supabaseDegradedMessage(args: { detail: string }): DiscordMessage {
  return {
    title: "Supabase writes are failing",
    description: `Logging is buffering in memory instead of writing through. ${args.detail}`.trim(),
    color: COLOR.warning,
  };
}

export function agentServerDownMessage(): DiscordMessage {
  return {
    title: "agent-server is not responding",
    description: "The worker-down watchdog found one or more calls stuck open with no recent activity - the agent-server is probably down.",
    path: "/console",
    color: COLOR.danger,
  };
}

export function capacityMessage(args: { pool: "voice" | "text"; limit: number }): DiscordMessage {
  const what = args.pool === "voice" ? "caller" : "chat";
  return {
    title: `A ${what} was turned away: all ${args.pool === "voice" ? "voice lines" : "chat slots"} busy`,
    description: `All ${args.limit} ${args.pool} sessions were in use. Repeats within 10 minutes are counted in the daily digest instead of posted.`,
    color: COLOR.warning,
  };
}

export function spendThresholdMessage(args: { spentUsd: number; thresholdUsd: number }): DiscordMessage {
  return {
    title: `Claude spend passed ${formatUsd(args.thresholdUsd)} today`,
    description: `Spend so far today is ${formatUsd(args.spentUsd)} (UTC day). Vapi call minutes are billed separately and aren't included.`,
    path: "/console",
    color: COLOR.warning,
  };
}

// ---------------------------------------------------------------------
// #activity
// ---------------------------------------------------------------------

export interface ConversationFinishedArgs {
  conversationId: string;
  channel: "web_voice" | "web_text" | "phone";
  durationSeconds: number | null;
  turns: number;
  answerCounts: Partial<Record<"answer" | "clarify" | "escalate" | "decline", number>>;
  endedLabel: string;
  failed: boolean;
  ticket: { category: string; priority: string } | null;
  escalation: { category: string; callbackBooked: boolean } | null;
  customerId: string | null;
  costUsd: number;
}

const ANSWER_LABELS: Record<"answer" | "clarify" | "escalate" | "decline", string> = { answer: "answered", clarify: "clarified", escalate: "escalated", decline: "declined" };

export function conversationFinishedMessage(args: ConversationFinishedArgs): DiscordMessage {
  const kind = args.channel === "web_text" ? "Chat" : args.channel === "phone" ? "Phone call" : "Voice call";
  const handled = (Object.keys(ANSWER_LABELS) as Array<keyof typeof ANSWER_LABELS>)
    .filter((k) => (args.answerCounts[k] ?? 0) > 0)
    .map((k) => `${args.answerCounts[k]} ${ANSWER_LABELS[k]}`)
    .join(" · ");

  const outcome: string[] = [];
  if (args.escalation) outcome.push(`Escalation (${args.escalation.category})${args.escalation.callbackBooked ? ", callback booked" : ""}`);
  if (args.ticket) outcome.push(`Ticket (${args.ticket.category}, ${args.ticket.priority})`);

  const fields: DiscordField[] = [
    { name: "Duration", value: args.durationSeconds !== null ? formatDuration(args.durationSeconds) : "-" },
    { name: "Turns", value: String(args.turns) },
    { name: "Claude cost", value: formatUsd(args.costUsd) },
    { name: "Handled", value: handled || "Nothing said", inline: false },
    { name: "Outcome", value: outcome.length > 0 ? outcome.join("\n") : "Resolved in conversation - no follow-up", inline: false },
    { name: "Ended", value: args.endedLabel, inline: false },
  ];
  if (args.customerId) fields.splice(3, 0, { name: "Verified customer", value: args.customerId });

  const color = args.failed ? COLOR.danger : args.escalation ? COLOR.warning : args.ticket ? COLOR.info : COLOR.success;
  return {
    title: `${kind} finished${args.escalation ? " · escalated" : args.ticket ? " · ticket opened" : ""}`,
    path: `/console/conversations/${args.conversationId}`,
    color,
    fields,
  };
}

export function limitReachedMessage(args: { kind: "calls" | "chat"; limit: number }): DiscordMessage {
  return {
    title: args.kind === "calls" ? "An account used all its calls for today" : "An account used all its chat messages for today",
    description: args.kind === "calls" ? `That account has made ${args.limit} calls today and can't start another until midnight UTC.` : `That account has sent ${args.limit} chat messages today and can't send more until midnight UTC.`,
    color: COLOR.neutral,
  };
}

export interface DailyDigestArgs {
  day: string;
  voiceCalls: number;
  chats: number;
  turns: number;
  escalations: number;
  tickets: number;
  turnedAway: number;
  failedTurns: number;
  claudeSpendUsd: number;
  latestEvaluation: { passed: number; total: number; runId: string } | null;
}

export function dailyDigestMessage(args: DailyDigestArgs): DiscordMessage {
  return {
    title: `Daily summary for ${args.day}`,
    path: "/console",
    color: COLOR.info,
    fields: [
      { name: "Voice calls", value: String(args.voiceCalls) },
      { name: "Chats", value: String(args.chats) },
      { name: "Turns", value: String(args.turns) },
      { name: "Escalations", value: String(args.escalations) },
      { name: "Tickets", value: String(args.tickets) },
      { name: "Turned away (busy)", value: String(args.turnedAway) },
      { name: "Failed turns", value: String(args.failedTurns) },
      { name: "Claude spend", value: formatUsd(args.claudeSpendUsd) },
      { name: "Latest evaluation", value: args.latestEvaluation ? `${args.latestEvaluation.passed}/${args.latestEvaluation.total} passed (${args.latestEvaluation.runId})` : "None yet" },
    ],
  };
}

export function evaluationRunMessage(args: { runId: string; model: string; passed: number; total: number; costUsd: number }): DiscordMessage {
  const allPassed = args.passed === args.total;
  return {
    title: `Evaluation run finished: ${args.passed}/${args.total} passed`,
    path: `/console/evaluations/${encodeURIComponent(args.runId)}`,
    color: allPassed ? COLOR.success : args.passed / Math.max(1, args.total) >= 0.8 ? COLOR.warning : COLOR.danger,
    fields: [
      { name: "Run", value: args.runId },
      { name: "Model", value: args.model },
      { name: "Claude cost", value: formatUsd(args.costUsd) },
    ],
  };
}
