// gte-small embeddings, run locally via transformers.js - no API key, no
// per-call cost (SYSTEM-DESIGN.md §6). Confirmed live before building on it
// (Task 4): `Supabase/gte-small` loads via `pipeline("feature-extraction",
// ...)`, `{ pooling: "mean", normalize: true }` gives a 384-dim vector
// matching the `vector(384)` column, and a load takes ~28s but a single
// embedding after that takes ~15ms - so the pipeline is loaded once and
// kept warm (a module-level singleton), never per call.
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) pipelinePromise = pipeline("feature-extraction", "Supabase/gte-small") as Promise<FeatureExtractionPipeline>;
  return pipelinePromise;
}

/** Call this once at process startup (agent-server) to pay the ~28s load cost before the first real request, not during it. */
export async function warmEmbeddings(): Promise<void> {
  await getPipeline();
}

export async function embed(text: string): Promise<number[]> {
  const pipe = await getPipeline();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/** pgvector's own text input format for a vector(384) column/argument: "[0.1,0.2,...]". */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
