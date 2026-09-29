// Chunks relaypay-knowledge-base.md, embeds and summarizes only the chunks
// that are new or changed since the last run, and upserts into
// knowledge_chunks (SYSTEM-DESIGN.md §6). Spends real Claude tokens (Haiku,
// one short summary per new chunk) - the first run costs something for all
// ~37 chunks; a re-run with nothing changed costs $0.
//
//   pnpm ingest
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { chunkKnowledgeBase, type KnowledgeChunk } from "../packages/core/src/knowledge/chunker";
import { embed, toPgVector } from "../packages/core/src/knowledge/embeddings";
import { summarizeChunk } from "../packages/core/src/knowledge/summarize";

export interface IngestResult {
  total: number;
  unchanged: number;
  ingested: number;
  pruned: number;
  /** Haiku input+output tokens spent on new summaries this run (0 when every chunk was unchanged). */
  summaryTokens: number;
}

/** The reusable logic - `main()` below wires it to real env/CLI use; a test can call this with a stub Anthropic client. */
export async function ingestKnowledgeBase(supabase: SupabaseClient, anthropic: Anthropic, markdown: string): Promise<IngestResult> {
  const chunks = chunkKnowledgeBase(markdown);
  const currentHashes = new Set(chunks.map((c) => c.contentHash));

  const { data: existingRows, error: existingError } = await supabase.from("knowledge_chunks").select("content_hash");
  if (existingError) throw existingError;
  const existingHashes = new Set((existingRows ?? []).map((r) => r.content_hash as string));

  const newChunks = chunks.filter((c) => !existingHashes.has(c.contentHash));

  let ingested = 0;
  let summaryTokens = 0;
  for (const chunk of newChunks) {
    const [embedding, summarized] = await Promise.all([embed(chunk.content), summarizeChunk(anthropic, chunk)]);
    summaryTokens += summarized.inputTokens + summarized.outputTokens;
    const { error } = await supabase.from("knowledge_chunks").upsert(
      {
        title: chunk.title,
        section_path: chunk.sectionPath,
        content: chunk.content,
        summary: summarized.summary,
        content_hash: chunk.contentHash,
        embedding: toPgVector(embedding),
      },
      { onConflict: "content_hash" },
    );
    if (error) throw error;
    ingested++;
    console.log(`ingested: ${chunk.sectionPath}`);
  }

  // Prune rows for sections removed or edited since the last ingest - a
  // changed chunk gets a new content_hash (inserted above) and its old row
  // is now orphaned; this removes it so search never returns stale content.
  const staleHashes = [...existingHashes].filter((h) => !currentHashes.has(h));
  let pruned = 0;
  if (staleHashes.length > 0) {
    const { error, count } = await supabase.from("knowledge_chunks").delete({ count: "exact" }).in("content_hash", staleHashes);
    if (error) throw error;
    pruned = count ?? 0;
  }

  return { total: chunks.length, unchanged: chunks.length - newChunks.length, ingested, pruned, summaryTokens };
}

async function main() {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  const { createClient } = await import("@supabase/supabase-js");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const anthropic = new Anthropic();
  const kbPath = path.resolve(process.cwd(), "..", "aat-c3-week-6-support-agent", "assets", "relaypay-knowledge-base.md");
  const markdown = readFileSync(kbPath, "utf-8");

  const result = await ingestKnowledgeBase(supabase, anthropic, markdown);
  console.log(`\n${result.total} chunks total: ${result.ingested} ingested, ${result.unchanged} unchanged, ${result.pruned} pruned. ${result.summaryTokens} Haiku tokens spent on summaries.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
