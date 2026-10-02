// create_support_ticket (SYSTEM-DESIGN.md §5, mcp-tool-requirements.md).
//
// Idempotent per (conversation, category): migration 003's partial unique
// index (`support_tickets_open_unique`, status = 'open') is the real
// enforcement, not a pre-check - a pre-check-then-insert has a race, the
// unique index doesn't. A conflict just means "the caller already has an
// open ticket for this" - the existing one is returned rather than treated
// as a failure.
import type { ToolContext } from "../context";
import { isCategory, isPriority } from "./categories";
import { verifiedCustomerId } from "./verification";
import { newTicketMessage, sendDiscordAlert } from "../../notify/discord";
import { confirmSupportAction, proposeSupportAction, type ConfirmationRefusal } from "./support-action-confirmation";

export interface CreateSupportTicketInput {
  customer_id?: string;
  category: string;
  priority: string;
  summary: string;
  confirmed?: boolean;
  confirmation_key?: string;
}

export type CreateSupportTicketResult =
  | { refused: true; reason: "invalid_category" | "invalid_priority" }
  | ConfirmationRefusal
  | { confirmation_required: true; confirmation_key: string; confirmation_summary: string }
  | { ticket_id: string; status: "open" };

const UNIQUE_VIOLATION = "23505";

const ALERTING_PRIORITIES = new Set(["high", "urgent"]);

/** `systemFailure` is an internal-only emergency path and is never exposed by the MCP schema. */
export async function createSupportTicket(
  context: ToolContext,
  rawInput: CreateSupportTicketInput,
  options: { notify?: boolean; systemFailure?: boolean } = {},
): Promise<CreateSupportTicketResult> {
  const input = { ...rawInput, summary: rawInput.summary.trim() };
  if (!isCategory(input.category)) return { refused: true, reason: "invalid_category" };
  if (!isPriority(input.priority)) return { refused: true, reason: "invalid_priority" };
  // Always the conversation's own customer, never one the model names.
  const customerId = await verifiedCustomerId(context);

  if (!options.systemFailure) {
    const payload = { category: input.category, priority: input.priority, summary: input.summary };
    if (!input.confirmed) {
      return proposeSupportAction(context, {
        kind: "ticket",
        payload,
        confirmationSummary: `Create a ${input.priority}-priority ${input.category} support ticket: ${input.summary}`,
      });
    }
    const confirmation = await confirmSupportAction(context, input.confirmation_key, "ticket", payload);
    if ("refused" in confirmation) return confirmation;
  }

  const { data, error } = await context.supabase
    .from("support_tickets")
    .insert({
      conversation_id: context.conversationId,
      customer_id: customerId,
      category: input.category,
      priority: input.priority,
      summary: input.summary,
    })
    .select("id")
    .single();

  if (!error) {
    if (options.notify !== false && ALERTING_PRIORITIES.has(input.priority)) {
      await sendDiscordAlert(newTicketMessage({ conversationId: context.conversationId, category: input.category, priority: input.priority, customerId }));
    }
    return { ticket_id: data.id, status: "open" };
  }
  if (error.code !== UNIQUE_VIOLATION) throw error;

  const { data: existing, error: existingError } = await context.supabase
    .from("support_tickets")
    .select("id")
    .eq("conversation_id", context.conversationId)
    .eq("category", input.category)
    .eq("status", "open")
    .single();
  if (existingError) throw existingError;
  return { ticket_id: existing.id, status: "open" };
}
