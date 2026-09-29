import { describe, expect, it } from "vitest";
import { normalizeReference } from "@core/mcp/reference";

describe("normalizeReference", () => {
  it("normalises the design doc's own example", () => {
    expect(normalizeReference("TXN", "TXN nine zero zero one")).toBe("TXN-9001");
  });

  it("accepts a typed reference already in canonical form", () => {
    expect(normalizeReference("TXN", "TXN-9001")).toBe("TXN-9001");
    expect(normalizeReference("TXN", "txn-9001")).toBe("TXN-9001");
  });

  it("accepts bare digits, using the caller's default prefix", () => {
    expect(normalizeReference("TXN", "9001")).toBe("TXN-9001");
    expect(normalizeReference("PAY", "7001")).toBe("PAY-7001");
  });

  it("picks up a spoken prefix that overrides the default", () => {
    expect(normalizeReference("TXN", "payout seven zero zero one")).toBe("PAY-7001");
  });

  it("handles a mixed spoken/typed reference", () => {
    expect(normalizeReference("TXN", "transaction 9001")).toBe("TXN-9001");
  });
});
