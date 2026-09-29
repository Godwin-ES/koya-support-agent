// The conversation record's `summary` (PRD: "conversation ID, channel ...
// final status, and summary"). Built from what was recorded rather than by
// another model call, so it costs nothing and can't invent anything. Stored
// for the console only - Discord never receives it, since it quotes the
// customer's opening words.
import type { AnswerType } from "./decision";

export interface SummaryInput {
  channel: "web_voice" | "web_text" | "phone";
  turns: Array<{ user_transcript: string; answer_type: AnswerType }>;
  ticket: { category: string; priority: string } | null;
  escalation: { category: string; callbackBooked: boolean } | null;
  customerCompany: string | null;
  endedLabel: string;
}

const OPENER_MAX = 140;
const PHRASES: Record<AnswerType, [string, string]> = {
  answer: ["answered", "answered"],
  clarify: ["clarifying question", "clarifying questions"],
  escalate: ["escalation", "escalations"],
  decline: ["declined", "declined"],
};

export function endedLabel(reason: string | null): string {
  if (!reason) return "Ended";
  if (reason === "caller_ended") return "Ended by the customer";
  if (reason === "inactive") return "Closed after 15 minutes without a new message";
  if (reason === "no_end_of_call_report") return "Closed with no end-of-call report from Vapi";
  if (/max-duration|exceeded-max/.test(reason)) return "Reached the 5-minute call limit";
  if (reason === "customer-ended-call") return "Caller hung up";
  if (reason === "assistant-ended-call") return "Agent ended the call";
  if (/silence/.test(reason)) return "Ended after silence";
  if (/error|failed/.test(reason)) return `Ended by an error (${reason})`;
  return `Ended (${reason})`;
}

function opener(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > OPENER_MAX ? `${clean.slice(0, OPENER_MAX - 1)}…` : clean;
}

export function buildConversationSummary(input: SummaryInput): string {
  const kind = input.channel === "web_text" ? "Web chat" : input.channel === "phone" ? "Phone call" : "Voice call";
  if (input.turns.length === 0) return `${kind} with no messages. ${input.endedLabel}.`;

  const parts: string[] = [`${kind}, ${input.turns.length} ${input.turns.length === 1 ? "turn" : "turns"}.`];
  parts.push(`Opened with: "${opener(input.turns[0]!.user_transcript)}"`);

  const counts = new Map<AnswerType, number>();
  for (const turn of input.turns) counts.set(turn.answer_type, (counts.get(turn.answer_type) ?? 0) + 1);
  const handled = (["answer", "clarify", "escalate", "decline"] as AnswerType[])
    .filter((k) => counts.has(k))
    .map((k) => {
      const n = counts.get(k)!;
      return `${n} ${PHRASES[k][n === 1 ? 0 : 1]}`;
    });
  parts.push(`Handled: ${handled.join(", ")}.`);

  if (input.customerCompany) parts.push(`Verified as ${input.customerCompany}.`);
  if (input.escalation) parts.push(`Escalated to a specialist (${input.escalation.category})${input.escalation.callbackBooked ? " with a callback booked" : ""}.`);
  if (input.ticket && !input.escalation) parts.push(`Ticket opened (${input.ticket.category}, ${input.ticket.priority} priority).`);
  parts.push(`${input.endedLabel}.`);
  return parts.join(" ");
}
