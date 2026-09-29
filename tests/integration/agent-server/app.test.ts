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
import { issueConversationToken } from "@core/agent/conversation-token";
import { serviceRoleClient } from "../helpers/db";

const CONVERSATION_TOKEN_SECRET = "test-conversation-token-secret";
const VISITOR_HASH_SALT = "test-visitor-hash-salt";
const VAPI_SERVER_SECRET = "test-vapi-server-secret";
const MODEL = "claude-haiku-4-5";

const supabase = serviceRoleClient();
const conversationIds: string[] = [];

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
  const app = createApp({ supabase, sessionManager, conversationTokenSecret: CONVERSATION_TOKEN_SECRET, visitorHashSalt: VISITOR_HASH_SALT, vapiServerSecret: VAPI_SERVER_SECRET, model: MODEL, maxConcurrentSessions: 3 });
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
});

async function createConversation(browserId: string, channel: "web_voice" | "web_text" = "web_voice"): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/api/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ browser_id: browserId, channel }) });
  const body = (await res.json()) as Record<string, unknown>;
  if (typeof body.conversation_id === "string") conversationIds.push(body.conversation_id);
  return { status: res.status, body };
}

describe("POST /api/conversations", () => {
  it("creates a conversation and returns a token that verifies for it", async () => {
    const { status, body } = await createConversation(crypto.randomUUID());
    expect(status).toBe(200);
    expect(typeof body.conversation_id).toBe("string");
    expect(typeof body.token).toBe("string");
    expect(issueConversationToken).toBeTypeOf("function"); // sanity: same module the app itself uses
  });

  it(
    "refuses a visitor's 4th call today with 429 daily_limit_reached",
    async () => {
      const browserId = crypto.randomUUID();
      for (let i = 0; i < 3; i++) {
        const { status, body } = await createConversation(browserId);
        expect(status).toBe(200);
        sessionManager.close(body.conversation_id as string); // free the session slot without affecting the daily count
      }
      const fourth = await createConversation(browserId);
      expect(fourth.status).toBe(429);
      expect(fourth.body).toEqual({ error: "daily_limit_reached" });
    },
    20_000,
  );

  it(
    "refuses a 4th concurrent session with 503, distinct visitors, under the daily limit",
    async () => {
      for (let i = 0; i < 3; i++) {
        const { status } = await createConversation(crypto.randomUUID());
        expect(status).toBe(200);
      }
      const fourth = await createConversation(crypto.randomUUID());
      expect(fourth.status).toBe(503);
      expect(fourth.body).toEqual({ error: "all agents are busy, please try again shortly" });
    },
    20_000,
  );
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
    const { body } = await createConversation(crypto.randomUUID());
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
      const { body } = await createConversation(crypto.randomUUID());
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
      const { body } = await createConversation(crypto.randomUUID(), "web_text");
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
});

describe("POST /api/text/end", () => {
  it("closes the conversation and frees its session slot for the concurrency cap", async () => {
    const { body } = await createConversation(crypto.randomUUID(), "web_text");
    expect(sessionManager.has(body.conversation_id as string)).toBe(true);

    const res = await fetch(`${baseUrl}/api/text/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: body.conversation_id, token: body.token }) });
    expect(res.status).toBe(200);
    expect(sessionManager.has(body.conversation_id as string)).toBe(false);

    const { data: conversation } = await supabase.from("conversations").select("ended_at, ended_reason, final_status").eq("id", body.conversation_id).single();
    expect(conversation).toMatchObject({ ended_reason: "caller_ended", final_status: "completed" });
    expect(conversation?.ended_at).toBeTruthy();
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
      const { body } = await createConversation(crypto.randomUUID());
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
