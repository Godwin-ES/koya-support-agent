// Fills `summary` and `cost_usd` on conversations that ended before
// finalizeConversation existed (agent-server/src/lifecycle.ts). No
// notifications; safe to re-run.
//
//   npx tsx scripts/backfill-conversation-summaries.ts            # only missing summaries, built
//   npx tsx scripts/backfill-conversation-summaries.ts --natural  # rewrite real accounts' summaries with Haiku (~$0.001 each)
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { buildConversationSummary, endedLabel } from "../packages/core/src/agent/conversation-summary";
import { writeConversationSummary } from "../packages/core/src/agent/summarize-conversation";
import type { AnswerType } from "../packages/core/src/agent/decision";

if (existsSync(".env.local")) config({ path: ".env.local", quiet: true });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const natural = process.argv.includes("--natural");
const anthropic = natural ? new Anthropic() : null;
let query = supabase.from("conversations").select("id, channel, caller_ref, ended_reason, verified_customer_id").not("ended_at", "is", null);
query = natural ? query.not("caller_ref", "is", null) : query.is("summary", null);
const { data: conversations, error } = await query;
if (error) throw error;

let filled = 0;
for (const c of conversations ?? []) {
  const [turns, ticket, escalation, customer] = await Promise.all([
    supabase.from("conversation_turns").select("user_transcript, assistant_response, answer_type, cost_usd").eq("conversation_id", c.id).order("seq"),
    supabase.from("support_tickets").select("category, priority").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("escalations").select("category, call_booked").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    c.verified_customer_id ? supabase.from("customers").select("company_name, contact_name").eq("customer_id", c.verified_customer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rows = (turns.data ?? []) as Array<{ user_transcript: string; assistant_response: string; answer_type: AnswerType; cost_usd: number | null }>;
  const esc = escalation.data as { category: string; call_booked: boolean } | null;
  const company = customer.data as { company_name: string; contact_name: string } | null;
  let summary = buildConversationSummary({
    channel: c.channel,
    turns: rows,
    ticket: ticket.data as { category: string; priority: string } | null,
    escalation: esc ? { category: esc.category, callbackBooked: esc.call_booked } : null,
    customerCompany: company?.company_name ?? null,
    endedLabel: endedLabel(c.ended_reason),
  });
  if (anthropic && rows.length > 0) {
    summary = await writeConversationSummary(anthropic, {
      channel: c.channel,
      customer: company ? { name: company.contact_name, company: company.company_name } : null,
      turns: rows,
      escalation: esc ? { category: esc.category, callbackBooked: esc.call_booked } : null,
      ticket: esc ? null : (ticket.data as { category: string; priority: string } | null),
      endedLabel: endedLabel(c.ended_reason),
    });
  }
  const cost = rows.reduce((sum, t) => sum + Number(t.cost_usd ?? 0), 0);
  const { error: updateError } = await supabase.from("conversations").update({ summary, cost_usd: Number(cost.toFixed(4)) }).eq("id", c.id);
  if (updateError) throw updateError;
  filled++;
}
console.log(`Filled the summary and total cost on ${filled} conversation(s).`);
