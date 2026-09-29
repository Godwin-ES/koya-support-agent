// create_escalation (SYSTEM-DESIGN.md §5, escalation-rules.md).
//
// Idempotent per conversation (migration 003's partial unique index,
// `escalations_open_unique`) - a repeat inside the same open escalation
// returns the existing record rather than erroring. The existing-escalation
// check runs *before* any ticket is created: creating a ticket on every
// call, even a repeat, would itself collide with support_tickets' own
// per-(conversation, category) uniqueness the moment two escalation calls
// in the same conversation shared a category - caught live by this file's
// own idempotency test failing with "duplicate key value violates unique
// constraint support_tickets_open_unique" before this reordering.
//
// `call_booked` isn't one of the PRD's own tool inputs, so it's derived
// from whether a `preferred_time` was given, which is the only signal that
// exists. `callback_time` is `timestamptz` (migration 003) - `preferred_time`
// must be an ISO-8601 timestamp, not caller-spoken text like "tomorrow
// 10am" (also caught live: Postgres rejected that as an invalid timestamp).
// Converting relative spoken time into an absolute one is the model's job,
// with the current date/time in its system prompt context (Task 6) - the
// tool's contract is the machine-readable form, refused rather than passed
// through raw if it isn't one.
//
// When no `ticket_id` is supplied, one is created and linked ("creates or
// links a ticket", SYSTEM-DESIGN.md §5) at `high` priority - an escalation
// is by definition something a human needs to act on soon.
import type { ToolContext } from "../context";
import { isCategory } from "./categories";
import { newEscalationMessage, sendDiscordAlert } from "../../notify/discord";

export interface CreateEscalationInput {
  ticket_id?: string;
  customer_id?: string;
  user_name: string;
  user_email: string;
  category: string;
  reason: string;
  preferred_time?: string;
}

export type CreateEscalationResult =
  | { refused: true; reason: "invalid_email" | "invalid_category" | "invalid_preferred_time" }
  | { escalation_id: string; status: "open"; follow_up_summary: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNIQUE_VIOLATION = "23505";

function followUpSummary(preferredTime: string | undefined): string {
  return preferredTime
    ? `A specialist will follow up by email and call at ${preferredTime}.`
    : "A specialist will follow up by email within 1 business day.";
}

async function existingOpenEscalation(context: ToolContext): Promise<{ id: string } | null> {
  const { data, error } = await context.supabase
    .from("escalations")
    .select("id")
    .eq("conversation_id", context.conversationId)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createEscalation(context: ToolContext, input: CreateEscalationInput): Promise<CreateEscalationResult> {
  if (!EMAIL_RE.test(input.user_email)) return { refused: true, reason: "invalid_email" };
  if (!isCategory(input.category)) return { refused: true, reason: "invalid_category" };
  if (input.preferred_time !== undefined && Number.isNaN(Date.parse(input.preferred_time))) {
    return { refused: true, reason: "invalid_preferred_time" };
  }

  const existing = await existingOpenEscalation(context);
  if (existing) return { escalation_id: existing.id, status: "open", follow_up_summary: followUpSummary(input.preferred_time) };

  let ticketId = input.ticket_id ?? null;
  if (!ticketId) {
    const { data: ticket, error: ticketError } = await context.supabase
      .from("support_tickets")
      .insert({
        conversation_id: context.conversationId,
        customer_id: input.customer_id ?? null,
        category: input.category,
        priority: "high",
        summary: input.reason,
      })
      .select("id")
      .single();
    if (ticketError) throw ticketError;
    ticketId = ticket.id;
  }

  const callBooked = Boolean(input.preferred_time);
  const { data, error } = await context.supabase
    .from("escalations")
    .insert({
      ticket_id: ticketId,
      conversation_id: context.conversationId,
      customer_id: input.customer_id ?? null,
      user_name: input.user_name,
      user_email: input.user_email,
      category: input.category,
      reason: input.reason,
      call_booked: callBooked,
      callback_time: input.preferred_time ?? null,
    })
    .select("id")
    .single();

  if (!error) {
    await sendDiscordAlert(newEscalationMessage({ conversationId: context.conversationId, category: input.category }));
    return { escalation_id: data.id, status: "open", follow_up_summary: followUpSummary(input.preferred_time) };
  }
  if (error.code !== UNIQUE_VIOLATION) throw error;

  // A race with another call for the same conversation - fall back to the same lookup.
  const raced = await existingOpenEscalation(context);
  if (!raced) throw error;
  return { escalation_id: raced.id, status: "open", follow_up_summary: followUpSummary(input.preferred_time) };
}
