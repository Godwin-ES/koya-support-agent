// One conversation's live Agent SDK session (SYSTEM-DESIGN.md §3-4),
// generalising the Task 2 spike's SpikeSession: a real MCP connection (not
// an in-process stub), the real system prompt, the voice stream filter,
// the holding phrase for any slow turn, and per-turn recording to Supabase.
//
// `queryFactory` is injectable so session-manager tests can drive this
// class with a stubbed SDK (turn order, interrupt, idle close, the
// concurrency cap) with no real Claude calls - the default is the real
// `query()` from `@anthropic-ai/claude-agent-sdk`.
import { query, type Query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSystemPrompt, decideTurn, extractEmails, VoiceStreamFilter, type AnswerType, type Channel, type DeclaredDecision } from "@core/agent";
import { currentTurnSeq, readTurnToolCalls, type ToolContext, createSupportTicket } from "@core/mcp";
import { AgentFailure, classifyMcpFailure, classifySdkError, CLAUDE_DOWN_FALLBACK, MCP_DOWN_FALLBACK } from "@core/domain/failure";
import { RetryBuffer } from "@core/domain/write-buffer";
import { claudeFailedMessage, mcpDownMessage, sendDiscordAlert } from "@core/notify/discord";
import { DISALLOWED_BUILTIN_TOOLS } from "./disallowed-tools";

const MCP_SERVER_NAME = "relaypay-support";
const TOOL_NAMES = ["search_knowledge", "lookup_customer", "lookup_transaction", "lookup_payout", "create_support_ticket", "create_escalation", "log_conversation_event"] as const;

// SYSTEM-DESIGN.md §3 step 5, revised after Task 2's measurement: every
// turn's real thinking-before-anything-is-said time runs 2-5s regardless of
// a tool call, so the same filler fires whenever no token has arrived
// within ~900ms of the turn starting - not only the tool-call case it was
// first written for. Voice only: in text chat the page's typing dots
// already say "working on it", and a spoken filler read as the start of
// every reply. Rotated so a caller doesn't hear the same words every
// turn, and never saved into the recorded reply - it's there to fill
// silence, not part of the answer. Generic on purpose ("let me check"
// would be wrong on a turn with no lookup).
const HOLDING_DELAY_MS = 900;
export const HOLDING_PHRASES = ["Okay, one moment. ", "Sure, let's see. ", "Right, just a second. ", "Mm, give me a moment. "] as const;

export type TurnDeltaEvent = { kind: "delta"; text: string };
export type TurnDoneEvent = {
  kind: "done";
  seq: number;
  answer_type: AnswerType;
  confidence: number | null;
  interrupted: boolean;
  ttft_ms: number | null;
  total_ms: number;
  cost_usd: number;
};
export type TurnEvent = TurnDeltaEvent | TurnDoneEvent;

export interface SessionOptions {
  conversationId: string;
  model: string;
  effort?: "low" | "high";
  mcpServerUrl: string;
  mcpServerToken: string;
  supabase: SupabaseClient;
  /** Voice gets the spoken holding phrase; text doesn't. Defaults to voice. */
  channel?: Channel;
  /** SYSTEM-DESIGN.md §10: a fresh session for a conversation whose previous one was lost, briefed on what already happened. */
  handoverNote?: string;
  /** Overrides the real Agent SDK query() - session-manager tests supply a stub here. */
  queryFactory?: (args: { prompt: AsyncIterable<SDKUserMessage>; systemPrompt: string; model: string; effort: "low" | "high" }) => Query;
  /** Shared across every session in the process (SessionManager owns one) so a Supabase outage buffers and alerts once, not per session. Defaults to a fresh one per Session if not given (unit tests). */
  writeBuffer?: RetryBuffer;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripMcpPrefix(toolName: string): string {
  const prefix = `mcp__${MCP_SERVER_NAME}__`;
  return toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName;
}

function summarize(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export class Session {
  readonly conversationId: string;
  private readonly query: Query;
  private readonly toolContext: ToolContext;
  private readonly writeBuffer: RetryBuffer;
  private readonly pending: SDKUserMessage[] = [];
  private waiter: (() => void) | null = null;
  private _closed = false;

  /** Whether a prior turn's failure already tore this session's query down (session-manager.ts checks this before reusing a cached session - reusing a closed one silently drops or loses turns, a real bug found in Task 13's live-call verification). */
  get closed(): boolean {
    return this._closed;
  }
  private readonly allowedEmails = new Set<string>();
  // SDKResultSuccess.total_cost_usd is cumulative for the whole query()
  // session, not per turn ("each result carries the running total so far" -
  // the SDK's own doc comment on the field) - tracked here so each turn's
  // own cost_usd is the delta since the previous one, not the running total.
  private cumulativeCostUsd = 0;
  private readonly speaksHoldingPhrase: boolean;
  private holdingPhrasesUsed = 0;

  constructor(options: SessionOptions) {
    this.conversationId = options.conversationId;
    this.toolContext = { supabase: options.supabase, conversationId: options.conversationId };
    this.writeBuffer = options.writeBuffer ?? new RetryBuffer(options.supabase);
    this.speaksHoldingPhrase = (options.channel ?? "web_voice") !== "web_text";

    const systemPrompt = buildSystemPrompt(new Date()) + (options.handoverNote ?? "");
    const effort = options.effort ?? "low";
    const factory =
      options.queryFactory ??
      ((args: { prompt: AsyncIterable<SDKUserMessage>; systemPrompt: string; model: string; effort: "low" | "high" }) =>
        query({
          prompt: args.prompt,
          options: {
            model: args.model,
            systemPrompt: { type: "custom", prompt: args.systemPrompt },
            mcpServers: {
              [MCP_SERVER_NAME]: {
                type: "http",
                url: options.mcpServerUrl,
                headers: { Authorization: `Bearer ${options.mcpServerToken}`, "X-Conversation-Id": options.conversationId },
                alwaysLoad: true,
              },
            },
            allowedTools: TOOL_NAMES.map((name) => `mcp__${MCP_SERVER_NAME}__${name}`),
            disallowedTools: [...DISALLOWED_BUILTIN_TOOLS],
            includePartialMessages: true,
            settingSources: [],
            skills: [],
            maxTurns: 50,
            cwd: process.cwd(),
            env: process.env as Record<string, string>,
            effort: args.effort,
          },
        }) as Query);

    this.query = factory({ prompt: this.userMessages(), systemPrompt, model: options.model, effort });
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
    for (const email of extractEmails(text)) this.allowedEmails.add(email);
    this.pending.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null });
    this.waiter?.();
    this.waiter = null;
  }

  async interrupt(): Promise<void> {
    await this.query.interrupt();
  }

  close(): void {
    this._closed = true;
    this.waiter?.();
  }

  /** Pushes `userText`, streams the filtered reply, records the turn, and yields it as it goes. */
  async *runTurn(userText: string, opts: { interrupted?: () => boolean } = {}): AsyncGenerator<TurnEvent> {
    this.push(userText);

    const startedAt = performance.now();
    const filter = new VoiceStreamFilter(this.allowedEmails);
    let declared: DeclaredDecision | undefined;
    let assistantResponse = "";
    let firstTokenAt: number | null = null;
    let holdingSent = false;
    let interrupted = false;

    try {
      let nextPromise = this.query.next();
      for (;;) {
        let result: IteratorResult<SDKMessage, void>;

        if (this.speaksHoldingPhrase && firstTokenAt === null && !holdingSent) {
          const raced = await Promise.race([
            nextPromise.then((r) => ({ kind: "message" as const, r })),
            sleep(HOLDING_DELAY_MS).then(() => ({ kind: "timeout" as const })),
          ]);
          if (raced.kind === "timeout") {
            holdingSent = true;
            firstTokenAt = performance.now();
            const phrase = HOLDING_PHRASES[this.holdingPhrasesUsed++ % HOLDING_PHRASES.length]!;
            yield { kind: "delta", text: phrase };
            continue;
          }
          result = raced.r;
        } else {
          result = await nextPromise;
        }
        if (result.done) break;
        const message = result.value;
        nextPromise = this.query.next();

        if (opts.interrupted?.()) {
          interrupted = true;
          await this.interrupt();
          // The caller talked over the reply or hung up mid-answer - still a
          // real turn, so it's recorded with what was said so far, flagged
          // interrupted. Its cost arrives with the session's next result
          // message and is counted in that turn's delta.
          const seq = await currentTurnSeq(this.toolContext);
          const recorded = await readTurnToolCalls(this.toolContext, seq);
          const decision = decideTurn({ toolCalls: recorded, declared });
          const ttft_ms = firstTokenAt !== null ? Math.round(firstTokenAt - startedAt) : null;
          const total_ms = Math.round(performance.now() - startedAt);
          await this.writeBuffer.writeOrBuffer("conversation_turns", {
            conversation_id: this.conversationId,
            seq,
            user_transcript: userText,
            assistant_response: summarize(assistantResponse, 4000),
            answer_type: decision.answer_type,
            answer_type_inferred: decision.inferred,
            confidence: decision.confidence,
            confidence_note: decision.confidence_note,
            interrupted: true,
            ttft_ms,
            total_ms,
            cost_usd: 0,
          });
          yield { kind: "done", seq, answer_type: decision.answer_type, confidence: decision.confidence, interrupted: true, ttft_ms, total_ms, cost_usd: 0 };
          return;
        }

        if (message.type === "stream_event" && message.event.type === "content_block_delta" && message.event.delta.type === "text_delta") {
          if (firstTokenAt === null) firstTokenAt = performance.now();
          const text = filter.push(message.event.delta.text);
          assistantResponse += message.event.delta.text;
          if (text) yield { kind: "delta", text };
          continue;
        }

        if (message.type === "assistant") {
          for (const block of message.message.content) {
            if (block.type === "tool_use") {
              const name = stripMcpPrefix(block.name);
              if (name === "log_conversation_event" && block.input && typeof block.input === "object" && "metadata" in block.input) {
                const metadata = (block.input as { metadata?: unknown }).metadata;
                if (metadata && typeof metadata === "object" && "answer_type" in metadata) {
                  declared = metadata as DeclaredDecision;
                }
              }
            }
          }
          continue;
        }

        if (message.type === "result") {
          // SDKResultError (SYSTEM-DESIGN.md §10: "Claude down or erroring
          // mid-call") - the turn technically completed (the SDK didn't
          // throw), but produced no usable reply. Handled the same way as
          // a thrown exception, below.
          if (message.subtype !== "success") {
            yield* this.handleClaudeFailure(userText, classifySdkError(message.subtype, message.errors?.join("; ") ?? ""));
            return;
          }

          const tail = filter.flush();
          if (tail) yield { kind: "delta", text: tail };

          const seq = await currentTurnSeq(this.toolContext);
          const recorded = await readTurnToolCalls(this.toolContext, seq);
          const decision = decideTurn({ toolCalls: recorded, declared });

          const ttft_ms = firstTokenAt !== null ? Math.round(firstTokenAt - startedAt) : null;
          const total_ms = Math.round(performance.now() - startedAt);
          const cumulative = message.total_cost_usd ?? this.cumulativeCostUsd;
          const cost_usd = Math.max(0, cumulative - this.cumulativeCostUsd);
          this.cumulativeCostUsd = cumulative;

          await this.writeBuffer.writeOrBuffer("conversation_turns", {
            conversation_id: this.conversationId,
            seq,
            user_transcript: userText,
            assistant_response: summarize(assistantResponse, 4000),
            answer_type: decision.answer_type,
            answer_type_inferred: decision.inferred,
            confidence: decision.confidence,
            confidence_note: decision.confidence_note,
            interrupted,
            ttft_ms,
            total_ms,
            cost_usd,
          });

          yield { kind: "done", seq, answer_type: decision.answer_type, confidence: decision.confidence, interrupted, ttft_ms, total_ms, cost_usd };
          return;
        }
      }
    } catch (err) {
      // SYSTEM-DESIGN.md §10: "MCP server down: the agent can still answer
      // general questions from knowledge... Claude down: speak a short
      // fallback, create a ticket, end gracefully, and alert." In
      // practice search_knowledge is itself an MCP tool, so an unreachable
      // MCP server takes knowledge answers down with it too - there is no
      // tool-free fallback knowledge path, so this speaks the more honest
      // MCP_DOWN_FALLBACK instead. Distinguishing the two is a heuristic
      // (the SDK doesn't tag which leg of the connection failed): a
      // message naming the MCP server's own host/port is classified as
      // "mcp", everything else as a Claude-side failure.
      const message = err instanceof Error ? err.message : String(err);
      const failure = /mcp|127\.0\.0\.1:\d+\/mcp/i.test(message) ? classifyMcpFailure(message) : classifySdkError("unknown_error", message);
      yield* this.handleClaudeFailure(userText, failure);
    }
  }

  /**
   * The spoken fallback, a best-effort support ticket, a Discord alert, and
   * tearing down this session's own query (which may now be in a broken
   * state) - all best-effort, since a failure handler must never itself
   * throw.
   *
   * Deliberately does NOT mark the conversation ended in the database - a
   * single turn's Claude failure isn't the end of the call (the caller is
   * usually still on the line and keeps talking), only the real end-of-call
   * signal (Vapi's webhook, or /api/text/end) is. A real live call surfaced
   * this as a bug (Task 13): this used to close the conversation here, but
   * session-manager.getOrCreate() kept reusing this same (now-dead) Session
   * object for later turns anyway since nothing removed it from its map,
   * so the DB said "ended" while the call visibly continued - sometimes
   * getting a real reply (a lucky race with `push()`), sometimes silently
   * losing the turn ("Query closed before response received"). Now
   * getOrCreate() checks `session.closed` and builds a fresh session (with
   * a handover note, its existing resume mechanism) instead of reusing a
   * closed one - the conversation carries on cleanly either way.
   */
  private async *handleClaudeFailure(userText: string, failure: AgentFailure): AsyncGenerator<TurnEvent> {
    const isMcp = failure.provider === "mcp";
    const fallbackText = isMcp ? MCP_DOWN_FALLBACK : CLAUDE_DOWN_FALLBACK;
    yield { kind: "delta", text: fallbackText };

    await createSupportTicket(this.toolContext, { category: "other", priority: "urgent", summary: `A turn failed mid-conversation: ${failure.message}` }, { notify: false }).catch(() => undefined);

    const seq = await currentTurnSeq(this.toolContext).catch(() => 0);
    await this.writeBuffer
      .writeOrBuffer("conversation_turns", {
        conversation_id: this.conversationId,
        seq,
        user_transcript: userText,
        assistant_response: fallbackText,
        answer_type: "decline",
        answer_type_inferred: true,
        confidence: null,
        confidence_note: `A ${failure.provider} failure (${failure.kind}) interrupted this turn: ${failure.message}`,
        interrupted: false,
        ttft_ms: null,
        total_ms: null,
      })
      .catch(() => undefined);

    await sendDiscordAlert(isMcp ? mcpDownMessage({ conversationId: this.conversationId, detail: failure.message }) : claudeFailedMessage({ conversationId: this.conversationId, kind: failure.kind, detail: failure.message })).catch(() => undefined);

    yield { kind: "done", seq, answer_type: "decline", confidence: null, interrupted: false, ttft_ms: null, total_ms: 0, cost_usd: 0 };
    this.close();
  }
}
