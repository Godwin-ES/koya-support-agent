# RelayPay support MCP server

The MCP server required by the Week 6 PRD (`mcp-tool-requirements.md`): the
seven tools that connect the support agent to the RelayPay seed data and
support tables in Supabase (`SYSTEM-DESIGN.md` §5).

## Running it

Needs `.env.local` at the repo root (`week-6/app/.env.local`) with
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and the seed data
loaded (`pnpm seed` from the repo root).

**As an HTTP server** (what `agent-server` talks to):

```bash
pnpm --filter mcp-server dev
```

Streamable HTTP on `http://127.0.0.1:8090/mcp` (port from `MCP_PORT`, default
8090), stateless - a fresh MCP server and connection per request. Every
request needs `Authorization: Bearer $MCP_SERVER_TOKEN` and
`X-Conversation-Id: <a conversation id>` - the tools scope every read and
write to that conversation, and refuse a `conversation_id` input that doesn't
match it. Insert a row into `conversations` to test against (any row - a
`channel` of `web_text`/`web_voice`/`phone` is all it needs).

**Over stdio** (for a grader, or the MCP Inspector, with no HTTP server or
token needed):

```bash
pnpm --filter mcp-server dev:stdio
```

A stdio connection is one long-lived session with no per-request headers, so
the conversation is fixed for the whole process: set
`MCP_STDIO_CONVERSATION_ID` to an existing `conversations.id` to reuse one,
or leave it unset and a fresh conversation is created on startup - its id is
printed to stderr (stdout is the protocol channel), so its logged rows
(`tool_calls`, `retrieval_logs`, tickets, escalations) can be found
afterwards.

`turn_seq` on every logged row is derived, not passed in: the MCP connection
only carries `X-Conversation-Id`, not a per-turn header, so it's computed as
(the number of `conversation_turns` already recorded for this conversation) +
1 - "the turn in progress" (`@core/mcp/context`'s `currentTurnSeq`).

## Inspecting the tools

```bash
npx @modelcontextprotocol/inspector pnpm --filter mcp-server dev:stdio
```

Opens a local UI to call each tool by hand against the real seed data. Try:
- `lookup_customer` with `{ "company_name": "LagosLedger", "contact_name": "Amara Okafor" }`
- `lookup_customer` with only `{ "email": "amara@lagosledger.example" }` - returns `not_enough_to_verify`
- `lookup_transaction` with `{ "transaction_id": "TXN-9001" }`
- `create_support_ticket` with a `category`, `priority` and `summary`

## Tools

| Tool | Purpose |
| --- | --- |
| `search_knowledge` | Retrieve approved RelayPay knowledge |
| `lookup_customer` | Verify and look up a customer (needs two matching identifiers) |
| `lookup_transaction` | Look up a transaction, customer-safe by default |
| `lookup_payout` | Look up a payout, customer-safe by default |
| `create_support_ticket` | Log a support issue (idempotent per conversation + category) |
| `create_escalation` | Hand off to human support (idempotent per conversation) |
| `log_conversation_event` | Log an agent decision or notable action |

Full behaviour and the safety rules each tool enforces: `SYSTEM-DESIGN.md` §5.
