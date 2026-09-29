// Shared code for the RelayPay voice support agent: domain types and rules,
// Supabase access, the MCP tool contracts, retrieval, and safety - used by
// mcp-server, agent-server, evals, scripts and web (see SYSTEM-DESIGN.md §13).
export const CORE_PACKAGE_READY = true;

export * from "./knowledge/chunker";
export * from "./knowledge/embeddings";
export * from "./knowledge/summarize";
export * from "./mcp";
export * from "./notify/discord";
export * from "./agent";
export * from "./domain/failure";
export * from "./domain/write-buffer";
export * from "./domain/status";
export * from "./domain/action-state";
export * from "./domain/call-actions";
export * from "./domain/text-actions";
export * from "./domain/case-actions";
export * from "./domain/evaluation-actions";
