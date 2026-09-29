// @vitest-environment node
//
// Task 6's session-manager tests: turn order, interrupt, idle close, the
// concurrency cap - all against the real Session and SessionManager code,
// with the Agent SDK itself stubbed (no Claude calls, $0) via a fake
// `query()` that plays back a scripted SDKMessage sequence. Per-turn
// recording still writes to the real, disposable conversation this project
// already tests everything else against.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { serviceRoleClient } from "../helpers/db";
import { SessionManager, SessionCapacityError } from "../../../agent-server/src/session-manager";
import type { SessionOptions } from "../../../agent-server/src/session";

const supabase: SupabaseClient = serviceRoleClient();
const conversationIds: string[] = [];

async function newConversation(): Promise<string> {
  const { data, error } = await supabase.from("conversations").insert({ channel: "web_text" }).select("id").single();
  if (error) throw error;
  conversationIds.push(data.id as string);
  return data.id as string;
}

afterEach(async () => {
  for (const id of conversationIds.splice(0)) await supabase.from("conversations").delete().eq("id", id);
});

/** Builds a stub `query()` that plays back `script`, ignoring input, recording interrupt() calls. */
function scriptedQueryFactory(script: SDKMessage[], onInterrupt?: () => void): NonNullable<SessionOptions["queryFactory"]> {
  return (_args: { prompt: AsyncIterable<SDKUserMessage> }) => {
    let index = 0;
    return {
      next: async () => {
        if (index >= script.length) return { done: true as const, value: undefined };
        return { done: false as const, value: script[index++] };
      },
      interrupt: async () => {
        onInterrupt?.();
      },
    } as unknown as Query;
  };
}

function textDelta(text: string): SDKMessage {
  return { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } } as unknown as SDKMessage;
}

function resultMessage(overrides: Partial<{ total_cost_usd: number }> = {}): SDKMessage {
  return { type: "result", subtype: "success", duration_ms: 10, is_error: false, total_cost_usd: overrides.total_cost_usd ?? 0.001, num_turns: 1 } as unknown as SDKMessage;
}

function failedResultMessage(subtype = "error_during_execution"): SDKMessage {
  return { type: "result", subtype, duration_ms: 10, is_error: true, num_turns: 1, errors: [] } as unknown as SDKMessage;
}

/** Like scriptedQueryFactory, but the first message arrives only after `delayMs` - long enough for the holding phrase's 900ms timer. */
function slowFirstReplyFactory(script: SDKMessage[], delayMs: number): NonNullable<SessionOptions["queryFactory"]> {
  return () => {
    let index = 0;
    return {
      next: async () => {
        if (index === 0) await new Promise((r) => setTimeout(r, delayMs));
        if (index >= script.length) return { done: true as const, value: undefined };
        return { done: false as const, value: script[index++] };
      },
      interrupt: async () => {},
    } as unknown as Query;
  };
}

describe("the holding phrase", () => {
  async function runSlowTurn(channel: "web_voice" | "web_text") {
    const conversationId = await newConversation();
    const manager = new SessionManager({ supabase, mcpServerUrl: "http://127.0.0.1:8090/mcp", mcpServerToken: "test-token", model: "claude-haiku-4-5", queryFactory: slowFirstReplyFactory([textDelta("Fees depend on the corridor."), resultMessage()], 1_200) });
    const session = await manager.getOrCreate(conversationId, channel);
    const deltas: string[] = [];
    for await (const event of session.runTurn("What are your fees?")) if (event.kind === "delta") deltas.push(event.text);
    const { data } = await supabase.from("conversation_turns").select("assistant_response").eq("conversation_id", conversationId).single();
    return { spoken: deltas.join(""), recorded: data?.assistant_response };
  }

  it("fills a slow voice turn with a short phrase, but never saves it into the recorded reply", async () => {
    const { spoken, recorded } = await runSlowTurn("web_voice");
    expect(spoken).not.toBe("Fees depend on the corridor.");
    expect(spoken.endsWith("Fees depend on the corridor.")).toBe(true);
    expect(recorded).toBe("Fees depend on the corridor.");
  }, 10_000);

  it("is never used in text chat - the page shows typing dots instead", async () => {
    const { spoken, recorded } = await runSlowTurn("web_text");
    expect(spoken).toBe("Fees depend on the corridor.");
    expect(recorded).toBe("Fees depend on the corridor.");
  }, 10_000);
});

describe("SessionManager", () => {
  it("keeps voice and chat in separate pools - a full set of calls doesn't block a chat", async () => {
    const manager = new SessionManager({ supabase, mcpServerUrl: "http://127.0.0.1:8090/mcp", mcpServerToken: "test-token", model: "claude-haiku-4-5", maxConcurrent: 1, maxConcurrentText: 1, queryFactory: scriptedQueryFactory([resultMessage()]) });
    await manager.getOrCreate(await newConversation(), "web_voice");
    await expect(manager.getOrCreate(await newConversation(), "web_voice")).rejects.toThrow(SessionCapacityError);
    await expect(manager.getOrCreate(await newConversation(), "web_text")).resolves.toBeDefined();
    await expect(manager.getOrCreate(await newConversation(), "web_text")).rejects.toThrow(SessionCapacityError);
  });

  it("streams a plain reply in order and records the turn", async () => {
    const conversationId = await newConversation();
    const manager = new SessionManager({ supabase, mcpServerUrl: "http://127.0.0.1:8090/mcp", mcpServerToken: "test-token", model: "claude-haiku-4-5", queryFactory: scriptedQueryFactory([textDelta("Fees "), textDelta("depend on the corridor."), resultMessage()]) });

    const session = await manager.getOrCreate(conversationId);
    const events = [];
    for await (const event of session.runTurn("What are your fees?")) events.push(event);

    const deltas = events.filter((e) => e.kind === "delta").map((e) => (e as { text: string }).text);
    expect(deltas.join("")).toBe("Fees depend on the corridor.");
    expect(events.at(-1)).toMatchObject({ kind: "done", answer_type: "clarify" }); // no tool activity, no declaration - the documented fallback

    const { data } = await supabase.from("conversation_turns").select("user_transcript, assistant_response, seq").eq("conversation_id", conversationId).single();
    expect(data).toMatchObject({ user_transcript: "What are your fees?", assistant_response: "Fees depend on the corridor.", seq: 1 });
  });

  it("calls query.interrupt() when told the caller talked over it", async () => {
    let interrupted = false;
    const conversationId = await newConversation();
    const manager = new SessionManager({
      supabase,
      mcpServerUrl: "http://127.0.0.1:8090/mcp",
      mcpServerToken: "test-token",
      model: "claude-haiku-4-5",
      queryFactory: scriptedQueryFactory([textDelta("Partial reply"), textDelta(" that gets cut off"), resultMessage()], () => {
        interrupted = true;
      }),
    });

    const session = await manager.getOrCreate(conversationId);
    const events = [];
    let seen = 0;
    for await (const event of session.runTurn("Tell me something long", { interrupted: () => ++seen >= 2 })) events.push(event);

    expect(interrupted).toBe(true);
    // Still recorded, with what was said before the interruption (a real
    // live call's hang-up mid-answer used to leave no turn at all).
    const { data } = await supabase.from("conversation_turns").select("user_transcript, assistant_response, interrupted").eq("conversation_id", conversationId).single();
    expect(data).toEqual({ user_transcript: "Tell me something long", assistant_response: "Partial reply", interrupted: true });
    expect(events.at(-1)).toMatchObject({ kind: "done", interrupted: true });
  });

  it("enforces the concurrency cap (at most 3 sessions at once)", async () => {
    const manager = new SessionManager({
      supabase,
      mcpServerUrl: "http://127.0.0.1:8090/mcp",
      mcpServerToken: "test-token",
      model: "claude-haiku-4-5",
      maxConcurrent: 3,
      queryFactory: scriptedQueryFactory([resultMessage()]),
    });

    const ids = await Promise.all([newConversation(), newConversation(), newConversation(), newConversation()]);
    for (let i = 0; i < 3; i++) await manager.getOrCreate(ids[i]!);
    expect(manager.size).toBe(3);
    await expect(manager.getOrCreate(ids[3]!)).rejects.toThrow(SessionCapacityError);
  });

  it("reusing an already-open conversation does not count against the cap", async () => {
    const manager = new SessionManager({
      supabase,
      mcpServerUrl: "http://127.0.0.1:8090/mcp",
      mcpServerToken: "test-token",
      model: "claude-haiku-4-5",
      maxConcurrent: 1,
      queryFactory: scriptedQueryFactory([resultMessage()]),
    });
    const id = await newConversation();
    const first = await manager.getOrCreate(id);
    const second = await manager.getOrCreate(id);
    expect(first).toBe(second);
  });

  it("closes sessions idle for at least idleMs on sweepIdle", async () => {
    const manager = new SessionManager({ supabase, mcpServerUrl: "http://127.0.0.1:8090/mcp", mcpServerToken: "test-token", model: "claude-haiku-4-5", idleMs: 1000, queryFactory: scriptedQueryFactory([resultMessage()]) });
    const id = await newConversation();
    await manager.getOrCreate(id);

    const stillOpen = manager.sweepIdle(Date.now() + 500);
    expect(stillOpen).toEqual([]);
    expect(manager.has(id)).toBe(true);

    const closed = manager.sweepIdle(Date.now() + 1500);
    expect(closed).toEqual([id]);
    expect(manager.has(id)).toBe(false);
  });

  it("a Claude failure does not end the conversation in the database - only the real end-of-call signal does (Task 13's real finding)", async () => {
    const conversationId = await newConversation();
    const manager = new SessionManager({ supabase, mcpServerUrl: "http://127.0.0.1:8090/mcp", mcpServerToken: "test-token", model: "claude-haiku-4-5", queryFactory: scriptedQueryFactory([failedResultMessage()]) });

    const session = await manager.getOrCreate(conversationId);
    const events = [];
    for await (const event of session.runTurn("What are your fees?")) events.push(event);

    expect(events.at(-1)).toMatchObject({ kind: "done", answer_type: "decline" });
    const { data } = await supabase.from("conversations").select("ended_at, final_status").eq("id", conversationId).single();
    expect(data).toMatchObject({ ended_at: null, final_status: null });
  });

  it("getOrCreate builds a fresh session instead of reusing one a failed turn already closed", async () => {
    const conversationId = await newConversation();
    const manager = new SessionManager({ supabase, mcpServerUrl: "http://127.0.0.1:8090/mcp", mcpServerToken: "test-token", model: "claude-haiku-4-5", queryFactory: scriptedQueryFactory([failedResultMessage()]) });

    const first = await manager.getOrCreate(conversationId);
    for await (const _event of first.runTurn("My payment is stuck")) {
      /* drain */
    }
    expect(first.closed).toBe(true);

    const second = await manager.getOrCreate(conversationId);
    expect(second).not.toBe(first);
    expect(second.closed).toBe(false);
  });

  it("touch() keeps a session alive past what would otherwise be its idle close", async () => {
    const manager = new SessionManager({ supabase, mcpServerUrl: "http://127.0.0.1:8090/mcp", mcpServerToken: "test-token", model: "claude-haiku-4-5", idleMs: 1000, queryFactory: scriptedQueryFactory([resultMessage()]) });
    const id = await newConversation();
    await manager.getOrCreate(id);

    manager.touch(id);
    const stillOpen = manager.sweepIdle(Date.now() + 900);
    expect(stillOpen).toEqual([]);
  });
});
