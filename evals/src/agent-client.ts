// Talks to the real, already-running agent-server over HTTP - the runner
// spends real Claude money exactly the way a real caller would, through
// POST /api/text (SYSTEM-DESIGN.md §8: "through the same agent over the
// text channel"). No per-request model override exists on that endpoint
// (deliberately - see app.ts's own comment), so which model actually runs
// is whatever agent-server was started with; checkHealth reads it back
// so the runner can confirm before spending money on a labelled run.

export interface HealthInfo {
  ok: boolean;
  model: string;
}

export async function checkHealth(agentServerUrl: string): Promise<HealthInfo> {
  const res = await fetch(`${agentServerUrl}/health`);
  if (!res.ok) throw new Error(`agent-server /health returned ${res.status} - is it running? (pnpm --filter agent-server dev)`);
  return (await res.json()) as HealthInfo;
}

/** Sends one turn to /api/text and consumes the whole SSE stream, returning the full reply text. */
export async function sendTurn(agentServerUrl: string, conversationId: string, token: string, message: string): Promise<string> {
  const res = await fetch(`${agentServerUrl}/api/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation_id: conversationId, token, message }),
  });
  if (!res.ok || !res.body) throw new Error(`POST /api/text failed: ${res.status}`);

  let reply = "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice("data: ".length);
      if (payload === "[DONE]") continue;
      const { text } = JSON.parse(payload) as { text: string };
      reply += text;
    }
  }
  return reply;
}

/** Closes the conversation's session (POST /api/text/end) - without this, sessions pile up past SessionManager's 3-concurrent cap and every scenario after the third fails. */
export async function endConversation(agentServerUrl: string, conversationId: string, token: string): Promise<void> {
  await fetch(`${agentServerUrl}/api/text/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: conversationId, token }) });
}
