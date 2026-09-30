# RelayPay support MCP server

The MCP server for the Week 6 support agent. It implements the seven tools required by the PRD plus `list_account_activity`, an additional account-bound tool for customers who ask what is happening on their account without knowing a specific reference.

All tools connect the support agent to the RelayPay seed data and support tables in Supabase. Account access is bound to the signed-in customer by `agent-server`; spoken names, companies, emails or IDs never establish identity.

## Running it

Create `.env.local` at the repository root with `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and the other required values shown in
`.env.example`. Load the seed data first with `pnpm seed` from the repo root.

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

For account-specific tools, the conversation must also be bound to a customer through `conversations.verified_customer_id`, which is normally set by `agent-server` from the authenticated user's server-controlled account metadata. A conversation with no customer binding can still use general knowledge but account tools return `no_customer_account`.

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

Opens a local UI to call each tool by hand against the configured Supabase project. For account-specific tools, use a conversation already bound to a sample customer through `MCP_STDIO_CONVERSATION_ID`.

Useful checks:
- `lookup_customer` with `{}` returns the signed-in customer's own safe account record when the conversation is customer-bound.
- `lookup_customer` with an identifier belonging to another customer returns `not_this_account`; identifiers only cross-check the already-bound account and never change identity.
- `lookup_transaction` with `{ "transaction_id": "TXN-9001" }` returns it only when it belongs to the signed-in customer.
- `list_account_activity` with `{}` lists only the signed-in customer's recent transactions and payouts.
- `create_support_ticket` with a `category`, `priority` and `summary` creates an idempotent support record for the current conversation.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_knowledge` | Retrieve approved RelayPay knowledge |
| `lookup_customer` | Look up the signed-in customer's own safe account record; optional identifiers can only verify that same bound account |
| `lookup_transaction` | Look up one of the signed-in customer's own transactions |
| `lookup_payout` | Look up one of the signed-in customer's own payouts |
| `list_account_activity` | List the signed-in customer's recent transactions and payouts when they do not have a reference |
| `create_support_ticket` | Log a support issue, idempotent per conversation and category |
| `create_escalation` | Hand off to human support, idempotent per conversation |
| `log_conversation_event` | Log a notable conversation action or event |

The seven PRD-required tools remain intact. `list_account_activity` is an additional capability added after testing showed that an authenticated customer asking "what's on my account?" otherwise had to provide a transaction or payout reference before the agent could help.

The business logic and safety boundaries live in `packages/core/src/mcp/`, while this package provides the MCP transports and tool registrations.