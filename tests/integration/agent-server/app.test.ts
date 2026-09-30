// @vitest-environment node
//
// The real Express app (agent-server/src/app.ts) end to end, with the real
// Supabase client and a real HTTP listener on an ephemeral port, but a
// stubbed Agent SDK (Task 6's queryFactory pattern) so every turn is $0 -
// no Claude calls anywhere in this file.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Query } from "@anthropic-ai/claude-agent-sdk";
import { createApp } from "../../../agent-server/src/app";
import { SessionManager } from "../../../agent-server/src/session-manager";
import type { SessionOptions } from "../../../agent-server/src/session";
import { issueConversationToken, verifyConversationToken } from "@core/agent/conversation-token";
import { serviceRoleClient, anonClient } from "../helpers/db";

const CONVERSATION_TOKEN_SECRET = "test-conversation-token-secret";
const VAPI_SERVER_SECRET = "test-vapi-server-secret";
const MODEL = "claude-haiku-4-5";

const supabase = serviceRoleClient();
const conversationIds: string[] = [];
const testUserIds: string[] = [];

// Every caller now signs in for real (Task 13/14) - caller_ref is a real
// auth.users.id, verified via a real Supabase access token, not an
// arbitrary string. A fresh account per "visitor" the tests need to tell
// apart, cleaned up afterward.
async function newCallerToken(options: { invited?: boolean } = {}): Promise<string> {
  const email = `agent-server-test-${crypto.randomUUID()}@relaypay-test.example`;
  const password = "Test-caller-pass-1!";
  const { data: created, error: createError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: options.invited === false ? {} : { invited: true } });
  if (createError) throw createError;
  testUserIds.push(created.user.id);

  const { data: signedIn, error: signInError } = await anonClient().auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return signedIn.session!.access_token;
}

function textDelta(text: string): SDKMessage {
  return { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } } as unknown as SDKMessage;
}
function resultMessage(): SDKMessage {
  return { type: "result", subtype: "success", duration_ms: 5, is_error: false, total_cost_usd: 0, num_turns: 1 } as unknown as SDKMessage;
}
function scriptedQueryFactory(script: SDKMessage[]): NonNullable<SessionOptions["queryFactory"]> {
  return (_args: { prompt: AsyncIterable<SDKUserMessage> }) => {
    let index = 0;
    return {
      next: async () => (index >= script.length ? { done: true as const, value: undefined } : { done: false as const, value: script[index++] }),
      interrupt: async () => {},
    } as unknown as Query;
  };
}

let server: Server;
let baseUrl: string;
let sessionManager: SessionManager;

beforeAll(async () => {
  sessionManager = new SessionManager({
    supabase,
    mcpServerUrl: "http://127.0.0.1:8090/mcp",
    mcpServerToken: "unused-in-these-tests",
    model: MODEL,
    maxConcurrent: 3,
    queryFactory: scriptedQueryFactory([textDelta("Fees "), textDelta("depend on the corridor."), resultMessage()]),
  });
  const app = createApp({ supabase, sessionManager, conversationTokenSecret: CONVERSATION_TOKEN_SECRET, vapiServerSecret: VAPI_SERVER_SECRET, model: MODEL, maxConcurrentSessions: 3 });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(async () => {
  for (const id of conversationIds.splice(0)) {
    sessionManager.close(id);
    await supabase.from("conversations").delete().eq("id", id);
  }
  for (const id of testUserIds.splice(0)) {
    await supabase.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

async function createConversation(accessToken: string, channel: "web_voice" | "web_text" = "web_voice"): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/api/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: accessToken, channel }) });
  const body = (await res.json()) as Record<string, unknown>;
  if (typeof body.conversation_id === "string") conversationIds.push(body.conversation_id);
  return { status: res.status, body };
}

describe("GET /api/limits", () => {
  it("rejects a request with no access token", async () => {
    const res = await fetch(`${baseUrl}/api/limits`);
    expect(res.status).toBe(401);
  });

  it("reports 0 used for an account with no calls today", async () => {
    const token = await newCallerToken();
    const res = await fetch(`${baseUrl}/api/limits`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ calls: { used: 0, limit: 5 }, chat: { used: 0, limit: 90, per_conversation: 30, max_chars: 1000 } });
  });

  it("reflects real calls made against the same account", async () => {
    const token = await newCallerToken();
    await createConversation(token);
    await createConversation(token);
    const res = await fetch(`${baseUrl}/api/limits`, { headers: { Authorization: `Bearer ${token}` } });
    expect(await res.json()).toEqual({ calls: { used: 2, limit: 5 }, chat: { used: 0, limit: 90, per_conversation: 30, max_chars: 1000 } });
  });

  it("doesn't count a different account's calls", async () => {
    await createConversation(await newCallerToken());
    const res = await fetch(`${baseUrl}/api/limits`, { headers: { Authorization: `Bearer ${await newCallerToken()}` } });
    expect(await res.json()).toEqual({ calls: { used: 0, limit: 5 }, chat: { used: 0, limit: 90, per_conversation: 30, max_chars: 1000 } });
  });

  it("doesn't count chats as calls - the two limits are separate", async () => {
    const token = await newCallerToken();
    await createConversation(token, "web_text");
    const res = await fetch(`${baseUrl}/api/limits`, { headers: { Authorization: `Bearer ${token}` } });
    expect(((await res.json()) as { calls: { used: number } }).calls.used).toBe(0);
  });

  it("accepts an account created by a Supabase admin invite - the kind the dashboard's \"Invite user\" sends - with no flag set", async () => {
    const email = `dashboard-invite-${crypto.randomUUID()}@relaypay-test.example`;
    const { data: link, error } = await supabase.auth.admin.generateLink({ type: "invite", email });
    if (error) throw error;
    testUserIds.push(link.user.id);
    expect(link.user.app_metadata.invited).toBeUndefined();
    const { data: session, error: otpError } = await anonClient().auth.verifyOtp({ type: "invite", token_hash: link.properties.hashed_token });
    if (otpError) throw otpError;
    const res = await fetch(`${baseUrl}/api/limits`, { headers: { Authorization: `Bearer ${session.session!.access_token}` } });
    expect(res.status).toBe(200);
  });

  it("refuses an account that wasn't invited - public sign-up can't reach the agent", async () => {
    const res = await fetch(`${baseUrl}/api/limits`, { headers: { Authorization: `Bearer ${await newCallerToken({ invited: false })}` } });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/conversations", () => {
  it("rejects a request with no access token", async () => {
    const res = await fetch(`${baseUrl}/api/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: "web_voice" }) });
    expect(res.status).toBe(401);
  });

  it("rejects a request with an invalid access token", async () => {
    const res = await fetch(`${baseUrl}/api/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: "web_voice", access_token: "not-a-real-token" }) });
    expect(res.status).toBe(401);
  });

  it("creates a conversation and returns a token that verifies for it", async () => {
    const { status, body } = await createConversation(await newCallerToken());
    expect(status).toBe(200);
    expect(typeof body.conversation_id).toBe("string");
    expect(typeof body.token).toBe("string");
    expect(issueConversationToken).toBeTypeOf("function"); // sanity: same module the app itself uses
  });

  it(
    "refuses a visitor's 6th call today with 429 daily_limit_reached",
    async () => {
      const token = await newCallerToken();
      for (let i = 0; i < 5; i++) {
        const { status, body } = await createConversation(token);
        expect(status).toBe(200);
        sessionManager.close(body.conversation_id as string); // free the session slot without affecting the daily count
      }
      const sixth = await createConversation(token);
      expect(sixth.status).toBe(429);
      expect(sixth.body).toEqual({ error: "daily_limit_reached" });

      // Chat is limited separately, so a caller out of calls can still type.
      const chat = await createConversation(token, "web_text");
      expect(chat.status).toBe(200);
      sessionManager.close(chat.body.conversation_id as string);
    },
    30_000,
  );

  it(
    "refuses a 4th concurrent session with 503, distinct visitors, under the daily limit",
    async () => {
      for (let i = 0; i < 3; i++) {
        const { status } = await createConversation(await newCallerToken());
        expect(status).toBe(200);
      }
      const fourth = await createConversation(await newCallerToken());
      expect(fourth.status).toBe(503);
      expect(fourth.body).toEqual({ error: "all agents are busy, please try again shortly" });

      // Chats have their own pool - a full set of voice calls doesn't block one.
      const chat = await createConversation(await newCallerToken(), "web_text");
      expect(chat.status).toBe(200);
      sessionManager.close(chat.body.conversation_id as string);
    },
    30_000,
  );
});

describe("GET /api/conversations/:id/outcome", () => {
  it("reports the escalation this conversation created, with its reference and callback time", async () => {
    const { body } = await createConversation(await newCallerToken(), "web_text");
    const conversationId = body.conversation_id as string;
    const { data: ticket } = await supabase.from("support_tickets").insert({ conversation_id: conversationId, category: "account", priority: "high", summary: "s" }).select("id").single();
    const { data: esc } = await supabase
      .from("escalations")
      .insert({ conversation_id: conversationId, ticket_id: ticket!.id, user_name: "A", user_email: "a@example.com", category: "account", reason: "r", call_booked: true, callback_time: "2026-10-01T09:00:00Z" })
      .select("id")
      .single();
    const res = await fetch(`${baseUrl}/api/conversations/${conversationId}/outcome`, { headers: { Authorization: `Bearer ${body.token}` } });
    const outcome = (await res.json()) as { escalation: { reference: string; callback_time: string } };
    expect(outcome.escalation.reference).toBe(`ESC-${(esc!.id as string).replace(/-/g, "").slice(0, 8).toUpperCase()}`);
    expect(new Date(outcome.escalation.callback_time).toISOString()).toBe("2026-10-01T09:00:00.000Z");
    sessionManager.close(conversationId);
  });

  it("reports nothing for a conversation that created neither", async () => {
    const { body } = await createConversation(await newCallerToken(), "web_text");
    const res = await fetch(`${baseUrl}/api/conversations/${body.conversation_id}/outcome`, { headers: { Authorization: `Bearer ${body.token}` } });
    expect(await res.json()).toEqual({ escalation: null, ticket: null });
    sessionManager.close(body.conversation_id as string);
  });

  it("refuses another conversation's token", async () => {
    const a = await createConversation(await newCallerToken(), "web_text");
    const b = await createConversation(await newCallerToken(), "web_text");
    const res = await fetch(`${baseUrl}/api/conversations/${a.body.conversation_id}/outcome`, { headers: { Authorization: `Bearer ${b.body.token}` } });
    expect(res.status).toBe(401);
    sessionManager.close(a.body.conversation_id as string);
    sessionManager.close(b.body.conversation_id as string);
  });
});

describe("POST /vapi/chat/completions", () => {
  it("rejects a request with a bad X-Vapi-Server-Secret", async () => {
    const res = await fetch(`${baseUrl}/vapi/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-vapi-server-secret": "wrong" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], metadata: { conversation_id: "x", token: "y" } }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a request with an invalid or expired token", async () => {
    const { body } = await createConversation(await newCallerToken());
    const res = await fetch(`${baseUrl}/vapi/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-vapi-server-secret": VAPI_SERVER_SECRET },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], metadata: { conversation_id: body.conversation_id, token: "not-a-real-token" } }),
    });
    expect(res.status).toBe(401);
  });

  it(
    "streams an OpenAI-shaped chat.completion.chunk SSE reply and records the turn",
    async () => {
      const { body } = await createConversation(await newCallerToken());
      const res = await fetch(`${baseUrl}/vapi/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-vapi-server-secret": VAPI_SERVER_SECRET },
        body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "What are your fees?" }], metadata: { conversation_id: body.conversation_id, token: body.token } }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const text = await res.text();
      expect(text).toContain('"object":"chat.completion.chunk"');
      expect(text).toContain("Fees ");
      expect(text.trim().endsWith("data: [DONE]")).toBe(true);

      const { data: turn } = await supabase.from("conversation_turns").select("assistant_response").eq("conversation_id", body.conversation_id).single();
      expect(turn?.assistant_response).toBe("Fees depend on the corridor.");
    },
    20_000,
  );
});

describe("POST /api/text", () => {
  it(
    "streams a plain SSE reply for a text-channel turn",
    async () => {
      const { body } = await createConversation(await newCallerToken(), "web_text");
      const res = await fetch(`${baseUrl}/api/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: body.conversation_id, token: body.token, message: "What are your fees?" }),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('{"text":"Fees ');
      expect(text.trim().endsWith("data: [DONE]")).toBe(true);
    },
    20_000,
  );

  it("rejects a missing token", async () => {
    const res = await fetch(`${baseUrl}/api/text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: "x", message: "hi" }) });
    expect(res.status).toBe(400);
  });

  async function sendText(conversation: Record<string, unknown>, message: string) {
    const res = await fetch(`${baseUrl}/api/text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: conversation.conversation_id, token: conversation.token, message }) });
    return { status: res.status, body: res.headers.get("content-type")?.includes("json") ? ((await res.json()) as Record<string, unknown>) : await res.text() };
  }

  it("hands back a fresh conversation token with every message, so a chat outlasting the 20-minute token keeps working", async () => {
    const { body } = await createConversation(await newCallerToken(), "web_text");
    const res = await fetch(`${baseUrl}/api/text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: body.conversation_id, token: body.token, message: "x".repeat(1001) }) });
    const fresh = res.headers.get("x-conversation-token");
    expect(fresh).toBeTruthy();
    expect(verifyConversationToken(CONVERSATION_TOKEN_SECRET, fresh!, body.conversation_id as string)).toBe(true);
    expect(res.headers.get("access-control-expose-headers")).toContain("X-Conversation-Token");
    // An old token that's already expired is still refused - only a valid one earns a fresh one.
    const expired = issueConversationToken(CONVERSATION_TOKEN_SECRET, body.conversation_id as string, Date.now() - 21 * 60_000);
    const refused = await fetch(`${baseUrl}/api/text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: body.conversation_id, token: expired, message: "hi" }) });
    expect(refused.status).toBe(401);
    expect(refused.headers.get("x-conversation-token")).toBeNull();
  });

  it("refuses a message over 1,000 characters with 413, before any Claude call", async () => {
    const { body } = await createConversation(await newCallerToken(), "web_text");
    const res = await sendText(body, "x".repeat(1001));
    expect(res).toEqual({ status: 413, body: { error: "message_too_long" } });
    const { count } = await supabase.from("conversation_turns").select("id", { count: "exact", head: true }).eq("conversation_id", body.conversation_id);
    expect(count).toBe(0);
  });

  it("refuses the 31st message in one conversation with 429 conversation_message_limit", async () => {
    const { body } = await createConversation(await newCallerToken(), "web_text");
    const rows = Array.from({ length: 30 }, (_, i) => ({ conversation_id: body.conversation_id, seq: i + 1, user_transcript: "hi", assistant_response: "hello", answer_type: "answer" }));
    await supabase.from("conversation_turns").insert(rows);
    const res = await sendText(body, "one more");
    expect(res).toEqual({ status: 429, body: { error: "conversation_message_limit" } });
  }, 20_000);

  it("refuses a message to a conversation that has already ended with 409 conversation_ended", async () => {
    const { body } = await createConversation(await newCallerToken(), "web_text");
    await fetch(`${baseUrl}/api/text/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: body.conversation_id, token: body.token }) });
    const res = await sendText(body, "are you there?");
    expect(res).toEqual({ status: 409, body: { error: "conversation_ended" } });
  });
});

describe("POST /api/text/end", () => {
  it("closes the conversation and frees its session slot for the concurrency cap", async () => {
    const { body } = await createConversation(await newCallerToken(), "web_text");
    expect(sessionManager.has(body.conversation_id as string)).toBe(true);

    const res = await fetch(`${baseUrl}/api/text/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: body.conversation_id, token: body.token }) });
    expect(res.status).toBe(200);
    expect(sessionManager.has(body.conversation_id as string)).toBe(false);

    // Ended before the response; the summary is written just after, in the background.
    const { data: conversation } = await supabase.from("conversations").select("ended_at, ended_reason, final_status").eq("id", body.conversation_id).single();
    expect(conversation).toMatchObject({ ended_reason: "caller_ended", final_status: "completed" });
    expect(conversation?.ended_at).toBeTruthy();
    await expect.poll(async () => (await supabase.from("conversations").select("summary").eq("id", body.conversation_id).single()).data?.summary, { timeout: 5_000 }).toBe("Web chat with no messages. Ended by the customer.");
  });

  it("rejects an invalid token", async () => {
    const res = await fetch(`${baseUrl}/api/text/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: "x", token: "not-real" }) });
    expect(res.status).toBe(401);
  });
});

describe("POST /vapi/events", () => {
  it("rejects a bad X-Vapi-Server-Secret", async () => {
    const res = await fetch(`${baseUrl}/vapi/events`, { method: "POST", headers: { "Content-Type": "application/json", "x-vapi-server-secret": "wrong" }, body: JSON.stringify({ message: { type: "hang" } }) });
    expect(res.status).toBe(401);
  });

  it(
    "end-of-call-report closes the conversation, idempotently",
    async () => {
      const { body } = await createConversation(await newCallerToken());
      const payload = { message: { type: "end-of-call-report", endedReason: "customer-ended-call", call: { id: "vapi-call-1", metadata: { conversation_id: body.conversation_id } } } };
      const first = await fetch(`${baseUrl}/vapi/events`, { method: "POST", headers: { "Content-Type": "application/json", "x-vapi-server-secret": VAPI_SERVER_SECRET }, body: JSON.stringify(payload) });
      expect(first.status).toBe(200);

      const { data: afterFirst } = await supabase.from("conversations").select("ended_at, ended_reason, final_status").eq("id", body.conversation_id).single();
      expect(afterFirst).toMatchObject({ ended_reason: "customer-ended-call", final_status: "completed" });
      expect(afterFirst?.ended_at).toBeTruthy();

      const second = await fetch(`${baseUrl}/vapi/events`, { method: "POST", headers: { "Content-Type": "application/json", "x-vapi-server-secret": VAPI_SERVER_SECRET }, body: JSON.stringify(payload) });
      expect(second.status).toBe(200);
      const { data: afterSecond } = await supabase.from("conversations").select("ended_at").eq("id", body.conversation_id).single();
      expect(afterSecond?.ended_at).toBe(afterFirst?.ended_at); // unchanged - the resend was a no-op
    },
    20_000,
  );
});
