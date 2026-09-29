// Failure sorting, by what fixes it (SYSTEM-DESIGN.md §10; the week-5
// pattern, `packages/core/src/domain/failure.ts` there):
// - temporary: a timeout, rate limit, overloaded or unreachable provider -
//   the caller-facing fallback is enough; nothing to fix on our side.
// - account: a bad key, no credits, a used-up quota - someone has to fix
//   the account. There's no "retry" for a live voice call the way week 5's
//   worker retries a queued run - the call still ends gracefully either way.
// - bug: anything else - our own code or a request the provider rejected.
export type FailureKind = "temporary" | "account" | "bug";
export type FailureProvider = "anthropic" | "mcp" | "supabase";

export class AgentFailure extends Error {
  constructor(
    public readonly kind: FailureKind,
    public readonly provider: FailureProvider,
    message: string,
  ) {
    super(message);
    this.name = "AgentFailure";
  }
}

const PROVIDER_LABEL: Record<FailureProvider, string> = { anthropic: "Claude", mcp: "the MCP server", supabase: "the database" };

export function providerLabel(provider: FailureProvider): string {
  return PROVIDER_LABEL[provider];
}

/** The error types the Agent SDK tags a failed Claude API call with (SDKAssistantMessageError) - same vocabulary week 5 confirmed against the SDK's own types. */
const SDK_ACCOUNT_ERRORS = new Set(["authentication_failed", "oauth_org_not_allowed", "account_on_hold", "verification_required", "billing_error", "cloud_credential_error"]);
const SDK_TEMPORARY_ERRORS = new Set(["rate_limit", "overloaded", "server_error"]);

export function classifySdkError(error: string, detail = ""): AgentFailure {
  const suffix = detail ? ` ${detail}` : "";
  if (SDK_ACCOUNT_ERRORS.has(error)) {
    const what = error === "billing_error" ? "is out of credits or has a billing problem" : "rejected the API key or account";
    return new AgentFailure("account", "anthropic", `Claude ${what} (${error}).${suffix}`);
  }
  if (SDK_TEMPORARY_ERRORS.has(error)) {
    return new AgentFailure("temporary", "anthropic", `Claude is ${error === "rate_limit" ? "rate-limiting requests" : error === "overloaded" ? "overloaded" : "having server errors"} (${error}).${suffix}`);
  }
  return new AgentFailure("bug", "anthropic", `Claude request failed (${error}).${suffix}`);
}

/** A network/timeout-shaped error reaching the MCP server (connection refused, timeout) - always "temporary": there's no account/billing concept for our own localhost service. */
export function classifyMcpFailure(detail: string): AgentFailure {
  return new AgentFailure("temporary", "mcp", `The MCP server is unreachable. ${detail}`.trim());
}

/** A Supabase read/write failure - almost always temporary (network, a momentary outage); PostgREST auth errors (misconfigured key) are the "account" case. */
export function classifySupabaseFailure(detail: string, isAuthError = false): AgentFailure {
  if (isAuthError) return new AgentFailure("account", "supabase", `Supabase rejected the request - check the service role key. ${detail}`.trim());
  return new AgentFailure("temporary", "supabase", `Supabase is unreachable or erroring. ${detail}`.trim());
}

/** What the caller hears when Claude itself fails mid-call (SYSTEM-DESIGN.md §10) - short, calm, says what happens next. */
export const CLAUDE_DOWN_FALLBACK = "I'm having trouble on my side right now. I've logged this so the team can follow up.";

/** What the caller hears when the MCP server can't be reached - no tools at all means no knowledge lookup either, so this is honest about the limit rather than pretending to still help. */
export const MCP_DOWN_FALLBACK = "I can't check anything on our systems right now, including general information. I've logged this so the team can follow up - please try again shortly.";
