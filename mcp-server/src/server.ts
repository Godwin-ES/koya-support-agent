// The seven MCP tools (SYSTEM-DESIGN.md §5, mcp-tool-requirements.md),
// wired to the core business logic in @core/mcp and logged through
// callWithLogging so no handler can skip the tool_calls record.
//
// No z.record anywhere in an input schema (week 5's regression: one field
// the SDK can't convert to JSON Schema silently drops every tool from
// tools/list) - log_conversation_event's `metadata` is `z.unknown()`
// instead, which converts fine and still accepts any JSON object.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CreateSupportTicketResult, LogConversationEventResult, ToolContext } from "@core/mcp";
import {
  callWithLogging,
  createEscalation,
  createSupportTicket,
  logConversationEvent,
  lookupCustomer,
  lookupPayout,
  lookupTransaction,
  matchesConversation,
  searchKnowledge,
} from "@core/mcp";

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

const REFUSED_CONVERSATION_MISMATCH = { refused: true, reason: "conversation_id_mismatch" as const };

export function createServer(context: ToolContext): McpServer {
  const server = new McpServer({ name: "relaypay-support-mcp", version: "1.0.0" });

  server.registerTool(
    "search_knowledge",
    {
      description: "Retrieve approved RelayPay knowledge relevant to the caller's question.",
      inputSchema: { query: z.string().min(1) },
    },
    async (input) => textResult(await callWithLogging(context, "search_knowledge", "retrieve knowledge for the caller's question", input, async () => {
      const result = await searchKnowledge(context, input);
      return { status: result.found ? "ok" : "not_found", result };
    })),
  );

  server.registerTool(
    "lookup_customer",
    {
      description: "Look up the signed-in caller's own customer account - status, plan and how to handle it. Needs no identifiers: the caller is identified by their sign-in. Any identifiers given must be their own.",
      inputSchema: {
        customer_id: z.string().optional(),
        email: z.string().optional(),
        company_name: z.string().optional(),
        contact_name: z.string().optional(),
      },
    },
    async (input) => textResult(await callWithLogging(context, "lookup_customer", "look up the signed-in caller's own account", input, async () => {
      const result = await lookupCustomer(context, input);
      return { status: result.found ? "ok" : "not_found", result };
    })),
  );

  server.registerTool(
    "lookup_transaction",
    {
      description: "Look up one of the signed-in caller's own transactions by its reference. Other customers' transactions are never returned.",
      inputSchema: { transaction_id: z.string().min(1) },
    },
    async (input) => textResult(await callWithLogging(context, "lookup_transaction", "look up a transaction the caller referenced", input, async () => {
      const result = await lookupTransaction(context, input);
      return { status: result.found ? "ok" : "not_found", result };
    })),
  );

  server.registerTool(
    "lookup_payout",
    {
      description: "Look up one of the signed-in caller's own payouts by payout ID or transaction ID. Other customers' payouts are never returned.",
      inputSchema: {
        payout_id: z.string().optional(),
        transaction_id: z.string().optional(),
      },
    },
    async (input) => textResult(await callWithLogging(context, "lookup_payout", "look up a payout the caller referenced", input, async () => {
      const result = await lookupPayout(context, input);
      return { status: result.found ? "ok" : "not_found", result };
    })),
  );

  server.registerTool(
    "create_support_ticket",
    {
      description: "Log a specific problem for the support team to investigate (e.g. a failed payment or invoice payment, with its reference). Idempotent per conversation and category.",
      inputSchema: {
        customer_id: z.string().optional(),
        category: z.string().describe('Exactly one of: "compliance", "account", "dispute", "payment", "other".'),
        priority: z.string().describe('Exactly one of: "low", "medium", "high", "urgent".'),
        summary: z.string().min(1),
        conversation_id: z.string().optional(),
      },
    },
    async (input) => textResult(await callWithLogging<CreateSupportTicketResult | typeof REFUSED_CONVERSATION_MISMATCH>(context, "create_support_ticket", "log an issue for support follow-up", input, async () => {
      if (!matchesConversation(context, input.conversation_id)) return { status: "refused", result: REFUSED_CONVERSATION_MISMATCH };
      const result = await createSupportTicket(context, input);
      return { status: "refused" in result ? "refused" : "ok", result };
    })),
  );

  server.registerTool(
    "create_escalation",
    {
      description: "Hand off to human support - only for account access or restriction, compliance or identity verification, disputes, refunds or cancellations, frustrated or urgent callers, or anything needing human judgment. Idempotent per conversation.",
      inputSchema: {
        ticket_id: z.string().optional(),
        customer_id: z.string().optional(),
        user_name: z.string().optional().describe("Leave out for a signed-in customer - their account's name is used."),
        user_email: z.string().optional().describe("Leave out for a signed-in customer - their account's email is used."),
        category: z.string().describe('Exactly one of: "compliance", "account", "dispute", "payment", "other". KYC and identity-verification reviews are "compliance".'),
        reason: z.string().min(1),
        preferred_time: z.string().optional().describe("The callback time the caller asked for, as ISO-8601 with an offset (e.g. 2026-10-01T10:00:00+01:00). Required whenever the caller gave a time."),
      },
    },
    async (input) => textResult(await callWithLogging(context, "create_escalation", "hand the caller off to human support", input, async () => {
      const result = await createEscalation(context, input);
      return { status: "refused" in result ? "refused" : "ok", result };
    })),
  );

  server.registerTool(
    "log_conversation_event",
    {
      description: "Log an agent decision or other notable action.",
      inputSchema: {
        conversation_id: z.string().optional(),
        event_type: z.string().min(1),
        summary: z.string().min(1),
        metadata: z.unknown().optional(),
      },
    },
    async (input) => textResult(await callWithLogging<LogConversationEventResult | typeof REFUSED_CONVERSATION_MISMATCH>(context, "log_conversation_event", "log an agent decision or notable action", input, async () => {
      if (!matchesConversation(context, input.conversation_id)) return { status: "refused", result: REFUSED_CONVERSATION_MISMATCH };
      const result = await logConversationEvent(context, {
        event_type: input.event_type,
        summary: input.summary,
        metadata: (input.metadata as Record<string, unknown> | undefined) ?? {},
      });
      return { status: "ok", result };
    })),
  );

  return server;
}

export const TOOL_NAMES = [
  "search_knowledge",
  "lookup_customer",
  "lookup_transaction",
  "lookup_payout",
  "create_support_ticket",
  "create_escalation",
  "log_conversation_event",
] as const;
