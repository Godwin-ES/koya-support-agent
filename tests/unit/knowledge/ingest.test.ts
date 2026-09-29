import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";

// The real embed() loads transformers.js's model (~28s the first time) -
// far too slow for a unit test. Stubbed so this test is about the ingest
// *logic* (which chunks get processed, upserted, pruned), not the model.
vi.mock("@core/knowledge/embeddings", () => ({
  embed: vi.fn().mockResolvedValue(new Array(384).fill(0)),
  toPgVector: (v: number[]) => `[${v.join(",")}]`,
}));

const { ingestKnowledgeBase } = await import("../../../scripts/ingest-knowledge");

/** A minimal in-memory stand-in for exactly what ingestKnowledgeBase uses - not a general Supabase mock. */
function fakeSupabase(existingHashes: string[]) {
  const rows: Array<{ content_hash: string }> = existingHashes.map((content_hash) => ({ content_hash }));
  const upserted: Record<string, unknown>[] = [];
  const deletedHashes: string[] = [];

  const client = {
    from(table: string) {
      expect(table).toBe("knowledge_chunks");
      return {
        select: () => Promise.resolve({ data: rows, error: null }),
        upsert: (row: Record<string, unknown>) => {
          upserted.push(row);
          return Promise.resolve({ error: null });
        },
        delete: () => ({
          in: (_col: string, hashes: string[]) => {
            deletedHashes.push(...hashes);
            return Promise.resolve({ error: null, count: hashes.length });
          },
        }),
      };
    },
  } as unknown as SupabaseClient;

  return { client, upserted, deletedHashes };
}

const STUB_TOKENS_PER_CALL = 60; // 50 input + 10 output, arbitrary but fixed, so summaryTokens totals are exact per test

function stubAnthropic(): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "A one-line stub summary." }],
        usage: { input_tokens: 50, output_tokens: 10 },
      }),
    },
  } as unknown as Anthropic;
}

const MARKDOWN = `# Title

## Section A

### Sub A1

Content one.

### Sub A2

Content two.
`;

describe("ingestKnowledgeBase", () => {
  it("embeds and summarizes only chunks whose content_hash isn't already stored", async () => {
    const anthropic = stubAnthropic();
    const { client, upserted } = fakeSupabase([]); // nothing stored yet - both chunks are new
    const result = await ingestKnowledgeBase(client, anthropic, MARKDOWN);

    expect(result).toEqual({ total: 2, unchanged: 0, ingested: 2, pruned: 0, summaryTokens: 2 * STUB_TOKENS_PER_CALL });
    expect(upserted).toHaveLength(2);
    expect(anthropic.messages.create).toHaveBeenCalledTimes(2);
  });

  it("skips a chunk whose content_hash is already stored - no summary call, no upsert", async () => {
    const anthropic = stubAnthropic();
    // Compute what Sub A1's real hash would be by running the un-mocked chunker once.
    const { chunkKnowledgeBase } = await import("@core/knowledge/chunker");
    const [existing] = chunkKnowledgeBase(MARKDOWN);

    const { client, upserted } = fakeSupabase([existing!.contentHash]);
    const result = await ingestKnowledgeBase(client, anthropic, MARKDOWN);

    expect(result).toEqual({ total: 2, unchanged: 1, ingested: 1, pruned: 0, summaryTokens: STUB_TOKENS_PER_CALL });
    expect(upserted).toHaveLength(1);
    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
  });

  it("prunes a stored chunk whose section no longer exists in the current markdown", async () => {
    const anthropic = stubAnthropic();
    const { client, deletedHashes } = fakeSupabase(["a-hash-from-a-since-deleted-section"]);
    const result = await ingestKnowledgeBase(client, anthropic, MARKDOWN);

    expect(result.pruned).toBe(1);
    expect(deletedHashes).toEqual(["a-hash-from-a-since-deleted-section"]);
  });
});
