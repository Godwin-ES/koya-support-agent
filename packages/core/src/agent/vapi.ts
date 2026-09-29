// Parsing for Vapi's own request/webhook shapes (SYSTEM-DESIGN.md §3, §10).
// Pure functions, no I/O, so they're unit-testable straight from Vapi's
// documented payloads without a running server.

export interface ParsedChatCompletionsRequest {
  conversationId: string;
  token: string;
  model?: string;
  effort?: "low" | "high";
  /** Every user-role message's text, in order - Vapi resends the whole history each turn (SYSTEM-DESIGN.md §3 step 3). */
  userMessages: string[];
}

interface VapiCallMetadata {
  conversation_id?: string;
  token?: string;
  model?: string;
  effort?: "low" | "high";
}

interface VapiChatCompletionsBody {
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  // `metadataSendMode: "variable"` sends the *assistant's* static metadata
  // here (docs.vapi.ai's own field description: "will send `assistant.metadata`
  // as a variable"), never the per-call one - our per-call conversation_id/
  // token live under `call.assistantOverrides.metadata` instead (confirmed
  // against a real live call's own GET /call response, Task 13). Checked
  // first since it's the real, documented location; `metadata` at the top
  // level is kept as a fallback for callers (tests, a future non-Vapi
  // client) that pass it directly there.
  metadata?: VapiCallMetadata;
  call?: { assistantOverrides?: { metadata?: VapiCallMetadata } };
}

export function parseChatCompletionsBody(body: unknown): ParsedChatCompletionsRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as VapiChatCompletionsBody;
  const metadata = b.call?.assistantOverrides?.metadata ?? b.metadata;
  const conversationId = metadata?.conversation_id;
  const token = metadata?.token;
  if (!conversationId || !token) return null;

  const userMessages = (b.messages ?? []).filter((m) => m.role === "user").map((m) => m.content);
  return { conversationId, token, model: metadata?.model ?? b.model, effort: metadata?.effort, userMessages };
}

/** Which user message (if any) is new, given how many turns are already recorded - "stays idempotent for a repeated turn" (Task 7). */
export function newUserMessage(userMessages: string[], recordedTurnCount: number): string | null {
  if (userMessages.length <= recordedTurnCount) return null; // a resend of a state we've already answered
  return userMessages[userMessages.length - 1]!;
}

export function formatChatCompletionChunk(text: string, opts: { id: string; model: string }): string {
  return `data: ${JSON.stringify({
    id: opts.id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: opts.model,
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  })}\n\n`;
}

export const SSE_DONE = "data: [DONE]\n\n";

// -- /vapi/events (server-message webhooks) --------------------------------
// Confirmed against Vapi's docs (docs.vapi.ai/server-url/events), not
// assumed: every server-message is nested under a `message` key, `type`
// discriminates it, and the call is identified by a `call` object (`call.id`)
// - confirmed against the Calls API reference (docs.vapi.ai/api-reference/
// calls/get) for the Call object's own fields (`id`, `endedReason`, `cost`,
// `analysis.summary`).
//
// Our per-call conversation_id lives at `call.assistantOverrides.metadata`,
// not `call.metadata` - verified against a real live call's own GET /call
// response (Task 13): the earlier `call.metadata` assumption was untested
// against a real call and was wrong (it read back empty in production,
// which would have silently orphaned every real voice conversation - never
// marked ended, no cost recorded). `call.metadata` is kept as a fallback.

interface VapiCall {
  id?: string;
  metadata?: { conversation_id?: string };
  assistantOverrides?: { metadata?: { conversation_id?: string } };
  analysis?: { summary?: string };
}

export type ParsedVapiEvent =
  | { type: "end-of-call-report"; callId: string | null; conversationId: string | null; endedReason: string; summary: string | null; transcript: string | null }
  | { type: "status-update"; callId: string | null; conversationId: string | null; status: string }
  | { type: "hang"; callId: string | null; conversationId: string | null }
  | null;

export function parseVapiEventBody(body: unknown): ParsedVapiEvent {
  if (!body || typeof body !== "object" || !("message" in body)) return null;
  const message = (body as { message: unknown }).message;
  if (!message || typeof message !== "object" || !("type" in message)) return null;
  const m = message as { type: string; call?: VapiCall; endedReason?: string; status?: string; artifact?: { transcript?: string } };
  const call = m.call;
  const callId = call?.id ?? null;
  const conversationId = call?.assistantOverrides?.metadata?.conversation_id ?? call?.metadata?.conversation_id ?? null;

  if (m.type === "end-of-call-report") {
    return { type: "end-of-call-report", callId, conversationId, endedReason: m.endedReason ?? "unknown", summary: call?.analysis?.summary ?? null, transcript: m.artifact?.transcript ?? null };
  }
  if (m.type === "status-update") {
    return { type: "status-update", callId, conversationId, status: m.status ?? "unknown" };
  }
  if (m.type === "hang") {
    return { type: "hang", callId, conversationId };
  }
  return null;
}
