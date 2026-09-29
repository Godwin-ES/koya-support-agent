// One Session per conversation (SYSTEM-DESIGN.md §3-4): created at call
// start so its multi-second startup overlaps the greeting, closed after 2
// minutes idle or at call end, capped at 3 at once, and resumed with a
// handover note if a conversation already has turns recorded but no live
// session (a lost worker).
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHandoverNote, type PriorTurn } from "@core/agent";
import { RetryBuffer } from "@core/domain/write-buffer";
import { supabaseDegradedMessage, sendDiscordAlert } from "@core/notify/discord";
import { Session, type SessionOptions } from "./session";

export class SessionCapacityError extends Error {
  constructor(max: number) {
    super(`at most ${max} sessions can be open at once`);
    this.name = "SessionCapacityError";
  }
}

export interface SessionManagerOptions {
  supabase: SupabaseClient;
  mcpServerUrl: string;
  mcpServerToken: string;
  model: string;
  effort?: "low" | "high";
  /** SYSTEM-DESIGN.md §3: "at most 3 sessions at once". */
  maxConcurrent?: number;
  /** SYSTEM-DESIGN.md §3: "close after 2 minutes idle". */
  idleMs?: number;
  /** Passed through to every Session it creates - session-manager tests supply a stubbed Agent SDK here, so the real Session and SessionManager code both run under test. */
  queryFactory?: SessionOptions["queryFactory"];
  /** Overrides how a Session is constructed outright - only for tests that need to bypass Session entirely. */
  sessionFactory?: (options: SessionOptions) => Session;
}

interface ManagedSession {
  session: Session;
  lastActivity: number;
}

const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_IDLE_MS = 2 * 60_000;

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly maxConcurrent: number;
  private readonly idleMs: number;
  private sweepHandle: ReturnType<typeof setInterval> | null = null;
  /** Shared by every Session this manager creates, so a Supabase outage buffers and alerts once for the whole process, not per conversation (SYSTEM-DESIGN.md §10). */
  private readonly writeBuffer: RetryBuffer;

  constructor(private readonly options: SessionManagerOptions) {
    this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
    this.writeBuffer = new RetryBuffer(options.supabase, {
      onFirstBuffer: () => {
        void sendDiscordAlert(supabaseDegradedMessage({ detail: "First write failed and was buffered - see agent-server logs." }));
      },
    });
  }

  /** For a periodic flush (index.ts) and for tests to check what's still pending after a simulated outage. */
  get pendingWrites(): number {
    return this.writeBuffer.pending;
  }

  async flushBufferedWrites(): Promise<number> {
    return this.writeBuffer.flush();
  }

  get size(): number {
    return this.sessions.size;
  }

  has(conversationId: string): boolean {
    return this.sessions.has(conversationId);
  }

  /** Starts a session at conversation start (before the caller's first turn), so its startup overlaps the greeting - or returns the existing one. */
  async getOrCreate(conversationId: string): Promise<Session> {
    const existing = this.sessions.get(conversationId);
    if (existing) {
      existing.lastActivity = Date.now();
      return existing.session;
    }
    if (this.sessions.size >= this.maxConcurrent) throw new SessionCapacityError(this.maxConcurrent);

    const priorTurns = await this.fetchPriorTurns(conversationId);
    const handoverNote = priorTurns.length > 0 ? buildHandoverNote(priorTurns) : undefined;

    const sessionOptions: SessionOptions = {
      conversationId,
      model: this.options.model,
      effort: this.options.effort,
      mcpServerUrl: this.options.mcpServerUrl,
      mcpServerToken: this.options.mcpServerToken,
      supabase: this.options.supabase,
      handoverNote,
      queryFactory: this.options.queryFactory,
      writeBuffer: this.writeBuffer,
    };
    const session = (this.options.sessionFactory ?? ((o) => new Session(o)))(sessionOptions);
    this.sessions.set(conversationId, { session, lastActivity: Date.now() });
    return session;
  }

  touch(conversationId: string): void {
    const managed = this.sessions.get(conversationId);
    if (managed) managed.lastActivity = Date.now();
  }

  close(conversationId: string): void {
    const managed = this.sessions.get(conversationId);
    if (!managed) return;
    managed.session.close();
    this.sessions.delete(conversationId);
  }

  /** Closes every session idle for at least idleMs, returning the conversation ids closed. Callable directly (deterministic, testable) or via startIdleSweep's timer. */
  sweepIdle(now: number = Date.now()): string[] {
    const closed: string[] = [];
    for (const [conversationId, managed] of this.sessions) {
      if (now - managed.lastActivity >= this.idleMs) {
        managed.session.close();
        this.sessions.delete(conversationId);
        closed.push(conversationId);
      }
    }
    return closed;
  }

  startIdleSweep(intervalMs = 30_000): void {
    if (this.sweepHandle) return;
    this.sweepHandle = setInterval(() => this.sweepIdle(), intervalMs);
    this.sweepHandle.unref?.();
  }

  stopIdleSweep(): void {
    if (this.sweepHandle) clearInterval(this.sweepHandle);
    this.sweepHandle = null;
  }

  private async fetchPriorTurns(conversationId: string): Promise<PriorTurn[]> {
    const { data, error } = await this.options.supabase
      .from("conversation_turns")
      .select("user_transcript, assistant_response")
      .eq("conversation_id", conversationId)
      .order("seq", { ascending: true });
    if (error) throw error;
    return (data ?? []) as PriorTurn[];
  }
}
