// Drives Task 2's latency measurement (IMPLEMENTATION-PLAN.md) against a
// running `pnpm --filter agent-server dev` instance: for each model, a few
// cold-start conversations (one Q&A turn each - measures session start +
// first turn), a couple of warm follow-up turns in one conversation, and a
// couple of turns that make the stub tool fire (measures the holding phrase
// and tool overhead). Spends real Claude tokens - run only when approved.
//
//   npx tsx src/spike/measure.ts
import { config } from "dotenv";
config({ path: "../.env.local", quiet: true });

const BASE_URL = process.env.SPIKE_BASE_URL ?? "http://127.0.0.1:8091";
const SECRET = process.env.VAPI_SERVER_SECRET;
const MODELS = ["claude-haiku-4-5", "claude-sonnet-5"];

interface Row {
  model: string;
  kind: "cold" | "warm" | "tool";
  conversationId: string;
  clientTotalMs: number;
  clientFirstByteMs: number;
}

async function postTurn(conversationId: string, model: string, text: string): Promise<{ clientTotalMs: number; clientFirstByteMs: number; reply: string }> {
  const startedAt = performance.now();
  const res = await fetch(`${BASE_URL}/vapi/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(SECRET ? { "X-Vapi-Server-Secret": SECRET } : {}) },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: text }],
      metadata: { conversation_id: conversationId },
      stream: true,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`turn failed: HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let clientFirstByteMs: number | null = null;
  let reply = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (clientFirstByteMs === null) clientFirstByteMs = performance.now() - startedAt;
    for (const line of decoder.decode(value).split("\n")) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        reply += chunk.choices?.[0]?.delta?.content ?? "";
      } catch {
        // ignore partial/malformed lines from a chunked read boundary
      }
    }
  }
  return { clientTotalMs: performance.now() - startedAt, clientFirstByteMs: clientFirstByteMs ?? -1, reply };
}

async function main() {
  const rows: Row[] = [];
  for (const model of MODELS) {
    console.log(`\n=== ${model} ===`);

    // Two cold-start conversations: one plain question, one that should trigger the stub tool.
    for (const [kind, text] of [
      ["cold", "Hi, what fees does RelayPay charge for international payments?"],
      ["tool", "Can you check transaction TXN-9001 for me?"],
    ] as const) {
      const conversationId = `spike-${model}-${kind}-${Date.now()}`;
      const r = await postTurn(conversationId, model, text);
      console.log(`  [${kind}] "${text.slice(0, 40)}..." -> ${r.reply.slice(0, 80)}`);
      rows.push({ model, kind, conversationId, clientTotalMs: Math.round(r.clientTotalMs), clientFirstByteMs: Math.round(r.clientFirstByteMs) });
    }

    // One warm conversation with two follow-up turns, to see per-turn latency once the session is already running.
    const warmId = `spike-${model}-warm-${Date.now()}`;
    for (const text of ["My payment is stuck.", "It's an outgoing payout, reference TXN-9004."]) {
      const r = await postTurn(warmId, model, text);
      console.log(`  [warm] "${text}" -> ${r.reply.slice(0, 80)}`);
      rows.push({ model, kind: "warm", conversationId: warmId, clientTotalMs: Math.round(r.clientTotalMs), clientFirstByteMs: Math.round(r.clientFirstByteMs) });
    }
  }

  console.log("\n=== client-observed summary (server's own per-turn log has session start / SDK ttft / tool timing / cost) ===");
  console.table(rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
