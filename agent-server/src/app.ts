// The real endpoint set (SYSTEM-DESIGN.md §3, §7, §9; IMPLEMENTATION-PLAN.md
// Task 7): POST /api/conversations (limits, create, sign a token), POST
// /vapi/chat/completions (the real custom-llm endpoint), POST /vapi/events
// (end-of-call-report/status-update/hang), and POST /api/text (the same
// agent over SSE for the browser directly).
//
// `createApp` takes its dependencies (supabase client, secrets, the
// SessionManager) as arguments rather than reading `process.env` itself, so
// integration tests can build the real app around a real Supabase client
// and a stubbed-Agent-SDK SessionManager (Task 6's own pattern) with no live
// network listener and no Claude calls - index.ts is the only place that
// reads environment variables and actually calls `.listen()`.
import express, { type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_MESSAGES_PER_CONVERSATION,
  CHAT_MESSAGES_PER_DAY,
  checkChatMessage,
  checkVisitorDailyLimit,
  countChatMessagesToday,
  countVisitorConversationsToday,
  DAILY_CALL_LIMIT,
  formatChatCompletionChunk,
  issueConversationToken,
  newUserMessage,
  parseChatCompletionsBody,
  parseVapiEventBody,
  SSE_DONE,
  verifyConversationToken,
  type Channel,
} from "@core/agent";
import { currentTurnSeq } from "@core/mcp";
import { caseReference } from "@core/domain/case-reference";
import { finalizeConversation } from "./lifecycle";
import { OpsNotifier } from "./ops";
import { poolFor, SessionCapacityError, SessionManager } from "./session-manager";

export interface AppDeps {
  supabase: SupabaseClient;
  sessionManager: SessionManager;
  conversationTokenSecret: string;
  vapiServerSecret?: string;
  model: string;
  /** Busy, limit and spend notifications. Tests may omit it (a no-threshold notifier is used). */
  ops?: OpsNotifier;
}

export function createApp(deps: AppDeps) {
  const { supabase, sessionManager } = deps;
  const ops = deps.ops ?? new OpsNotifier(supabase, 0);
  // Chat conversations with a reply still streaming - a second message is
  // refused until it finishes (the page already disables Send; this is the
  // server-side guarantee a script can't skip).
  const repliesInFlight = new Set<string>();

  const app = express();
  app.set("trust proxy", true); // behind Caddy (SYSTEM-DESIGN.md §12) - req.ip must read X-Forwarded-For, not the proxy's own address
  app.use(express.json({ limit: "1mb" }));

  // The voice page (web, a different origin - Vercel) calls /api/* directly
  // from the browser (SYSTEM-DESIGN.md §2's architecture diagram). /vapi/*
  // is server-to-server (Vapi itself) and never needs this. No credentials
  // (cookies) cross this boundary - conversation_id and the signed token
  // travel in the request body, not a cookie - so a wildcard origin carries
  // no CSRF risk here.
  app.use("/api", (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => {
    // `model` lets the evaluation runner (Task 12) confirm which model this
    // process is actually configured for before spending real money on a
    // Haiku-vs-Sonnet comparison run - /api/text has no per-request model
    // override (deliberately: it's a public browser endpoint, not something
    // a caller should be able to redirect to a pricier model), so which
    // model runs is entirely down to how this process was started.
    res.json({ ok: true, sessions: sessionManager.size, model: deps.model });
  });

  // Access is invite-only: an account needs `app_metadata.invited` (or
  // staff), which only the admin API can set - so an account created
  // directly through Supabase's public sign-up endpoint still can't use the
  // agent. Every caller now signs in (Task 13/14 - the voice page moved off its
  // original fully-anonymous design), so caller_ref is the real
  // auth.users.id instead of a hashed IP+browser-id. `supabase.auth.getUser`
  // makes a real network call to validate the token against Supabase Auth
  // (authoritative, not a local JWT decode) - the same service-role client
  // used everywhere else works fine for this (Task 13: confirmed against
  // Supabase's own docs that client type isn't restricted for this call).
  //
  // `customerId` is the account's link to one customer record
  // (app_metadata.customer_id, admin-set like the rest): every conversation
  // the account starts is bound to that customer, and the account tools
  // only ever read that customer's records. No link (the demo account, a
  // reviewer invite) means general questions only.
  async function verifyCallerAccount(accessToken: unknown): Promise<{ id: string; customerId: string | null } | null> {
    if (typeof accessToken !== "string" || !accessToken) return null;
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) return null;
    const meta = data.user.app_metadata as { invited?: unknown; is_staff?: unknown; customer_id?: unknown } | undefined;
    // The same rule as web/lib/auth.ts's hasAppAccess: the invite script's
    // flag, staff, or Supabase's own invited_at from any admin invite.
    if (meta?.invited !== true && meta?.is_staff !== true && !data.user.invited_at) return null;
    return { id: data.user.id, customerId: typeof meta?.customer_id === "string" ? meta.customer_id : null };
  }

  async function verifyCaller(accessToken: unknown): Promise<string | null> {
    return (await verifyCallerAccount(accessToken))?.id ?? null;
  }

  // -- GET /api/limits -------------------------------------------------------
  // Lets the page show what's left today before the caller ever hits a
  // limit - calls and chat messages are counted separately.
  // The token comes in the Authorization header, never the URL: request
  // URLs show up in the proxy's own logs, and Caddy redacts Authorization.
  app.get("/api/limits", async (req: Request, res: Response) => {
    const bearer = req.header("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    const callerRef = await verifyCaller(bearer);
    if (!callerRef) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      const [callsUsed, chatUsed] = await Promise.all([countVisitorConversationsToday(supabase, callerRef), countChatMessagesToday(supabase, callerRef)]);
      res.json({
        calls: { used: callsUsed, limit: DAILY_CALL_LIMIT },
        chat: { used: chatUsed, limit: CHAT_MESSAGES_PER_DAY, per_conversation: CHAT_MESSAGES_PER_CONVERSATION, max_chars: CHAT_MESSAGE_MAX_CHARS },
      });
    } catch (err) {
      console.error("GET /api/limits failed:", err);
      res.status(500).json({ error: "internal error" });
    }
  });

  // -- POST /api/conversations ---------------------------------------------
  app.post("/api/conversations", async (req: Request, res: Response) => {
    const body = req.body as { channel?: "web_voice" | "web_text"; access_token?: string };
    const channel: Channel = body.channel === "web_text" ? "web_text" : "web_voice";
    const pool = poolFor(channel);
    const account = await verifyCallerAccount(body.access_token);
    if (!account) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const callerRef = account.id;

    try {
      if (channel === "web_voice") {
        const limit = await checkVisitorDailyLimit(supabase, callerRef);
        if (!limit.allowed) {
          void ops.limitReached("calls", callerRef, DAILY_CALL_LIMIT).catch(() => undefined);
          res.status(429).json({ error: limit.reason });
          return;
        }
      } else if ((await countChatMessagesToday(supabase, callerRef)) >= CHAT_MESSAGES_PER_DAY) {
        void ops.limitReached("chat", callerRef, CHAT_MESSAGES_PER_DAY).catch(() => undefined);
        res.status(429).json({ error: "chat_daily_limit" });
        return;
      }
      if (sessionManager.isFull(pool)) {
        // SYSTEM-DESIGN.md §9's own wording for this case.
        void ops.capacityRejected(pool, sessionManager.limitOf(pool)).catch(() => undefined);
        res.status(503).json({ error: "all agents are busy, please try again shortly" });
        return;
      }

      const { data, error } = await supabase.from("conversations").insert({ channel, caller_ref: callerRef, model: deps.model, verified_customer_id: account.customerId }).select("id").single();
      if (error) throw error;
      const conversationId = data.id as string;

      // Started here, not on the first turn, so its multi-second startup
      // overlaps the greeting (SYSTEM-DESIGN.md §3 step 2).
      await sessionManager.getOrCreate(conversationId, channel);

      const token = issueConversationToken(deps.conversationTokenSecret, conversationId);
      res.json({ conversation_id: conversationId, token });
    } catch (err) {
      if (err instanceof SessionCapacityError) {
        void ops.capacityRejected(err.pool, sessionManager.limitOf(err.pool)).catch(() => undefined);
        res.status(503).json({ error: "all agents are busy, please try again shortly" });
        return;
      }
      console.error("POST /api/conversations failed:", err);
      res.status(500).json({ error: "internal error" });
    }
  });

  // -- GET /api/conversations/:id/outcome -------------------------------------
  // What the end-of-call card shows (SYSTEM-DESIGN.md §11.7): whether this
  // conversation created an escalation or a ticket, its reference, and the
  // callback time. Authorised by the conversation's own signed token, in the
  // Authorization header, so only the caller who held the conversation can
  // read it.
  app.get("/api/conversations/:id/outcome", async (req: Request, res: Response) => {
    const conversationId = String(req.params.id);
    const token = req.header("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token || !verifyConversationToken(deps.conversationTokenSecret, token, conversationId)) {
      res.status(401).json({ error: "invalid or expired token" });
      return;
    }
    const [escalation, ticket] = await Promise.all([
      supabase.from("escalations").select("id, category, callback_time").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("support_tickets").select("id, category").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const esc = escalation.data as { id: string; category: string; callback_time: string | null } | null;
    const tkt = ticket.data as { id: string; category: string } | null;
    res.json({
      escalation: esc ? { reference: caseReference("escalation", esc.id), category: esc.category, callback_time: esc.callback_time } : null,
      ticket: tkt ? { reference: caseReference("ticket", tkt.id), category: tkt.category } : null,
    });
  });

  // -- GET /api/conversations/:id/turns ---------------------------------------
  // The voice page's clean transcript: each recorded turn as the server
  // received and answered it - the caller's whole message and the agent's
  // exact reply - replacing Vapi's live captions, which are split wherever
  // the speech paused. Same conversation-token authorisation as /outcome.
  app.get("/api/conversations/:id/turns", async (req: Request, res: Response) => {
    const conversationId = String(req.params.id);
    const token = req.header("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token || !verifyConversationToken(deps.conversationTokenSecret, token, conversationId)) {
      res.status(401).json({ error: "invalid or expired token" });
      return;
    }
    const { data, error } = await supabase.from("conversation_turns").select("seq, user_transcript, assistant_response").eq("conversation_id", conversationId).order("seq");
    if (error) {
      res.status(500).json({ error: "internal error" });
      return;
    }
    res.json({ turns: data ?? [] });
  });

  // -- POST /vapi/chat/completions -------------------------------------------
  app.post("/vapi/chat/completions", async (req: Request, res: Response) => {
    if (deps.vapiServerSecret && req.header("x-vapi-server-secret") !== deps.vapiServerSecret) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const parsed = parseChatCompletionsBody(req.body);
    if (!parsed) {
      res.status(400).json({ error: "invalid request body" });
      return;
    }
    if (!verifyConversationToken(deps.conversationTokenSecret, parsed.token, parsed.conversationId)) {
      res.status(401).json({ error: "invalid or expired token" });
      return;
    }

    // Always this process's own model - the one ANTHROPIC_MODEL sets for
    // voice and chat alike. The model name Vapi's assistant config sends
    // is ignored, so the two can never silently disagree.
    await streamTurn(deps, ops, res, { conversationId: parsed.conversationId, userMessages: parsed.userMessages, model: deps.model, format: "openai", channel: "web_voice" });
  });

  // -- POST /api/text ----------------------------------------------------------
  app.post("/api/text", async (req: Request, res: Response) => {
    const body = req.body as { conversation_id?: string; token?: string; message?: string };
    if (!body.conversation_id || !body.token || !body.message) {
      res.status(400).json({ error: "conversation_id, token and message are required" });
      return;
    }
    if (!verifyConversationToken(deps.conversationTokenSecret, body.token, body.conversation_id)) {
      res.status(401).json({ error: "invalid or expired token" });
      return;
    }
    const conversationId = body.conversation_id;

    const { data: conversation, error } = await supabase.from("conversations").select("caller_ref, ended_at").eq("id", conversationId).maybeSingle();
    if (error || !conversation) {
      res.status(404).json({ error: "conversation_not_found" });
      return;
    }
    if (conversation.ended_at) {
      res.status(409).json({ error: "conversation_ended" });
      return;
    }
    if (repliesInFlight.has(conversationId)) {
      res.status(409).json({ error: "reply_in_progress" });
      return;
    }

    repliesInFlight.add(conversationId);
    try {
      const callerRef = conversation.caller_ref as string | null;
      const [seq, messagesToday] = await Promise.all([currentTurnSeq({ supabase, conversationId }), callerRef ? countChatMessagesToday(supabase, callerRef) : Promise.resolve(null)]);
      const refusal = checkChatMessage({ messageLength: body.message.length, messagesInConversation: seq - 1, messagesToday });
      if (refusal) {
        if (refusal === "chat_daily_limit" && callerRef) void ops.limitReached("chat", callerRef, CHAT_MESSAGES_PER_DAY).catch(() => undefined);
        res.status(refusal === "message_too_long" ? 413 : 429).json({ error: refusal });
        return;
      }
      await streamTurn(deps, ops, res, { conversationId, userMessages: [body.message], model: deps.model, format: "plain", forceNew: true, channel: "web_text" });
    } finally {
      repliesInFlight.delete(conversationId);
    }
  });

  // -- POST /api/text/end -----------------------------------------------------
  // Closes a text conversation's session (SYSTEM-DESIGN.md §11.5's "End
  // conversation" action) - the text-channel equivalent of Vapi's own
  // end-of-call-report. Also what the evaluation runner (Task 12) uses
  // between scenarios: without it, a session stays open until its 2-minute
  // idle timeout, and SessionManager's 3-concurrent cap blocks every
  // scenario after the third (a real bug this endpoint's absence caused,
  // caught live running Task 12's first real eval pass).
  app.post("/api/text/end", async (req: Request, res: Response) => {
    const body = req.body as { conversation_id?: string; token?: string };
    if (!body.conversation_id || !body.token) {
      res.status(400).json({ error: "conversation_id and token are required" });
      return;
    }
    if (!verifyConversationToken(deps.conversationTokenSecret, body.token, body.conversation_id)) {
      res.status(401).json({ error: "invalid or expired token" });
      return;
    }

    sessionManager.close(body.conversation_id);
    try {
      await finalizeConversation(supabase, body.conversation_id, { endedReason: "caller_ended", finalStatus: "completed" });
    } catch (err) {
      console.error("finalizing text conversation failed:", err);
    }
    res.json({ ended: true });
  });

  // -- POST /vapi/events --------------------------------------------------------
  app.post("/vapi/events", async (req: Request, res: Response) => {
    if (deps.vapiServerSecret && req.header("x-vapi-server-secret") !== deps.vapiServerSecret) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const event = parseVapiEventBody(req.body);
    if (!event || !event.conversationId) {
      // Not one of the three types we handle, or Vapi's call.metadata didn't carry our conversation_id - nothing to do, but not an error either.
      res.status(200).json({ received: true });
      return;
    }

    try {
      if (event.type === "end-of-call-report") {
        sessionManager.close(event.conversationId);
        // Idempotent per call: a resend after the conversation already ended is a no-op (SYSTEM-DESIGN.md §10).
        await finalizeConversation(supabase, event.conversationId, {
          endedReason: event.endedReason,
          finalStatus: event.endedReason.includes("error") ? "error" : "completed",
          vapiSummary: event.summary,
          vapiCallId: event.callId,
        });
      } else if (event.type === "hang") {
        await supabase.from("conversation_events").insert({ conversation_id: event.conversationId, event_type: "vapi_hang", summary: "Vapi reported a hang (delayed or unresponsive assistant)." });
      } else if (event.type === "status-update") {
        const { data: last } = await supabase
          .from("conversation_events")
          .select("summary")
          .eq("conversation_id", event.conversationId)
          .eq("event_type", "vapi_status")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (last?.summary !== event.status) {
          await supabase.from("conversation_events").insert({ conversation_id: event.conversationId, event_type: "vapi_status", summary: event.status });
        }
      }
      res.status(200).json({ received: true });
    } catch (err) {
      console.error("POST /vapi/events failed:", err);
      res.status(500).json({ error: "internal error" });
    }
  });

  return app;
}

interface StreamTurnArgs {
  conversationId: string;
  userMessages: string[];
  model: string;
  format: "openai" | "plain";
  /** /api/text has no history to diff against - its one message is always new. */
  forceNew?: boolean;
  channel: Channel;
}

async function streamTurn(deps: AppDeps, ops: OpsNotifier, res: Response, args: StreamTurnArgs): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const turnId = `turn-${args.conversationId}-${Date.now()}`;
  const write = (text: string) => res.write(args.format === "openai" ? formatChatCompletionChunk(text, { id: turnId, model: args.model }) : `data: ${JSON.stringify({ text })}\n\n`);

  // Barge-in (SYSTEM-DESIGN.md §3 step 6): Vapi drops the connection when
  // the caller talks over the agent. `req.on("close")` is NOT the right
  // signal for this - a request's readable side can emit "close" once its
  // (already fully-buffered, small) body has been consumed, well before
  // the response finishes, which fired `interrupted = true` immediately on
  // every turn and produced an empty reply every time (caught live: an
  // end-to-end test came back as bare "data: [DONE]" with no text at all).
  // `res.on("close")` fires when the response's own connection ends -
  // guarded by `writableEnded` so a normal, complete response doesn't
  // register as an interruption.
  let interrupted = false;
  res.on("close", () => {
    if (!res.writableEnded) interrupted = true;
  });

  try {
    const seq = await currentTurnSeq({ supabase: deps.supabase, conversationId: args.conversationId });
    const recordedCount = seq - 1;

    const newMessage = args.forceNew ? (args.userMessages.at(-1) ?? null) : newUserMessage(args.userMessages, recordedCount);

    if (newMessage === null) {
      // A resend of a state we've already answered - idempotent replay, no new Claude call (SYSTEM-DESIGN.md §10).
      const { data } = await deps.supabase.from("conversation_turns").select("assistant_response").eq("conversation_id", args.conversationId).order("seq", { ascending: false }).limit(1).maybeSingle();
      if (data?.assistant_response) write(data.assistant_response);
      res.write(SSE_DONE);
      res.end();
      return;
    }

    const session = await deps.sessionManager.getOrCreate(args.conversationId, args.channel);
    for await (const event of session.runTurn(newMessage, { interrupted: () => interrupted })) {
      if (event.kind === "delta" && event.text) write(event.text);
    }
    res.write(SSE_DONE);
    res.end();
    void ops.checkDailySpend().catch((err) => console.error("spend check failed:", err));
  } catch (err) {
    console.error(`turn failed for ${args.conversationId}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "internal error" });
    } else if (!res.writableEnded) {
      res.write(SSE_DONE);
      res.end();
    }
  }
}
