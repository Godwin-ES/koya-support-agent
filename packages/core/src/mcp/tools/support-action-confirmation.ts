import { createHash, randomUUID } from "node:crypto";
import { currentTurnSeq, type ToolContext } from "../context";

export type SupportActionKind = "ticket" | "escalation" | "booking";

export interface SupportActionProposal {
  kind: SupportActionKind;
  payload: Record<string, unknown>;
  confirmationSummary: string;
}

export type ConfirmationRefusal = {
  refused: true;
  reason: "proposal_not_found" | "proposal_mismatch" | "confirmation_must_follow_proposal";
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export async function proposeSupportAction(context: ToolContext, proposal: SupportActionProposal) {
  const confirmationKey = randomUUID();
  const turnSeq = await currentTurnSeq(context);
  const { error } = await context.supabase.from("conversation_events").insert({
    conversation_id: context.conversationId,
    turn_seq: turnSeq,
    event_type: "support_action_proposed",
    summary: proposal.confirmationSummary,
    metadata: {
      confirmation_key: confirmationKey,
      kind: proposal.kind,
      payload_hash: payloadHash(proposal.payload),
      payload: proposal.payload,
    },
  });
  if (error) throw error;
  return {
    confirmation_required: true as const,
    confirmation_key: confirmationKey,
    confirmation_summary: proposal.confirmationSummary,
  };
}

export async function confirmSupportAction(
  context: ToolContext,
  confirmationKey: string | undefined,
  expectedKind: SupportActionKind,
  payload: Record<string, unknown>,
): Promise<{ confirmed: true } | ConfirmationRefusal> {
  if (!confirmationKey) return { refused: true, reason: "proposal_not_found" };

  const { data, error } = await context.supabase
    .from("conversation_events")
    .select("turn_seq, metadata")
    .eq("conversation_id", context.conversationId)
    .eq("event_type", "support_action_proposed")
    .contains("metadata", { confirmation_key: confirmationKey })
    .maybeSingle();
  if (error) throw error;
  if (!data) return { refused: true, reason: "proposal_not_found" };

  const metadata = data.metadata as { kind?: string; payload_hash?: string } | null;
  if (metadata?.kind !== expectedKind || metadata.payload_hash !== payloadHash(payload)) {
    return { refused: true, reason: "proposal_mismatch" };
  }

  const turnSeq = await currentTurnSeq(context);
  if (turnSeq <= data.turn_seq) return { refused: true, reason: "confirmation_must_follow_proposal" };
  return { confirmed: true };
}
