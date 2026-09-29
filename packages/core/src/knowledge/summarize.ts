// One-line chunk summaries, generated once at ingest by Haiku - never per
// question (SYSTEM-DESIGN.md §6, §9: "Knowledge summaries... are computed
// once at ingest"). Takes the client as a parameter rather than
// constructing one internally, so ingest.ts owns the real API key and this
// stays testable with a stub.
import type Anthropic from "@anthropic-ai/sdk";
import type { KnowledgeChunk } from "./chunker";

const SUMMARY_MODEL = "claude-haiku-4-5";

export interface SummarizeResult {
  summary: string;
  inputTokens: number;
  outputTokens: number;
}

export async function summarizeChunk(anthropic: Anthropic, chunk: KnowledgeChunk): Promise<SummarizeResult> {
  const response = await anthropic.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 100,
    system:
      "Write one plain sentence (no markdown, under 25 words) summarizing what a support agent would learn from this RelayPay documentation section, for a chip shown to a human reviewer. State only what the text says - never add a claim, a number, or a policy the text doesn't contain.",
    messages: [{ role: "user", content: `Section: ${chunk.sectionPath}\n\n${chunk.content}` }],
  });
  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) throw new Error(`Haiku returned no text block summarizing "${chunk.sectionPath}"`);
  return { summary: block.text.trim(), inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
}
