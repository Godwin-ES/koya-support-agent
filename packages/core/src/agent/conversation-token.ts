// The short-lived signed token agent-server puts in Vapi's call metadata
// (SYSTEM-DESIGN.md §3 step 1: "returns conversation_id plus a short-lived
// signed token") and checks on every /vapi/chat/completions and /api/text
// request, so a request can't drive a conversation it was never issued a
// token for. Not specified anywhere what "short-lived" or the signing
// scheme should be - HMAC-SHA256 over `${conversationId}.${expiresAt}`,
// base64url-encoded, expiring in 20 minutes: longer than the 5-minute call
// cap (SYSTEM-DESIGN.md §9's own `maxDurationSeconds: 300`) with headroom
// for the time between issuing it and Vapi's first real turn.
import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 20 * 60_000;

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueConversationToken(secret: string, conversationId: string, now: number = Date.now()): string {
  const expiresAt = now + TOKEN_TTL_MS;
  const payload = `${conversationId}.${expiresAt}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyConversationToken(secret: string, token: string, conversationId: string, now: number = Date.now()): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [tokenConversationId, expiresAtStr, signature] = parts;
  if (tokenConversationId !== conversationId) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || now > expiresAt) return false;

  const expected = sign(secret, `${tokenConversationId}.${expiresAtStr}`);
  const a = Buffer.from(signature!);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
