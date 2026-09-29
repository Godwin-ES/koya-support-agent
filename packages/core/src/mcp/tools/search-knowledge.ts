// search_knowledge (SYSTEM-DESIGN.md §5, §6) - retrieval as a tool, so it's
// logged and grounded rather than folded silently into the system prompt.
// Always writes a retrieval_logs row, found or not, so the console can show
// what a turn actually retrieved.
import type { ToolContext } from "../context";
import { currentTurnSeq } from "../context";
import { embed, toPgVector } from "../../knowledge/embeddings";

export interface SearchKnowledgeInput {
  query: string;
}

export type SearchKnowledgeResult =
  | { found: false }
  | { found: true; results: Array<{ chunk_id: string; title: string; summary: string; content: string }> };

interface MatchRow {
  chunk_id: string;
  title: string;
  section_path: string;
  content: string;
  summary: string;
  score: number;
}

export async function searchKnowledge(context: ToolContext, input: SearchKnowledgeInput): Promise<SearchKnowledgeResult> {
  const embedding = await embed(input.query);
  const { data, error } = await context.supabase.rpc("match_knowledge", {
    query_embedding: toPgVector(embedding),
    query_text: input.query,
  });
  if (error) throw error;

  const rows = (data ?? []) as MatchRow[];
  const turnSeq = await currentTurnSeq(context);
  await context.supabase.from("retrieval_logs").insert({
    conversation_id: context.conversationId,
    turn_seq: turnSeq,
    query: input.query,
    chunk_ids: rows.map((r) => r.chunk_id),
    source_titles: rows.map((r) => r.title),
    source_summaries: rows.map((r) => r.summary),
    scores: rows.map((r) => r.score),
    found: rows.length > 0,
  });

  if (rows.length === 0) return { found: false };
  return { found: true, results: rows.map((r) => ({ chunk_id: r.chunk_id, title: r.title, summary: r.summary, content: r.content })) };
}
