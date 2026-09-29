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
import { checkVisitorDailyLimit, countVisitorConversationsToday, DAILY_CALL_LIMIT, formatChatCompletionChunk, issueConversationToken, newUserMessage, parseChatCompletionsBody, parseVapiEventBody, SSE_DONE, verifyConversationToken } from "@core/agent";
import { currentTurnSeq } from "@core/mcp";
import { SessionCapacityError, SessionManager } from "./session-manager";

export interface AppDeps {
  supabase: SupabaseClient;
  sessionManager: SessionManager;
  conversationTokenSecret: string;
  vapiServerSecret?: string;
  model: string;
  maxConcurrentSessions?: number;
}

export function createApp(deps: AppDeps) {
  const { supabase, sessionManager } = deps;
  const maxConcurrent = deps.maxConcurrentSessions ?? 3;

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
    res.header("Access-Control-Allow-Headers", "Content-Type");
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

  // Every caller now signs in (Task 13/14 - the voice page moved off its
  // original fully-anonymous design), so caller_ref is the real
  // auth.users.id instead of a hashed IP+browser-id. `supabase.auth.getUser`
  // makes a real network call to validate the token against Supabase Auth
  // (authoritative, not a local JWT decode) - the same service-role client
  // used everywhere else works fine for this (Task 13: confirmed against
  // Supabase's own docs that client type isn't restricted for this call).
  async function verifyCaller(accessToken: unknown): Promise<string | null> {
    if (typeof accessToken !== "string" || !accessToken) return null;
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return data.user.id;
  }

  // -- GET /api/limits -------------------------------------------------------
  // Lets the voice page show "X of 3 calls used today" before the caller
  // ever hits the limit, not just the reactive "limit reached" message.
  app.get("/api/limits", async (req: Request, res: Response) => {
    const callerRef = await verifyCaller(req.query.access_token);
    if (!callerRef) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      const used = await countVisitorConversationsToday(supabase, callerRef);
      res.json({ used, limit: DAILY_CALL_LIMIT });
    } catch (err) {
      console.error("GET /api/limits failed:", err);
      res.status(500).json({ error: "internal error" });
    }
  });

  // -- POST /api/conversations ---------------------------------------------
  app.post("/api/conversations", async (req: Request, res: Response) => {
    const body = req.body as { channel?: "web_voice" | "web_text"; access_token?: string };
    const channel = body.channel ?? "web_voice";
    const callerRef = await verifyCaller(body.access_token);
    if (!callerRef) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    try {
      const limit = await checkVisitorDailyLimit(supabase, callerRef);
      if (!limit.allowed) {
        res.status(429).json({ error: limit.reason });
        return;
      }
      if (sessionManager.size >= maxConcurrent) {
        // SYSTEM-DESIGN.md §9's own wording for this case.
        res.status(503).json({ error: "all agents are busy, please try again shortly" });
        return;
      }

      const { data, error } = await supabase.from("conversations").insert({ channel, caller_ref: callerRef, model: deps.model }).select("id").single();
      if (error) throw error;
      const conversationId = data.id as string;

      // Started here, not on the first turn, so its multi-second startup
      // overlaps the greeting (SYSTEM-DESIGN.md §3 step 2).
      await sessionManager.getOrCreate(conversationId);

      const token = issueConversationToken(deps.conversationTokenSecret, conversationId);
      res.json({ conversation_id: conversationId, token });
    } catch (err) {
      if (err instanceof SessionCapacityError) {
        res.status(503).json({ error: "all agents are busy, please try again shortly" });
        return;
      }
      console.error("POST /api/conversations failed:", err);
      res.status(500).json({ error: "internal error" });
    }
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

    await streamTurn(deps, res, { conversationId: parsed.conversationId, userMessages: parsed.userMessages, model: parsed.model ?? deps.model, format: "openai" });
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

    await streamTurn(deps, res, { conversationId: body.conversation_id, userMessages: [body.message], model: deps.model, format: "plain", forceNew: true });
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

    const { data: existing } = await supabase.from("conversations").select("ended_at").eq("id", body.conversation_id).maybeSingle();
    if (!existing?.ended_at) {
      await supabase.from("conversations").update({ ended_at: new Date().toISOString(), ended_reason: "caller_ended", final_status: "completed" }).eq("id", body.conversation_id);
    }
    sessionManager.close(body.conversation_id);
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
        const { data: existing } = await supabase.from("conversations").select("ended_at").eq("id", event.conversationId).maybeSingle();
        if (!existing?.ended_at) {
          // Idempotent per call: a resend after ended_at is already set is a no-op (SYSTEM-DESIGN.md §10).
          await supabase
            .from("conversations")
            .update({
              ended_at: new Date().toISOString(),
              ended_reason: event.endedReason,
              final_status: event.endedReason.includes("error") ? "error" : "completed",
              summary: event.summary,
              ...(event.callId ? { vapi_call_id: event.callId } : {}),
            })
            .eq("id", event.conversationId);
        }
        sessionManager.close(event.conversationId);
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
}

async function streamTurn(deps: AppDeps, res: Response, args: StreamTurnArgs): Promise<void> {
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

    const session = await deps.sessionManager.getOrCreate(args.conversationId);
    for await (const event of session.runTurn(newMessage, { interrupted: () => interrupted })) {
      if (event.kind === "delta" && event.text) write(event.text);
    }
    res.write(SSE_DONE);
    res.end();
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
