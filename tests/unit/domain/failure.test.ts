import { describe, expect, it } from "vitest";
import { classifyMcpFailure, classifySdkError, classifySupabaseFailure } from "@core/domain/failure";

describe("classifySdkError", () => {
  it("classifies an account-level SDK error", () => {
    for (const error of ["authentication_failed", "billing_error", "account_on_hold"]) {
      const failure = classifySdkError(error);
      expect(failure.kind).toBe("account");
      expect(failure.provider).toBe("anthropic");
    }
  });

  it("classifies a temporary SDK error", () => {
    for (const error of ["rate_limit", "overloaded", "server_error"]) {
      expect(classifySdkError(error).kind).toBe("temporary");
    }
  });

  it("classifies an unrecognised error as a bug", () => {
    expect(classifySdkError("something_unexpected").kind).toBe("bug");
  });

  it("keeps the detail in the message without leaking it into the kind/provider", () => {
    const failure = classifySdkError("rate_limit", "Retry-After: 30s");
    expect(failure.message).toContain("Retry-After: 30s");
  });
});

describe("classifyMcpFailure", () => {
  it("is always temporary - our own localhost service has no account/billing concept", () => {
    expect(classifyMcpFailure("ECONNREFUSED").kind).toBe("temporary");
    expect(classifyMcpFailure("ECONNREFUSED").provider).toBe("mcp");
  });
});

describe("classifySupabaseFailure", () => {
  it("defaults to temporary", () => {
    expect(classifySupabaseFailure("network error").kind).toBe("temporary");
  });

  it("is account when it's an auth error", () => {
    const failure = classifySupabaseFailure("invalid API key", true);
    expect(failure.kind).toBe("account");
    expect(failure.provider).toBe("supabase");
  });
});
