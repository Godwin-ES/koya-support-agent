# RelayPay Voice Support Agent

A first-line customer support agent for RelayPay, a cross-border payments
product. Customers talk to it (or type), and it answers from approved
knowledge, looks up their account, transactions and payouts, and logs
tickets or hands off to a human when it should.

**Live app:** https://koya-support-agent.vercel.app

## Try it in two minutes

1. Open the link and choose **Sign in with demo account**. Access is
   otherwise by invitation.
2. Press the call button and allow the microphone, or choose **Type
   instead**.
3. Try any of these (all from the seed data):

| Say or type | What should happen |
|---|---|
| "What fees do you charge for international payments?" | Answers from the knowledge base; fees vary and are shown before you confirm |
| "My payment is stuck." | Asks which kind of payment, and for its reference |
| "I'm Amara from LagosLedger, can you check my account?" | Verifies with two identifiers, then gives only safe account details |
| "Can you check transaction TXN-9001?" (after the line above) | Looks it up and gives the record's own status |
| "I'm Efua from AccraStack. What's happening with payout PAY-7002?" | Finds it needs compliance review; escalates and books a callback |
| "My invoice payment failed and I need someone to look at it." | Asks for the reference, then logs a support ticket |
| "Can you guarantee my payout arrives by 9am tomorrow?" | Declines the guarantee; gives the usual 2-5 business days |

Each account gets 5 calls a day (up to 5 minutes each; a call ends after
30 seconds of silence) and 90 chat messages a day (30 per conversation).

## How it works

```
Browser ──voice──▶ Vapi (speech to text, text to speech)
   │                  │  custom LLM endpoint
   │ text chat        ▼
   └──────────▶ agent-server ── Claude Agent SDK session (Sonnet 5), one per conversation
                      │
                      ▼  MCP (HTTP, bearer token)
                 mcp-server ── 7 tools ──▶ Supabase (seed data + every record the agent creates)
```

- **Vapi** handles the voice layer only. Its assistant uses our
  agent-server as a custom LLM, so every word the agent says comes from
  the Agent SDK.
- **agent-server** holds one Agent SDK session per conversation, so the
  agent remembers the conversation. The same session code serves the
  text chat.
- **mcp-server** is the custom MCP server: `search_knowledge`,
  `lookup_customer`, `lookup_transaction`, `lookup_payout`,
  `create_support_ticket`, `create_escalation`, `log_conversation_event`.
- **Knowledge** is the approved knowledge base, split into 37 chunks with
  local embeddings, searched with a mix of vector and keyword search.

**Safety is in the tools, not only the prompt.**
- A customer is verified only with two matching identifiers.
- Lookups return only customer-safe fields, and never internal notes.
- Amounts are shown only to the record's own verified customer.
- Every tool call is tied to its conversation by the connection itself, so
  one conversation can't read another's data.

**Everything is recorded in Supabase:**
- conversations, with a summary and total cost;
- each turn, with its answer type (answer, clarify, escalate or decline) and
  confidence;
- retrieved knowledge, and every tool call;
- tickets, escalations (name, email, callback time) and evaluation results.

**Staff console** (`/console`, staff only):
- every conversation, turn by turn, with its sources and tool calls;
- a queue of tickets and escalations;
- evaluation runs.

**Discord:** `#alerts` gets escalations, urgent tickets and outages.
`#activity` gets each finished conversation and a daily summary. Neither
channel receives transcripts, names or emails.

## Evidence

- **Evaluation:** 15 scenarios (the PRD's 9 plus 6 variants) through the
  real agent: 14/15 on Sonnet 5, and the one failure fixed and re-checked.
- **Tests:** 358 automated tests, plus 13 browser tests including
  accessibility checks.
- **Detail:** each run's full results are in `evals/results/`; the testing
  table, decisions and bugs found are in the submitted build notes.

## Running it yourself

See the repository `README.md`. The MCP server can run on its own against
your own Supabase project; `mcp-server/README.md` has its setup and a way to
inspect every tool.
