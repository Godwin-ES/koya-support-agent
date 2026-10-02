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
import { Session, type SessionOptions } from "../../../agent-server/src/session";

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

function toolUseMessage(name: string, input: Record<string, unknown>): SDKMessage {
  return { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "tool-1", name: `mcp__relaypay-support__${name}`, input }] } } as unknown as SDKMessage;
}

/** Like scriptedQueryFactory, but the first message arrives only after `delayMs`. */
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

describe("slow turns", () => {
  async function runSlowTurn(channel: "web_voice" | "web_text") {
    const conversationId = await newConversation();
    const manager = new SessionManager({ supabase, mcpServerUrl: "http://127.0.0.1:8090/mcp", mcpServerToken: "test-token", model: "claude-haiku-4-5", queryFactory: slowFirstReplyFactory([textDelta("Fees depend on the corridor."), resultMessage()], 3_000) });
    const session = await manager.getOrCreate(conversationId, channel);
    const deltas: string[] = [];
    for await (const event of session.runTurn("What are your fees?")) if (event.kind === "delta") deltas.push(event.text);
    const { data } = await supabase.from("conversation_turns").select("assistant_response").eq("conversation_id", conversationId).single();
    return { spoken: deltas.join(""), recorded: data?.assistant_response };
  }

  it("does not inject spoken filler into a slow voice turn", async () => {
    const { spoken, recorded } = await runSlowTurn("web_voice");
    expect(spoken).toBe("Fees depend on the corridor.");
    expect(recorded).toBe("Fees depend on the corridor.");
  }, 10_000);

  it("is never used in text chat - the page shows typing dots instead", async () => {
    const { spoken, recorded } = await runSlowTurn("web_text");
    expect(spoken).toBe("Fees depend on the corridor.");
    expect(recorded).toBe("Fees depend on the corridor.");
  }, 10_000);
});

describe("meaningful support activity", () => {
  it("shows a confirmed booking with its full slot, then clears it when answer text resumes", async () => {
    const conversationId = await newConversation();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const script = [
      toolUseMessage("create_escalation", { confirmed: true, preferred_time: "2026-10-05T14:00:00+01:00" }),
      textDelta("Your callback is booked."),
      resultMessage(),
    ];
    const manager = new SessionManager({
      supabase,
      mcpServerUrl: "http://127.0.0.1:8090/mcp",
      mcpServerToken: "test-token",
      model: "claude-haiku-4-5",
      queryFactory: () => {
        let index = 0;
        return {
          next: async () => {
            if (index === 1) await gate;
            return { done: false as const, value: script[index++]! };
          },
          interrupt: async () => {},
        } as unknown as Query;
      },
    });
    const session = await manager.getOrCreate(conversationId, "web_voice");
    const iterator = session.runTurn("Yes, book it");
    const firstDelta = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(manager.activityOf(conversationId)).toEqual({ kind: "booking", label: "Setting booking for Monday, October 5 at 2:00 PM WAT" });
    release();
    expect(await firstDelta).toMatchObject({ value: { kind: "delta", text: "Your callback is booked." } });
    expect(manager.activityOf(conversationId)).toBeNull();
    await iterator.next();
  });

  it("does not surface private lookups or unconfirmed proposals", async () => {
    const conversationId = await newConversation();
    const manager = new SessionManager({ supabase, mcpServerUrl: "http://127.0.0.1:8090/mcp", mcpServerToken: "test-token", model: "claude-haiku-4-5", queryFactory: scriptedQueryFactory([
      toolUseMessage("lookup_transaction", { transaction_id: "TXN-9001" }),
      toolUseMessage("create_support_ticket", { confirmed: false }),
      textDelta("Please confirm."),
      resultMessage(),
    ]) });
    const session = await manager.getOrCreate(conversationId);
    for await (const _event of session.runTurn("Help")) expect(manager.activityOf(conversationId)).toBeNull();
  });
});

describe("the decision tag", () => {
  it("is taken out of the stream and the recorded reply, and becomes the turn's declared decision", async () => {
    const conversationId = await newConversation();
    const manager = new SessionManager({ supabase, mcpServerUrl: "http://127.0.0.1:8090/mcp", mcpServerToken: "test-token", model: "claude-haiku-4-5", queryFactory: scriptedQueryFactory([textDelta("Fees depend on the corridor. <deci"), textDelta('sion type="clarify" confidence="0.7"/>'), resultMessage()]) });
    const session = await manager.getOrCreate(conversationId, "web_text");
    const deltas: string[] = [];
    for await (const event of session.runTurn("What are your fees?")) if (event.kind === "delta") deltas.push(event.text);
    expect(deltas.join("")).toBe("Fees depend on the corridor. ");
    const { data } = await supabase.from("conversation_turns").select("assistant_response, answer_type, answer_type_inferred, confidence").eq("conversation_id", conversationId).single();
    expect(data).toMatchObject({ assistant_response: "Fees depend on the corridor.", answer_type: "clarify", answer_type_inferred: false, confidence: 0.7 });
  });
});

describe("text after a tool call", () => {
  it("is separated from the opener by a space, so the two sentences aren't spoken as one run", async () => {
    const conversationId = await newConversation();
    const textBlockStart = { type: "stream_event", event: { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } } } as unknown as SDKMessage;
    const manager = new SessionManager({ supabase, mcpServerUrl: "http://127.0.0.1:8090/mcp", mcpServerToken: "test-token", model: "claude-haiku-4-5", queryFactory: scriptedQueryFactory([textDelta("Let me pull that up."), textBlockStart, textDelta("Good news, it's on its way."), resultMessage()]) });
    const session = await manager.getOrCreate(conversationId, "web_voice");
    const deltas: string[] = [];
    for await (const event of session.runTurn("Where's my transfer?")) if (event.kind === "delta") deltas.push(event.text);
    expect(deltas.join("")).toBe("Let me pull that up. Good news, it's on its way.");
    const { data } = await supabase.from("conversation_turns").select("assistant_response").eq("conversation_id", conversationId).single();
    expect(data!.assistant_response).toBe("Let me pull that up. Good news, it's on its way.");
  });
});

describe("SessionManager", () => {
  it("single-flights prepare and getOrCreate for the same conversation", async () => {
    const id = await newConversation();
    let constructions = 0;
    const manager = new SessionManager({
      supabase,
      mcpServerUrl: "http://127.0.0.1:8090/mcp",
      mcpServerToken: "test-token",
      model: "claude-haiku-4-5",
      sessionFactory: (options) => { constructions++; return new Session(options); },
    });
    const [prepared, joined] = await Promise.all([
      manager.prepare(id, "web_voice", { priorTurns: [] }),
      manager.getOrCreate(id, "web_voice"),
    ]);
    expect(prepared).toBe(joined);
    expect(constructions).toBe(1);
  });

  it("counts preparation as capacity, releases failed preparation, and cannot be revived after close", async () => {
    const firstId = await newConversation();
    const secondId = await newConversation();
    let shouldFail = true;
    const manager = new SessionManager({
      supabase,
      mcpServerUrl: "http://127.0.0.1:8090/mcp",
      mcpServerToken: "test-token",
      model: "claude-haiku-4-5",
      maxConcurrent: 1,
      sessionFactory: (options) => {
        if (shouldFail) throw new Error("construction failed");
        return new Session(options);
      },
    });

    const failed = manager.prepare(firstId, "web_voice", { priorTurns: [] });
    expect(manager.sizeOf("voice")).toBe(1);
    await expect(failed).rejects.toThrow("construction failed");
    expect(manager.sizeOf("voice")).toBe(0);

    shouldFail = false;
    const pending = manager.prepare(secondId, "web_voice", { priorTurns: [] });
    expect(manager.isFull("voice")).toBe(true);
    manager.close(secondId);
    const late = await pending;
    expect(late.closed).toBe(true);
    expect(manager.has(secondId)).toBe(false);
    expect(manager.sizeOf("voice")).toBe(0);
  });

  it("uses seeded empty prior turns instead of rebuilding a handover from the database", async () => {
    const id = await newConversation();
    await supabase.from("conversation_turns").insert({ conversation_id: id, seq: 1, user_transcript: "Old question", assistant_response: "Old answer", answer_type: "answer" });
    let handover = "not captured";
    const manager = new SessionManager({
      supabase,
      mcpServerUrl: "http://127.0.0.1:8090/mcp",
      mcpServerToken: "test-token",
      model: "claude-haiku-4-5",
      sessionFactory: (options) => { handover = options.handoverNote ?? ""; return new Session(options); },
    });
    await manager.prepare(id, "web_voice", { priorTurns: [] });
    expect(handover).not.toContain("Old question");
  });

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

  it("does not record a provisional utterance cancelled before any reply was emitted", async () => {
    const conversationId = await newConversation();
    const manager = new SessionManager({
      supabase,
      mcpServerUrl: "http://127.0.0.1:8090/mcp",
      mcpServerToken: "test-token",
      model: "claude-haiku-4-5",
      queryFactory: scriptedQueryFactory([textDelta("This must not be spoken"), resultMessage()]),
    });

    const session = await manager.getOrCreate(conversationId);
    const events = [];
    for await (const event of session.runTurn("Yes.", { interrupted: () => true })) events.push(event);

    const { count } = await supabase.from("conversation_turns").select("*", { count: "exact", head: true }).eq("conversation_id", conversationId);
    expect(count).toBe(0);
    expect(events.at(-1)).toMatchObject({ kind: "done", interrupted: true });
  });

  it("the turn after an interruption gets its own reply, not the interrupted turn's leftover error result (a real call's \"I'm having trouble\")", async () => {
    const conversationId = await newConversation();
    // What the SDK really emits: the interrupted turn keeps streaming a little,
    // then ends with its own error_during_execution result - and only then
    // does the next turn's reply begin.
    const script = [textDelta("It looks like"), textDelta(" your message"), textDelta(" got cut"), textDelta(" off."), failedResultMessage(), textDelta("Fees vary by corridor."), resultMessage()];
    const manager = new SessionManager({ supabase, mcpServerUrl: "http://127.0.0.1:8090/mcp", mcpServerToken: "test-token", model: "claude-haiku-4-5", queryFactory: scriptedQueryFactory(script) });
    const session = await manager.getOrCreate(conversationId);

    let seen = 0;
    for await (const _event of session.runTurn("Showing the", { interrupted: () => ++seen >= 2 })) void _event;

    const second = [];
    for await (const event of session.runTurn("What fees do you charge for international payments?")) second.push(event);
    const reply = second.filter((e) => e.kind === "delta").map((e) => (e as { text: string }).text).join("");
    expect(reply).toBe("Fees vary by corridor.");
    expect(second.at(-1)).toMatchObject({ kind: "done", interrupted: false });
    expect(session.closed).toBe(false);
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
