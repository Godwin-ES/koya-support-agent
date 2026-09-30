// A natural summary of a finished conversation, for the support team - what
// the customer wanted, what the agent did, and what happens next - written by
// Haiku once, when the conversation ends. The deterministic summary
// (conversation-summary.ts) read like a log line ("Web chat, 1 turn. Opened
// with: ... Handled: 1 clarifying question."); it stays as the fallback when
// this call fails, and for evaluation runs.
import type Anthropic from "@anthropic-ai/sdk";

const SUMMARY_MODEL = "claude-haiku-4-5";
const MAX_TURNS = 30;
const MAX_CHARS_PER_LINE = 700;

export interface SummaryConversation {
  channel: "web_voice" | "web_text" | "phone";
  customer: { name: string; company: string | null } | null;
  turns: Array<{ user_transcript: string; assistant_response: string }>;
  escalation: { category: string; callbackBooked: boolean } | null;
  ticket: { category: string; priority: string } | null;
  endedLabel: string;
}

const SYSTEM = `You write the summary a RelayPay support agent reads before opening a conversation between a customer and RelayPay's AI support agent.

Write two or three natural, plain sentences, in the past tense, like a colleague's handover note: what the customer wanted, what the AI agent did (answered, looked something up, asked a clarifying question, logged a ticket or handed over to a specialist), and what happens next if anything. Refer to the customer by first name when you know it.

Only state what the transcript and the facts given show - never invent amounts, dates, references or promises. No lists, headings, markdown, quotes of whole lines, or phrases like "this conversation" or "the transcript".`;

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > MAX_CHARS_PER_LINE ? `${clean.slice(0, MAX_CHARS_PER_LINE)}…` : clean;
}

export function summaryPrompt(c: SummaryConversation): string {
  const facts = [
    `Channel: ${c.channel === "web_text" ? "web chat" : "voice call"}`,
    c.customer ? `Customer: ${c.customer.name}${c.customer.company ? ` (${c.customer.company})` : ""}` : "Customer: not a customer account (a staff member or the demo login)",
    c.escalation ? `Outcome: escalated to a specialist (${c.escalation.category})${c.escalation.callbackBooked ? ", callback booked" : ", follow-up by email"}` : c.ticket ? `Outcome: support ticket opened (${c.ticket.category}, ${c.ticket.priority} priority)` : "Outcome: no ticket or escalation",
    `How it ended: ${c.endedLabel}`,
  ];
  const transcript = c.turns
    .slice(0, MAX_TURNS)
    .map((t) => `Customer: ${clip(t.user_transcript)}\nAgent: ${clip(t.assistant_response) || "(no reply - interrupted)"}`)
    .join("\n\n");
  return `${facts.join("\n")}\n\nTranscript:\n${transcript}`;
}

export async function writeConversationSummary(anthropic: Anthropic, conversation: SummaryConversation): Promise<string> {
  const response = await anthropic.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 220,
    system: SYSTEM,
    messages: [{ role: "user", content: summaryPrompt(conversation) }],
  });
  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const text = block?.text.trim();
  if (!text) throw new Error("Haiku returned no summary text");
  return text;
}

export type ConversationSummarizer = (conversation: SummaryConversation) => Promise<string>;
