import { describe, expect, it } from "vitest";
import { hashVisitor } from "@core/agent/visitor";

describe("hashVisitor", () => {
  it("never contains the raw IP in its output", () => {
    const hash = hashVisitor("salt", "203.0.113.42", "browser-abc");
    expect(hash).not.toContain("203.0.113.42");
  });

  it("is deterministic for the same inputs", () => {
    expect(hashVisitor("salt", "203.0.113.42", "browser-abc")).toBe(hashVisitor("salt", "203.0.113.42", "browser-abc"));
  });

  it("differs for a different browser id on the same IP", () => {
    expect(hashVisitor("salt", "203.0.113.42", "browser-abc")).not.toBe(hashVisitor("salt", "203.0.113.42", "browser-xyz"));
  });

  it("differs for a different salt", () => {
    expect(hashVisitor("salt-a", "203.0.113.42", "browser-abc")).not.toBe(hashVisitor("salt-b", "203.0.113.42", "browser-abc"));
  });

  it("still produces a value with no browser id (storage blocked)", () => {
    expect(hashVisitor("salt", "203.0.113.42")).toMatch(/^[0-9a-f]{64}$/);
  });
});
