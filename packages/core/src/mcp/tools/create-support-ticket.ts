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
import { newTicketMessage, sendDiscordAlert } from "../../notify/discord";

export interface CreateSupportTicketInput {
  customer_id?: string;
  category: string;
  priority: string;
  summary: string;
}

export type CreateSupportTicketResult = { refused: true; reason: "invalid_category" | "invalid_priority" } | { ticket_id: string; status: "open" };

const UNIQUE_VIOLATION = "23505";

const ALERTING_PRIORITIES = new Set(["high", "urgent"]);

/** `notify: false` for callers that already send their own alert about the same event (the failed-turn fallback). */
export async function createSupportTicket(context: ToolContext, input: CreateSupportTicketInput, options: { notify?: boolean } = {}): Promise<CreateSupportTicketResult> {
  if (!isCategory(input.category)) return { refused: true, reason: "invalid_category" };
  if (!isPriority(input.priority)) return { refused: true, reason: "invalid_priority" };

  const { data, error } = await context.supabase
    .from("support_tickets")
    .insert({
      conversation_id: context.conversationId,
      customer_id: input.customer_id ?? null,
      category: input.category,
      priority: input.priority,
      summary: input.summary,
    })
    .select("id")
    .single();

  if (!error) {
    if (options.notify !== false && ALERTING_PRIORITIES.has(input.priority)) {
      await sendDiscordAlert(newTicketMessage({ conversationId: context.conversationId, category: input.category, priority: input.priority, customerId: input.customer_id ?? null }));
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
