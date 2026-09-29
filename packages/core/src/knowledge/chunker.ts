// Splits relaypay-knowledge-base.md by heading into chunks
// (SYSTEM-DESIGN.md §6). Each `##` section becomes a chunk on its own (its
// intro text, if any, before the first `###`), and each `###` under it
// becomes its own chunk - about 37 chunks for the current knowledge base,
// matching the design's "about 35" estimate.
import { createHash } from "node:crypto";

export interface KnowledgeChunk {
  title: string;
  /** e.g. "Policies And Compliance > Account Restrictions" (SYSTEM-DESIGN.md §6). */
  sectionPath: string;
  content: string;
  /** sha256(sectionPath + content) - re-ingest keys on this to skip unchanged chunks (SYSTEM-DESIGN.md §6). */
  contentHash: string;
}

function hashChunk(sectionPath: string, content: string): string {
  return createHash("sha256").update(`${sectionPath}\n${content}`).digest("hex");
}

/**
 * Splits on `^## ` and `^### ` headings only - the knowledge base has no
 * `####` or deeper. A line of `#`s inside a fenced code block would break
 * this, but the knowledge base has no code blocks.
 */
export function chunkKnowledgeBase(markdown: string): KnowledgeChunk[] {
  const lines = markdown.split(/\r?\n/);
  const chunks: KnowledgeChunk[] = [];

  let h2: string | null = null;
  let h3: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    buffer = [];
    if (!h2 || !content) return; // no section yet, or a heading directly followed by another heading
    const title = h3 ?? h2;
    const sectionPath = h3 ? `${h2} > ${h3}` : h2;
    chunks.push({ title, sectionPath, content, contentHash: hashChunk(sectionPath, content) });
  };

  for (const line of lines) {
    const h2Match = /^##\s+(.+)$/.exec(line);
    const h3Match = /^###\s+(.+)$/.exec(line);
    // A top-level `# Title` line (the document's own title) starts no section - skip it, don't buffer it.
    const h1Match = /^#\s+(.+)$/.exec(line);

    if (h1Match) {
      flush();
      h2 = null;
      h3 = null;
      continue;
    }
    if (h2Match) {
      flush();
      h2 = h2Match[1]!.trim();
      h3 = null;
      continue;
    }
    if (h3Match) {
      flush();
      h3 = h3Match[1]!.trim();
      continue;
    }
    buffer.push(line);
  }
  flush();

  return chunks;
}
