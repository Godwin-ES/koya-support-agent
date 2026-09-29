import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const LOG_DIR = path.resolve(process.cwd(), ".spike-results");
mkdirSync(LOG_DIR, { recursive: true });

export interface TurnMeasurement {
  at: string;
  model: string;
  effort: string;
  conversationId: string;
  turnIndex: number;
  /** ms from the HTTP request landing to this server writing its first SSE byte - includes our own code's overhead. */
  serverFirstByteMs: number;
  /** the SDK's own reported time-to-first-token for this turn (SDKResultSuccess.ttft_ms), when present. */
  sdkTtftMs: number | null;
  /** ms from the request landing to the Agent SDK session's "init" system message, only set on a conversation's first turn. */
  sessionStartMs: number | null;
  /** ms from the request landing to the first tool_use block starting, when a tool was called this turn. */
  toolStartMs: number | null;
  usedHoldingPhrase: boolean;
  totalMs: number;
  costUsd: number;
  isError: boolean;
}

/** Appends one JSON line per turn to .spike-results/<model>.jsonl, for Task 2's go/no-go measurement (IMPLEMENTATION-PLAN.md). */
export function logTurnMeasurement(m: TurnMeasurement): void {
  const file = path.join(LOG_DIR, `${m.model}.jsonl`);
  appendFileSync(file, `${JSON.stringify(m)}\n`);
  console.log(
    `[spike] ${m.model} (${m.effort}) turn ${m.turnIndex} | first byte ${m.serverFirstByteMs}ms | sdk ttft ${m.sdkTtftMs ?? "-"}ms | session start ${m.sessionStartMs ?? "-"}ms | tool start ${m.toolStartMs ?? "-"}ms | holding phrase ${m.usedHoldingPhrase} | total ${m.totalMs}ms | $${m.costUsd.toFixed(4)}`,
  );
}
