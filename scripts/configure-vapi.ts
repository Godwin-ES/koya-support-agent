// Creates or updates a Vapi assistant pointing at our agent-server, from
// code rather than dashboard clicks (SYSTEM-DESIGN.md §12). Built in Task 2
// as a minimal spike for the latency test only; extended in Task 13 with
// the real production config (name, greeting, silence timeout, recording
// off - SYSTEM-DESIGN.md §9/§12). Same assistant is updated in place via
// the existing create-or-PATCH-by-id logic below, not recreated.
//
// Auth note, confirmed against Vapi's own OpenAPI spec (not assumed): a
// custom-llm model's `headers` "can override default OpenAI headers except
// for Authorization (which should be specified using a custom-llm
// credential)" - so our shared secret goes in a custom header
// (X-Vapi-Server-Secret), not Authorization; agent-server checks that same
// header, not a bearer token.
//
//   BASE_URL=https://<tunnel-or-app-url> npx tsx scripts/configure-vapi.ts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
const VAPI_SERVER_SECRET = process.env.VAPI_SERVER_SECRET;
const BASE_URL = process.env.BASE_URL;
const EXISTING_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

if (!VAPI_PRIVATE_KEY) throw new Error("VAPI_PRIVATE_KEY is not set");
if (!VAPI_SERVER_SECRET) throw new Error("VAPI_SERVER_SECRET is not set");
if (!BASE_URL) throw new Error("Set BASE_URL to the agent-server's public HTTPS address (a tunnel URL for this spike, the deployed address for real)");

const assistant = {
  name: "RelayPay Support",
  firstMessage: "Thanks for calling RelayPay support. How can I help you today?",
  model: {
    provider: "custom-llm" as const,
    url: `${BASE_URL}/vapi`, // Vapi appends /chat/completions itself (OpenAI-client convention) - confirmed working end-to-end in Task 2's real latency spike
    model: "claude-sonnet-5",
    metadataSendMode: "variable" as const,
    headers: { "X-Vapi-Server-Secret": VAPI_SERVER_SECRET },
  },
  // Task 7's /vapi/events - confirmed against docs.vapi.ai/api-reference/assistants/create
  // that webhook delivery is a separate `server` object from `model.url`
  // (the custom-llm chat.completions proxy), narrowed to the three types
  // /vapi/events actually handles (its default set is much larger).
  server: { url: `${BASE_URL}/vapi/events`, headers: { "X-Vapi-Server-Secret": VAPI_SERVER_SECRET } },
  serverMessages: ["end-of-call-report", "status-update", "hang"] as const,
  voice: { provider: "vapi" as const, voiceId: "Clara" },
  maxDurationSeconds: 300,
  // When to decide the caller has finished speaking (types checked against
  // the installed @vapi-ai/web StartSpeakingPlan). A live call showed the
  // default replying to half a sentence ("Showing the" got its own answer,
  // and the rest of the sentence became a second, overlapping turn).
  // LiveKit's smart endpointing - which the type docs "strongly recommend"
  // for English - judges from the words whether the thought is finished; a
  // longer minimum wait and slower transcription fallbacks back it up.
  startSpeakingPlan: {
    waitSeconds: 0.8,
    smartEndpointingPlan: { provider: "livekit" as const },
    transcriptionEndpointingPlan: { onPunctuationSeconds: 0.5, onNoPunctuationSeconds: 2.0, onNumberSeconds: 1.0 },
  },
  // Privacy note on the voice page promises this - transcripts only, never
  // a recording. Verified against Vapi's live OpenAPI spec (Task 13): this
  // is `artifactPlan.recordingEnabled`, not a top-level assistant field -
  // an earlier draft of this script had it wrong.
  artifactPlan: { recordingEnabled: false },
  // No silenceTimeoutSeconds here: verified against the same spec that no
  // such field exists on the assistant (it only exists on
  // TransferAssistant, an unrelated call-transfer-target schema). SYSTEM-
  // DESIGN.md §9/§12's "30s silence timeout" doesn't map to a direct Vapi
  // assistant field - flagged in BUILD-NOTES rather than faked here.
};

async function main() {
  const method = EXISTING_ID ? "PATCH" : "POST";
  const url = EXISTING_ID ? `https://api.vapi.ai/assistant/${EXISTING_ID}` : "https://api.vapi.ai/assistant";

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(assistant),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(`Vapi ${method} ${url} failed: HTTP ${res.status}`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log(`${EXISTING_ID ? "Updated" : "Created"} assistant: ${body.id}`);
  console.log(`model.url: ${assistant.model.url}`);
  if (!EXISTING_ID) console.log(`\nSet NEXT_PUBLIC_VAPI_ASSISTANT_ID=${body.id} in .env.local to use it from the web app.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
