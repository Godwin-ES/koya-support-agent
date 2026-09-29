import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chunkKnowledgeBase } from "@core/knowledge/chunker";

const KB_PATH = path.resolve(process.cwd(), "..", "aat-c3-week-6-support-agent", "assets", "relaypay-knowledge-base.md");
const knowledgeBase = readFileSync(KB_PATH, "utf-8");

describe("chunkKnowledgeBase", () => {
  it("splits the real knowledge base into 37 chunks (2 h2 intros + 35 h3 subsections)", () => {
    const chunks = chunkKnowledgeBase(knowledgeBase);
    expect(chunks).toHaveLength(37);
  });

  it("builds section_path as 'h2 > h3', and title from the h3 (or the h2 for an intro chunk)", () => {
    const chunks = chunkKnowledgeBase(knowledgeBase);
    const feesFaq = chunks.find((c) => c.title === "How Does RelayPay Charge Fees?");
    expect(feesFaq?.sectionPath).toBe("Frequently Asked Questions > How Does RelayPay Charge Fees?");
    expect(feesFaq?.content).toContain("Fees vary based on transaction type");

    const intro = chunks.find((c) => c.sectionPath === "Product Features Overview");
    expect(intro?.title).toBe("Product Features Overview");
    expect(intro?.content).toContain("customer support and operations teams");
  });

  it("skips an h2 with no intro text before its first h3 (no empty chunk)", () => {
    const chunks = chunkKnowledgeBase(knowledgeBase);
    expect(chunks.some((c) => c.sectionPath === "Frequently Asked Questions")).toBe(false);
    expect(chunks.some((c) => c.sectionPath === "Release Notes And Known Limitations")).toBe(false);
  });

  it("gives every chunk a stable content_hash that changes only when its own content or path changes", () => {
    const [a] = chunkKnowledgeBase("## Section\n\n### Sub\n\nSome text.");
    const [b] = chunkKnowledgeBase("## Section\n\n### Sub\n\nSome text.");
    const [c] = chunkKnowledgeBase("## Section\n\n### Sub\n\nDifferent text.");
    expect(a!.contentHash).toBe(b!.contentHash);
    expect(a!.contentHash).not.toBe(c!.contentHash);
  });

  it("ignores the document's own top-level # title", () => {
    const chunks = chunkKnowledgeBase("# RelayPay Knowledge Base\n\nSome preamble that belongs to no section.\n\n## Real Section\n\n### Real Sub\n\nContent.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.sectionPath).toBe("Real Section > Real Sub");
  });
});
