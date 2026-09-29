// Discord alerts - one channel, `#alerts` (SYSTEM-DESIGN.md §10): new
// escalations, failures and outages. Never a transcript, name or email -
// only a link to the console. Sending never throws (a failed notification
// must never break a call) and is a no-op when the webhook isn't set
// (tests, local dev without one).
const COLOR = { info: 0x1565c0, warning: 0xf9a825, danger: 0xc62828 } as const;

export interface DiscordMessage {
  title: string;
  description?: string;
  /** Where the title links to, relative to APP_URL ("/console/conversations/<id>"). */
  path?: string;
  color: number;
}

export function appLink(path: string): string | undefined {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  return base ? `${base}${path}` : undefined;
}

/** The embed Discord receives - exported so tests can check exactly what would be sent. */
export function toDiscordPayload(message: DiscordMessage): Record<string, unknown> {
  const url = message.path ? appLink(message.path) : undefined;
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: message.title.slice(0, 256),
        ...(message.description ? { description: message.description.slice(0, 2000) } : {}),
        ...(url ? { url } : {}),
        color: message.color,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export async function sendDiscordAlert(message: DiscordMessage): Promise<boolean> {
  const webhook = process.env.DISCORD_ALERTS_WEBHOOK_URL;
  if (!webhook) return false;
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toDiscordPayload(message)),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`discord alert failed: HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("discord alert failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ---------------------------------------------------------------------
// Messages. Pure, so tests can check wording and what's deliberately left out.
// ---------------------------------------------------------------------

export function newEscalationMessage(args: { conversationId: string; category: string }): DiscordMessage {
  return {
    title: `New escalation: ${args.category}`,
    description: "A caller needs human follow-up.",
    path: `/console/conversations/${args.conversationId}`,
    color: COLOR.warning,
  };
}

// -- Failures and outages (Task 8, SYSTEM-DESIGN.md §10) -------------------
// Never a transcript, name or email in any of these - just what failed,
// for which provider, and (where relevant) a link to the conversation so
// someone can look at the technical record, not the caller's words.

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
