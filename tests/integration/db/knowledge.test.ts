import { describe, expect, it } from "vitest";
import { serviceRoleClient } from "../helpers/db";

// Schema-level smoke test only - match_knowledge() exists, runs, and its
// relevance floor filters correctly. The real retrieval accuracy check is
// tests/retrieval/labelled-set.test.ts, against the real ingested knowledge
// base (Task 4).
describe("match_knowledge", () => {
  const supabase = serviceRoleClient();
  // A zero vector has no norm, so cosine distance against it is 0/0 = NaN -
  // deliberately used here because it's what caught a real bug (migration
  // 011): Postgres `numeric` NaN compares greater than every value, so a
  // NaN score used to pass any min_score filter instead of being excluded.
  const zeroVector = `[${Array(384).fill(0).join(",")}]`;

  it("runs without error and returns an array", async () => {
    const { data, error } = await supabase.rpc("match_knowledge", { query_embedding: zeroVector, query_text: "international payment fees" });
    if (error) throw error;
    expect(Array.isArray(data)).toBe(true);
  });

  it("excludes NaN scores even under an unreachable min_score", async () => {
    const { data, error } = await supabase.rpc("match_knowledge", {
      query_embedding: zeroVector,
      query_text: "anything",
      match_count: 1,
      min_score: 999,
    });
    if (error) throw error;
    expect(data).toEqual([]);
  });
});
