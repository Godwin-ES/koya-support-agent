/**
 * Task 2 (IMPLEMENTATION-PLAN.md): the smallest real version of the session
 * design (SYSTEM-DESIGN.md §3-4) - one Agent SDK session per conversation,
 * fed by an async queue so a long-lived `query()` can be pushed a new user
 * message on every HTTP turn instead of starting a fresh session each time.
 * Deliberately minimal (one stub tool, no MCP-server process, no decision
 * recording, no holding phrase) - built out for real in Task 6.
 *
 * Confirmed from the installed SDK's own types before writing this
 * (sdk.d.ts, 0.3.283), not assumed: `query()`'s streaming-input mode emits
 * exactly one `result` message per turn and then keeps the session open for
 * the next push (SDKResultMessage's doc comment); `stream_event` messages
 * carry raw Anthropic streaming events, and a text token is
 * `event.type === "content_block_delta"` with `event.delta.type ===
 * "text_delta"`; the result carries the SDK's own `ttft_ms` alongside
 * `duration_ms` and `total_cost_usd`.
 */
import { createSdkMcpServer, query, tool, type Query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { DISALLOWED_BUILTIN_TOOLS } from "../disallowed-tools";

const SPIKE_SYSTEM_PROMPT = `You are a RelayPay customer support voice agent, in a latency spike test.
Keep replies to one or two short spoken sentences - no lists, no markdown.
If the caller mentions a transaction, payout, or account lookup, call the lookup_stub tool with a short "purpose" describing what you're checking, then answer from its result.
This is a timing test, not a real support conversation - just be a plausible, brief RelayPay support agent.`;

const lookupStub = tool(
  "lookup_stub",
  "A stand-in for a real MCP lookup tool (customer/transaction/payout), used only to measure how much a tool round trip adds to a turn's latency. Takes about 1 second.",
  { purpose: z.string().describe("What you're checking, e.g. 'transaction TXN-9001 status'") },
  async (args) => {
    const startedAt = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      content: [
        {
          type: "text" as const,
          text: `Stub lookup for "${args.purpose}": found, status is "processing", nothing else to report. (stub took ${Math.round(performance.now() - startedAt)}ms)`,
        },
      ],
    };
  },
);

export interface TurnEvent {
  kind: "text_delta" | "tool_start" | "result";
  text?: string;
  toolName?: string;
  result?: Extract<SDKMessage, { type: "result" }>;
}

/** One conversation's live Agent SDK session, fed by pushed user turns. */
export class SpikeSession {
  readonly startedAt = performance.now();
  readonly sessionStartMs: Promise<number>;
  private readonly query: Query;
  private readonly pending: SDKUserMessage[] = [];
  private waiter: (() => void) | null = null;
  private closed = false;
  private resolveSessionReady!: (ms: number) => void;

  constructor(model: string, effort: "low" | "high" = "low") {
    const server = createSdkMcpServer({ name: "spike-tools", version: "1.0.0", tools: [lookupStub], alwaysLoad: true });

    this.sessionStartMs = new Promise((resolve) => {
      this.resolveSessionReady = resolve;
    });

    this.query = query({
      prompt: this.userMessages(),
      options: {
        model,
        systemPrompt: { type: "custom", prompt: SPIKE_SYSTEM_PROMPT },
        mcpServers: { "spike-tools": server },
        allowedTools: ["mcp__spike-tools__lookup_stub"],
        disallowedTools: [...DISALLOWED_BUILTIN_TOOLS],
        includePartialMessages: true,
        settingSources: [],
        skills: [],
        maxTurns: 50,
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
        // `effort` defaults to "high" (sdk.d.ts) - deep reasoning before every
        // reply, unset in the first measurement round. SYSTEM-DESIGN.md §4
        // already called for "low", "because every extra second is audible";
        // this round tests whether it actually delivers that.
        effort,
      },
    }) as Query;
  }

  private async *userMessages(): AsyncGenerator<SDKUserMessage> {
    while (!this.closed) {
      if (this.pending.length > 0) {
        yield this.pending.shift()!;
        continue;
      }
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }

  push(text: string): void {
    this.pending.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null });
    this.waiter?.();
    this.waiter = null;
  }

  /** Consumes the underlying Query until this turn's `result` message, yielding text deltas and tool starts as they happen. */
  async *runTurn(): AsyncGenerator<TurnEvent> {
    let sawInit = false;
    for (;;) {
      const { value: message, done } = await this.query.next();
      if (done) return;

      if (!sawInit && message.type === "system" && message.subtype === "init") {
        sawInit = true;
        this.resolveSessionReady(performance.now() - this.startedAt);
        // Week 5's regression: one bad tool schema (a z.record field) silently
        // drops every tool from the list, and the session is then unusable
        // while looking like it started fine. Caught here, loudly, since a
        // tool-less session would also trivially look fast and skew the
        // latency measurement this spike exists to produce.
        if (!message.tools.includes("mcp__spike-tools__lookup_stub")) {
          console.error(`[spike] FATAL: lookup_stub tool missing from init - got tools: ${message.tools.join(", ")}`);
        }
      }

      if (message.type === "stream_event" && message.event.type === "content_block_delta" && message.event.delta.type === "text_delta") {
        yield { kind: "text_delta", text: message.event.delta.text };
      }

      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "tool_use") yield { kind: "tool_start", toolName: block.name };
        }
      }

      if (message.type === "result") {
        yield { kind: "result", result: message };
        return;
      }
    }
  }

  async interrupt(): Promise<void> {
    await this.query.interrupt();
  }

  close(): void {
    this.closed = true;
    this.waiter?.();
  }
}
