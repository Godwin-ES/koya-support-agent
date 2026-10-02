// One conversation's live Agent SDK session (SYSTEM-DESIGN.md §3-4),
// generalising the Task 2 spike's SpikeSession: a real MCP connection (not
// an in-process stub), the real system prompt, the voice stream filter,
// and per-turn recording to Supabase.
//
// `queryFactory` is injectable so session-manager tests can drive this
// class with a stubbed SDK (turn order, interrupt, idle close, the
// concurrency cap) with no real Claude calls - the default is the real
// `query()` from `@anthropic-ai/claude-agent-sdk`.
import { query, type Query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allowedToolsForScope, buildSystemPrompt, decideTurn, DecisionTagExtractor, extractEmails, stripDecisionTags, VoiceStreamFilter, type AccessScope, type AnswerType, type Channel, type DeclaredDecision } from "@core/agent";
import { currentTurnSeq, readTurnToolCalls, type ToolContext, createSupportTicket, formatCallbackSlot } from "@core/mcp";
import { AgentFailure, classifyMcpFailure, classifySdkError, CLAUDE_DOWN_FALLBACK, MCP_DOWN_FALLBACK } from "@core/domain/failure";
import type { SupportActivity } from "@core/domain/call-actions";
import { RetryBuffer } from "@core/domain/write-buffer";
import { claudeFailedMessage, mcpDownMessage, sendDiscordAlert } from "@core/notify/discord";
import { DISALLOWED_BUILTIN_TOOLS } from "./disallowed-tools";

const MCP_SERVER_NAME = "relaypay-support";
const TOOL_NAMES = ["search_knowledge", "lookup_customer", "lookup_transaction", "lookup_payout", "list_account_activity", "create_support_ticket", "create_escalation", "log_conversation_event"] as const;

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
  channel?: Channel;
  accessScope?: AccessScope;
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
  private _supportActivity: SupportActivity = null;

  /** Whether a prior turn's failure already tore this session's query down (session-manager.ts checks this before reusing a cached session - reusing a closed one silently drops or loses turns, a real bug found in Task 13's live-call verification). */
  get closed(): boolean {
    return this._closed;
  }

  get supportActivity(): SupportActivity {
    return this._supportActivity;
  }
  private readonly allowedEmails = new Set<string>();
  // SDKResultSuccess.total_cost_usd is cumulative for the whole query()
  // session, not per turn ("each result carries the running total so far" -
  // the SDK's own doc comment on the field) - tracked here so each turn's
  // own cost_usd is the delta since the previous one, not the running total.
  private cumulativeCostUsd = 0;
  // The one outstanding read of the SDK's message stream, shared across
  // turns. A turn used to start its own read and leave a pre-fetched one
  // dangling when it ended, so the next turn's first message went to the
  // abandoned read and was lost.
  private pendingNext: Promise<IteratorResult<SDKMessage, void>> | null = null;
  // Turns run strictly one at a time per conversation: two HTTP requests for
  // the same call (Vapi sending the next turn while a cancelled one is
  // still unwinding) must never read the same stream at once.
  private turnLock: Promise<void> = Promise.resolve();
  // Interrupted turns whose own result message hasn't been read yet - it
  // must be skipped, not taken as the next turn's result.
  private staleResults = 0;

  constructor(options: SessionOptions) {
    this.conversationId = options.conversationId;
    this.toolContext = { supabase: options.supabase, conversationId: options.conversationId, accessScope: options.accessScope };
    this.writeBuffer = options.writeBuffer ?? new RetryBuffer(options.supabase);

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
            allowedTools: allowedToolsForScope(options.accessScope ?? "evaluation").map((name) => `mcp__${MCP_SERVER_NAME}__${name}`),
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

  private nextMessage(): Promise<IteratorResult<SDKMessage, void>> {
    if (!this.pendingNext) this.pendingNext = this.query.next();
    return this.pendingNext;
  }

  private consumeMessage(): void {
    this.pendingNext = null;
  }

  private async acquireTurn(): Promise<() => void> {
    const previous = this.turnLock;
    let release!: () => void;
    this.turnLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }

  /**
   * The SDK answers an interrupt by finishing the aborted turn with its own
   * result message (an error_during_execution result - "on a clean interrupt
   * this receipt is written before the interrupted turn result", its own
   * docs). Reads and discards everything up to that result, so the next turn
   * doesn't mistake it for its own failure. A real call hit exactly this:
   * "I'm having trouble on my side right now" on the turn after an
   * interruption. If the result doesn't arrive in time, the next turn skips
   * it instead.
   */
  private async drainUntilResult(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const raced = await Promise.race([this.nextMessage().then((r) => ({ r })), sleep(Math.max(0, deadline - Date.now())).then(() => null)]);
      if (!raced) break;
      this.consumeMessage();
      if (raced.r.done || raced.r.value.type === "result") return true;
    }
    return false;
  }

  close(): void {
    this._closed = true;
    this._supportActivity = null;
    this.waiter?.();
  }

  /** Pushes `userText`, streams the filtered reply, records the turn, and yields it as it goes. */
  async *runTurn(userText: string, opts: { interrupted?: () => boolean } = {}): AsyncGenerator<TurnEvent> {
    const release = await this.acquireTurn();
    try {
      while (this.staleResults > 0 && (await this.drainUntilResult(5_000))) this.staleResults--;
      yield* this.runTurnLocked(userText, opts);
    } finally {
      release();
    }
  }

  private async *runTurnLocked(userText: string, opts: { interrupted?: () => boolean }): AsyncGenerator<TurnEvent> {
    this.push(userText);

    const startedAt = performance.now();
    const filter = new VoiceStreamFilter(this.allowedEmails);
    const decisionTag = new DecisionTagExtractor();
    let declared: DeclaredDecision | undefined;
    let assistantResponse = "";
    let firstTokenAt: number | null = null;
    let interrupted = false;

    try {
      for (;;) {
        const result = await this.nextMessage();
        this.consumeMessage();
        if (result.done) break;
        const message = result.value;

        if (opts.interrupted?.()) {
          interrupted = true;
          await this.interrupt();
          if (message.type !== "result" && !(await this.drainUntilResult(3_000))) this.staleResults++;
          // The caller talked over the reply or hung up mid-answer - still a
          // real turn, so it's recorded with what was said so far, flagged
          // interrupted. Its cost arrives with the session's next result
          // message and is counted in that turn's delta.
          const seq = await currentTurnSeq(this.toolContext);
          const recorded = await readTurnToolCalls(this.toolContext, seq);
          if (decisionTag.decision) declared = decisionTag.decision;
          const decision = decideTurn({ toolCalls: recorded, declared });
          const ttft_ms = firstTokenAt !== null ? Math.round(firstTokenAt - startedAt) : null;
          const total_ms = Math.round(performance.now() - startedAt);
          // Vapi may endpoint on a short pause, cancel this request when the
          // caller continues, then resend the completed utterance in the same
          // transcript slot. Persisting a zero-output fragment makes that
          // finalized request look like a duplicate and yields silence.
          if (assistantResponse.trim() || recorded.length > 0) {
            await this.writeBuffer.writeOrBuffer("conversation_turns", {
              conversation_id: this.conversationId,
              seq,
              user_transcript: userText,
              assistant_response: summarize(stripDecisionTags(assistantResponse), 4000),
              answer_type: decision.answer_type,
              answer_type_inferred: decision.inferred,
              confidence: decision.confidence,
              confidence_note: decision.confidence_note,
              interrupted: true,
              ttft_ms,
              total_ms,
              cost_usd: 0,
            });
          }
          yield { kind: "done", seq, answer_type: decision.answer_type, confidence: decision.confidence, interrupted: true, ttft_ms, total_ms, cost_usd: 0 };
          return;
        }

        // A new text block after a tool call ("Let me pull that up." [lookup]
        // "Good news...") would otherwise run straight on - "up.Good" - and
        // the voice says both sentences as one crunched run.
        if (message.type === "stream_event" && message.event.type === "content_block_start" && message.event.content_block.type === "text" && /\S$/.test(assistantResponse)) {
          assistantResponse += " ";
          const text = filter.push(decisionTag.push(" "));
          if (text) yield { kind: "delta", text };
          continue;
        }

        if (message.type === "stream_event" && message.event.type === "content_block_delta" && message.event.delta.type === "text_delta") {
          this._supportActivity = null;
          if (firstTokenAt === null) firstTokenAt = performance.now();
          const text = filter.push(decisionTag.push(message.event.delta.text));
          assistantResponse += message.event.delta.text;
          if (text) yield { kind: "delta", text };
          continue;
        }

        if (message.type === "assistant") {
          for (const block of message.message.content) {
            if (block.type === "tool_use") {
              const name = stripMcpPrefix(block.name);
              const input = block.input && typeof block.input === "object" ? block.input as Record<string, unknown> : {};
              if (input.confirmed === true && name === "create_support_ticket") {
                this._supportActivity = { kind: "ticket", label: "Creating ticket" };
              } else if (input.confirmed === true && name === "create_escalation") {
                const preferredTime = typeof input.preferred_time === "string" ? input.preferred_time : null;
                this._supportActivity = preferredTime
                  ? { kind: "booking", label: `Setting booking for ${formatCallbackSlot(preferredTime)}` }
                  : { kind: "escalation", label: "Creating escalation" };
              }
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
          this._supportActivity = null;
          // SDKResultError (SYSTEM-DESIGN.md §10: "Claude down or erroring
          // mid-call") - the turn technically completed (the SDK didn't
          // throw), but produced no usable reply. Handled the same way as
          // a thrown exception, below.
          if (message.subtype !== "success") {
            yield* this.handleClaudeFailure(userText, classifySdkError(message.subtype, message.errors?.join("; ") ?? ""));
            return;
          }

          const tail = filter.push(decisionTag.flush()) + filter.flush();
          if (decisionTag.decision) declared = decisionTag.decision;
          if (tail) yield { kind: "delta", text: tail };

          const seq = await currentTurnSeq(this.toolContext);
          const recorded = await readTurnToolCalls(this.toolContext, seq);
          const decision = decideTurn({ toolCalls: recorded, declared });

          const ttft_ms = firstTokenAt !== null ? Math.round(firstTokenAt - startedAt) : null;
          const total_ms = Math.round(performance.now() - startedAt);
          const cumulative = message.total_cost_usd ?? this.cumulativeCostUsd;
          const cost_usd = Math.max(0, cumulative - this.cumulativeCostUsd);
          this.cumulativeCostUsd = cumulative;

          // The same "decision" event log_conversation_event used to write, so the audit trail is unchanged.
          if (decisionTag.decision) {
            await this.writeBuffer.writeOrBuffer("conversation_events", {
              conversation_id: this.conversationId,
              turn_seq: seq,
              event_type: "decision",
              summary: `Declared answer_type=${decisionTag.decision.answer_type}.`,
              metadata: decisionTag.decision,
            });
          }
          await this.writeBuffer.writeOrBuffer("conversation_turns", {
            conversation_id: this.conversationId,
            seq,
            user_transcript: userText,
            assistant_response: summarize(stripDecisionTags(assistantResponse), 4000),
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
    this._supportActivity = null;
    const isMcp = failure.provider === "mcp";
    const fallbackText = isMcp ? MCP_DOWN_FALLBACK : CLAUDE_DOWN_FALLBACK;
    yield { kind: "delta", text: fallbackText };

    await createSupportTicket(
      this.toolContext,
      { category: "other", priority: "urgent", summary: `A turn failed mid-conversation: ${failure.message}` },
      { notify: false, systemFailure: true },
    ).catch(() => undefined);

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
