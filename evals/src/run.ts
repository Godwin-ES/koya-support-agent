// The evaluation runner (SYSTEM-DESIGN.md §8, IMPLEMENTATION-PLAN.md Task 12):
// runs the 9 PRD scenarios plus 7 variants through the real agent over the
// text channel (the already-running agent-server + mcp-server), checks the
// recorded behaviour against assertions, writes `evaluations` rows, and
// prints the testing-evidence markdown table.
//
// Spends real money (Claude) - never run automatically, never part of
// `pnpm test`. Requires agent-server and mcp-server already running:
//   pnpm --filter mcp-server dev
//   pnpm --filter agent-server dev
//   pnpm eval -- --run-id haiku-2026-09-29
import { config as loadEnv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { issueConversationToken } from "@core/agent";
import { evaluationRunMessage, sendDiscordActivity } from "@core/notify/discord";
import { checkHealth, endConversation, sendTurn } from "./agent-client";
import { loadCheckContext, type CheckResult } from "./checks";
import { ALL_SCENARIOS, type EvalScenario } from "./scenarios";
import { toMarkdownTable, type ScenarioOutcome } from "./report";

const appDir = path.resolve(import.meta.dirname, "../..");
loadEnv({ path: path.join(appDir, ".env.local"), quiet: true });

const AGENT_SERVER_URL = process.env.AGENT_SERVER_EVAL_URL ?? "http://127.0.0.1:8091";
const CONVERSATION_TOKEN_SECRET = process.env.CONVERSATION_TOKEN_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function arg(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function runScenario(supabase: SupabaseClient, runId: string, model: string, scenario: EvalScenario): Promise<ScenarioOutcome> {
  // Bound to the scenario's signed-in customer the way agent-server binds a real one from the account.
  const { data: conversation, error } = await supabase.from("conversations").insert({ channel: "web_text", model, verified_customer_id: scenario.customerId ?? null }).select("id").single();
  if (error) throw error;
  const conversationId = conversation.id as string;
  const token = issueConversationToken(CONVERSATION_TOKEN_SECRET!, conversationId);

  let lastReply = "";
  for (const message of scenario.turns) {
    lastReply = await sendTurn(AGENT_SERVER_URL, conversationId, token, message);
  }
  // Frees the session slot immediately, so scenario N+1 doesn't queue up
  // behind SessionManager's 3-concurrent cap (a real bug this fixed - see
  // BUILD-NOTES.md Task 12).
  await endConversation(AGENT_SERVER_URL, conversationId, token);

  const ctx = await loadCheckContext(supabase, conversationId);
  const checks: CheckResult[] = scenario.checks.map((check) => check(ctx));
  const passed = checks.every((c) => c.passed);

  const ttftValues = ctx.turns.map((t) => t.ttft_ms).filter((v): v is number => v !== null);
  const meanTtft = ttftValues.length > 0 ? Math.round(ttftValues.reduce((a, b) => a + b, 0) / ttftValues.length) : null;
  const totalCost = ctx.turns.reduce((sum, t) => sum + (t.cost_usd ?? 0), 0);

  await supabase.from("evaluations").insert({
    run_id: runId,
    scenario: scenario.key,
    input: scenario.turns,
    expected_behavior: scenario.expectedBehavior,
    actual_behavior: lastReply,
    passed,
    checks,
    model,
    ttft_ms: meanTtft,
    cost_usd: totalCost,
    conversation_id: conversationId,
  });

  return { scenario: scenario.key, expectedBehavior: scenario.expectedBehavior, actualBehavior: lastReply, passed, checks, notes: null, model, ttftMs: meanTtft, costUsd: totalCost, conversationId };
}

async function main() {
  for (const [name, value] of Object.entries({ CONVERSATION_TOKEN_SECRET, SUPABASE_URL, SERVICE_ROLE_KEY })) {
    if (!value) throw new Error(`${name} is not set (see .env.example).`);
  }

  const health = await checkHealth(AGENT_SERVER_URL);
  const model = arg("model") ?? health.model;
  if (model !== health.model) {
    throw new Error(`Requested model "${model}" but agent-server is running "${health.model}" - restart it with ANTHROPIC_MODEL=${model} first.`);
  }

  const runId = arg("run-id") ?? `${model}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;

  const supabase: SupabaseClient = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  // --only <key>[,<key>...] re-checks specific scenarios without paying for the full set.
  const only = arg("only")?.split(",");
  const scenarios = only ? ALL_SCENARIOS.filter((s) => only.includes(s.key)) : ALL_SCENARIOS;
  if (only && scenarios.length === 0) throw new Error(`No scenario matches --only ${only.join(",")}`);
  console.log(`Running ${scenarios.length} scenarios against agent-server's "${model}" (run_id: ${runId})...`);

  const outcomes: ScenarioOutcome[] = [];
  for (const scenario of scenarios) {
    process.stdout.write(`  ${scenario.key}... `);
    try {
      const outcome = await runScenario(supabase, runId, model, scenario);
      console.log(outcome.passed ? "PASS" : "FAIL");
      outcomes.push(outcome);
    } catch (err) {
      console.log("ERROR");
      outcomes.push({ scenario: scenario.key, expectedBehavior: scenario.expectedBehavior, actualBehavior: "", passed: false, checks: [], notes: err instanceof Error ? err.message : String(err), model, ttftMs: null, costUsd: 0, conversationId: "" });
    }
  }

  const passCount = outcomes.filter((o) => o.passed).length;
  const totalCost = outcomes.reduce((sum, o) => sum + o.costUsd, 0);
  console.log(`\n${passCount}/${outcomes.length} passed. Total spend: $${totalCost.toFixed(4)}.\n`);

  const table = toMarkdownTable(outcomes);
  console.log(table);

  const resultsDir = path.join(import.meta.dirname, "../results");
  mkdirSync(resultsDir, { recursive: true });
  const outPath = path.join(resultsDir, `${runId}.md`);
  writeFileSync(outPath, `# Evaluation run: ${runId}\n\nModel: ${model} · ${passCount}/${outcomes.length} passed · $${totalCost.toFixed(4)}\n\n${table}\n`);
  console.log(`\nWritten to ${outPath}`);

  // One #activity message for the whole run - agent-server skips its
  // per-conversation message for evaluation conversations (no account).
  await sendDiscordActivity(evaluationRunMessage({ runId, model, passed: passCount, total: outcomes.length, costUsd: totalCost }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
