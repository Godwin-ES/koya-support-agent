// create_escalation (SYSTEM-DESIGN.md §5, escalation-rules.md).
//
// Proposal-first: the first call persists a read-back proposal only. A
// matching call on a later turn, carrying the proposal key, performs the
// write through the voice-support reliability migration's atomic RPC. The RPC owns idempotency,
// ticket linking and callback collision handling as one transaction.
//
// `call_booked` isn't one of the PRD's own tool inputs, so it's derived
// from whether a `preferred_time` was given, which is the only signal that
// exists. `callback_time` is `timestamptz` (migration 003) - `preferred_time`
// must be an ISO-8601 timestamp, not caller-spoken text like "tomorrow
// 10am" (also caught live: Postgres rejected that as an invalid timestamp).
// Converting relative spoken time into an absolute one is the model's job;
// this boundary still rejects malformed, past, weekend and out-of-hours
// slots deterministically before asking the caller to confirm.
//
// When no `ticket_id` is supplied, one is created and linked ("creates or
// links a ticket", SYSTEM-DESIGN.md §5) at `high` priority - an escalation
// is by definition something a human needs to act on soon.
import { GUEST_SCOPE_REFUSAL, isGuestScope, type ToolContext } from "../context";
import { isCategory } from "./categories";
import { verifiedCustomerId } from "./verification";
import { newEscalationMessage, sendDiscordAlert } from "../../notify/discord";
import { formatCallbackSlot, validateCallbackSlot } from "../callback-policy";
import { confirmSupportAction, proposeSupportAction, type ConfirmationRefusal } from "./support-action-confirmation";

export interface CreateEscalationInput {
  ticket_id?: string;
  customer_id?: string;
  /** Optional for a signed-in customer - their account's own name and email are used. */
  user_name?: string;
  user_email?: string;
  category: string;
  reason: string;
  preferred_time?: string;
  confirmed?: boolean;
  confirmation_key?: string;
}

export type CreateEscalationResult =
  | { refused: true; reason: "missing_name" | "invalid_email" | "invalid_category" | "invalid_time" | "past_time" | "weekend" | "outside_business_hours"; hint?: string }
  | typeof GUEST_SCOPE_REFUSAL
  | ConfirmationRefusal
  | { refused: true; reason: "slot_unavailable"; suggested_times: Array<{ iso: string; label: string }> }
  | { confirmation_required: true; confirmation_key: string; confirmation_summary: string }
  | { escalation_id: string; status: "open"; follow_up_summary: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function followUpSummary(preferredTime: string | undefined): string {
  return preferredTime
    ? `A specialist will follow up by email and call on ${formatCallbackSlot(preferredTime)}.`
    : "A specialist will follow up by email within 1 business day.";
}

async function nearbyAvailableSlots(context: ToolContext, preferredTime: string): Promise<Array<{ iso: string; label: string }>> {
  const { data, error } = await context.supabase
    .from("escalations")
    .select("callback_time")
    .eq("call_booked", true)
    .in("status", ["open", "in_progress"])
    .not("callback_time", "is", null);
  if (error) throw error;
  const occupied = (data ?? []).map((row) => Date.parse(row.callback_time as string));
  const suggestions: Array<{ iso: string; label: string }> = [];
  let candidateMs = Date.parse(preferredTime) + 30 * 60_000;
  for (let attempts = 0; attempts < 336 && suggestions.length < 3; attempts++, candidateMs += 30 * 60_000) {
    const candidate = new Date(candidateMs);
    const iso = candidate.toISOString();
    if (!validateCallbackSlot(iso).ok) continue;
    if (occupied.some((start) => Math.abs(start - candidateMs) < 30 * 60_000)) continue;
    suggestions.push({ iso, label: formatCallbackSlot(iso) });
  }
  return suggestions;
}

export async function createEscalation(context: ToolContext, rawInput: CreateEscalationInput): Promise<CreateEscalationResult> {
  if (isGuestScope(context)) return GUEST_SCOPE_REFUSAL;
  // The customer is always the conversation's own (verification.ts), never
  // one the model names; a signed-in customer's name and email come from
  // their account when the model leaves them out.
  const customerId = await verifiedCustomerId(context);
  const account = customerId ? await context.supabase.from("customers").select("contact_name, contact_email").eq("customer_id", customerId).single() : null;
  if (account?.error) throw account.error;
  const input = {
    ...rawInput,
    customer_id: customerId ?? undefined,
    user_name: rawInput.user_name?.trim() || account?.data?.contact_name || "",
    user_email: rawInput.user_email?.trim() || account?.data?.contact_email || "",
    reason: rawInput.reason.trim(),
  };
  if (!input.user_name) return { refused: true, reason: "missing_name" };
  if (!EMAIL_RE.test(input.user_email)) return { refused: true, reason: "invalid_email" };
  if (!isCategory(input.category)) return { refused: true, reason: "invalid_category" };
  if (input.preferred_time !== undefined) {
    const validation = validateCallbackSlot(input.preferred_time);
    if (!validation.ok) {
      return { refused: true, reason: validation.reason, hint: "Callbacks are available Monday to Friday, 9:00 AM to 3:00 PM WAT, in 30-minute slots. Supply an ISO-8601 timestamp with an explicit offset." };
    }
  }

  const payload = {
    ticket_id: input.ticket_id ?? null,
    customer_id: input.customer_id ?? null,
    user_name: input.user_name,
    user_email: input.user_email,
    category: input.category,
    reason: input.reason,
    preferred_time: input.preferred_time ?? null,
  };
  const kind = input.preferred_time ? "booking" as const : "escalation" as const;
  if (!input.confirmed) {
    const timing = input.preferred_time ? ` Callback: ${formatCallbackSlot(input.preferred_time)}.` : " Follow-up will be by email within one business day.";
    return proposeSupportAction(context, {
      kind,
      payload,
      confirmationSummary: `Create a ${input.category} escalation: ${input.reason}.${timing}`,
    });
  }
  const confirmation = await confirmSupportAction(context, input.confirmation_key, kind, payload);
  if ("refused" in confirmation) return confirmation;

  const { data, error } = await context.supabase.rpc("create_confirmed_escalation", {
    p_conversation_id: context.conversationId,
    p_customer_id: input.customer_id ?? null,
    p_user_name: input.user_name,
    p_user_email: input.user_email,
    p_category: input.category,
    p_reason: input.reason,
    p_callback_time: input.preferred_time ?? null,
    p_ticket_id: input.ticket_id ?? null,
  });
  if (error) throw error;
  const result = (data as Array<{ outcome: "created" | "existing" | "slot_unavailable"; escalation_id: string | null }>)[0];
  if (!result) throw new Error("create_confirmed_escalation returned no result");

  if (result.outcome === "slot_unavailable") {
    return { refused: true, reason: "slot_unavailable", suggested_times: await nearbyAvailableSlots(context, input.preferred_time!) };
  }
  if (result.outcome === "created") {
    await sendDiscordAlert(newEscalationMessage({ conversationId: context.conversationId, category: input.category, callbackTime: input.preferred_time ?? null, customerId: input.customer_id ?? null }));
  }
  return { escalation_id: result.escalation_id!, status: "open", follow_up_summary: followUpSummary(input.preferred_time) };
}
