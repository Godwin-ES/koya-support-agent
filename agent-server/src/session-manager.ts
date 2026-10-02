// One Session per conversation (SYSTEM-DESIGN.md §3-4): created at call
// start so its multi-second startup overlaps the greeting, closed after 2
// minutes idle or at call end, capped per pool (voice and chat never take
// each other's slots), and resumed with a
// handover note if a conversation already has turns recorded but no live
// session (a lost worker).
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHandoverNote, callerContextNote, type AccessScope, type BoundCustomer, type Channel, type PriorTurn } from "@core/agent";
import { RetryBuffer } from "@core/domain/write-buffer";
import type { SupportActivity } from "@core/domain/call-actions";
import { supabaseDegradedMessage, sendDiscordAlert } from "@core/notify/discord";
import { Session, type SessionOptions } from "./session";

export type Pool = "voice" | "text";

export function poolFor(channel: Channel): Pool {
  return channel === "web_text" ? "text" : "voice";
}

export class SessionCapacityError extends Error {
  constructor(
    max: number,
    readonly pool: Pool = "voice",
  ) {
    super(`at most ${max} ${pool} sessions can be open at once`);
    this.name = "SessionCapacityError";
  }
}

export interface SessionManagerOptions {
  supabase: SupabaseClient;
  mcpServerUrl: string;
  mcpServerToken: string;
  model: string;
  effort?: "low" | "high";
  /** Voice sessions open at once (SYSTEM-DESIGN.md §9). */
  maxConcurrent?: number;
  /** Chat sessions open at once - a separate pool, so chats never take a caller's slot. */
  maxConcurrentText?: number;
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
  pool: Pool;
}

interface PreparingSession {
  promise: Promise<Session>;
  pool: Pool;
  cancelled: boolean;
}

const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_MAX_CONCURRENT_TEXT = 4;
const DEFAULT_IDLE_MS = 2 * 60_000;

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly preparing = new Map<string, PreparingSession>();
  private readonly limits: Record<Pool, number>;
  private readonly idleMs: number;
  private sweepHandle: ReturnType<typeof setInterval> | null = null;
  /** Shared by every Session this manager creates, so a Supabase outage buffers and alerts once for the whole process, not per conversation (SYSTEM-DESIGN.md §10). */
  private readonly writeBuffer: RetryBuffer;

  constructor(private readonly options: SessionManagerOptions) {
    this.limits = { voice: options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT, text: options.maxConcurrentText ?? DEFAULT_MAX_CONCURRENT_TEXT };
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
    return this.sessions.size + this.preparing.size;
  }

  sizeOf(pool: Pool): number {
    let count = 0;
    for (const managed of this.sessions.values()) if (managed.pool === pool) count++;
    for (const pending of this.preparing.values()) if (pending.pool === pool) count++;
    return count;
  }

  isFull(pool: Pool): boolean {
    return this.sizeOf(pool) >= this.limits[pool];
  }

  limitOf(pool: Pool): number {
    return this.limits[pool];
  }

  has(conversationId: string): boolean {
    return this.sessions.has(conversationId) || this.preparing.has(conversationId);
  }

  activityOf(conversationId: string): SupportActivity {
    return this.sessions.get(conversationId)?.session.supportActivity ?? null;
  }

  /** Starts one shared preparation. Callers arriving during it join the same promise. */
  prepare(conversationId: string, channel: Channel = "web_voice", seed: { priorTurns?: PriorTurn[] } = {}): Promise<Session> {
    const pool = poolFor(channel);
    const existing = this.sessions.get(conversationId);
    if (existing) {
      // A prior turn's Claude/MCP failure already tore this session's own
      // query down (Session.handleClaudeFailure) - reusing it here would
      // silently drop or lose the next turn depending on an internal race
      // (Task 13's real finding). Fall through and build a fresh one below
      // instead, the same resume-with-a-handover-note path already used
      // for a genuinely lost worker.
      if (!existing.session.closed) {
        existing.lastActivity = Date.now();
        return Promise.resolve(existing.session);
      }
      this.sessions.delete(conversationId);
    }
    const inFlight = this.preparing.get(conversationId);
    if (inFlight) return inFlight.promise;
    if (this.isFull(pool)) throw new SessionCapacityError(this.limits[pool], pool);

    const reservation = { promise: null as unknown as Promise<Session>, pool, cancelled: false };
    reservation.promise = (async () => {
      try {
        const [priorTurns, caller] = await Promise.all([
          seed.priorTurns !== undefined ? Promise.resolve(seed.priorTurns) : this.fetchPriorTurns(conversationId),
          this.fetchCallerContext(conversationId),
        ]);
        const handoverNote = callerContextNote(caller.customer, caller.accessScope) + (priorTurns.length > 0 ? buildHandoverNote(priorTurns) : "");
        const sessionOptions: SessionOptions = {
          conversationId,
          model: this.options.model,
          effort: this.options.effort,
          mcpServerUrl: this.options.mcpServerUrl,
          mcpServerToken: this.options.mcpServerToken,
          supabase: this.options.supabase,
          channel,
          accessScope: caller.accessScope,
          handoverNote,
          queryFactory: this.options.queryFactory,
          writeBuffer: this.writeBuffer,
        };
        const session = (this.options.sessionFactory ?? ((o) => new Session(o)))(sessionOptions);
        if (reservation.cancelled || this.preparing.get(conversationId) !== reservation) {
          session.close();
          return session;
        }
        this.sessions.set(conversationId, { session, lastActivity: Date.now(), pool });
        return session;
      } finally {
        if (this.preparing.get(conversationId) === reservation) this.preparing.delete(conversationId);
      }
    })();
    this.preparing.set(conversationId, reservation);
    return reservation.promise;
  }

  /** Returns a ready session or joins its single in-flight preparation. */
  async getOrCreate(conversationId: string, channel: Channel = "web_voice"): Promise<Session> {
    return await this.prepare(conversationId, channel);
  }

  touch(conversationId: string): void {
    const managed = this.sessions.get(conversationId);
    if (managed) managed.lastActivity = Date.now();
  }

  close(conversationId: string): void {
    const pending = this.preparing.get(conversationId);
    if (pending) {
      pending.cancelled = true;
      this.preparing.delete(conversationId);
    }
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

  private async fetchCallerContext(conversationId: string): Promise<{ customer: BoundCustomer | null; accessScope: AccessScope }> {
    const { data, error } = await this.options.supabase.from("conversations").select("verified_customer_id, access_scope").eq("id", conversationId).maybeSingle();
    if (error) throw error;
    const row = data as { verified_customer_id: string | null; access_scope: AccessScope } | null;
    const accessScope = row?.access_scope ?? "evaluation";
    const customerId = row?.verified_customer_id;
    if (!customerId) return { customer: null, accessScope };
    const { data: customer, error: customerError } = await this.options.supabase.from("customers").select("customer_id, company_name, contact_name, contact_email").eq("customer_id", customerId).maybeSingle();
    if (customerError) throw customerError;
    return { customer: (customer as BoundCustomer | null) ?? null, accessScope };
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
