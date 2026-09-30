# RelayPay Voice Support Agent

Week 6 capstone: a production-style customer support agent for RelayPay, built with Vapi for voice, the Claude Agent SDK for agent logic, a custom MCP server for support tools, and Supabase for application data, retrieval and audit logs.

**Live app:** https://koya-support-agent.vercel.app

The official Week 6 brief and supplied assets are in [`quadri40/aat-c3-week-6-support-agent`](https://github.com/quadri40/aat-c3-week-6-support-agent). A concise explanation of this implementation and how to try it is in [`docs/ONE-PAGE.md`](docs/ONE-PAGE.md).

## Architecture

```text
Browser
  ├─ voice ──> Vapi ──> agent-server ──> Claude Agent SDK
  └─ text ────────────────────────────> Claude Agent SDK
                                         │
                                         ▼
                                      MCP server
                                         │
                                         ▼
                                      Supabase
```

The MCP server exposes eight current tools: the seven PRD-required tools plus `list_account_activity`, which was added after testing showed that an authenticated customer asking what is happening on their account should not need to know a specific transaction or payout reference first.

Account identity comes from the signed-in account, not from names, companies, emails or IDs spoken during a conversation. Account-specific tools can only return records belonging to the customer bound to that conversation.

## Repository layout

```text
packages/core/        shared agent, retrieval, MCP business logic and safety rules
mcp-server/           MCP HTTP and stdio transports, plus grader setup instructions
agent-server/         Vapi custom-LLM endpoint, Agent SDK sessions and text endpoint
web/                  Next.js customer app and staff support console
evals/                deterministic evaluation runner and saved run reports
scripts/              seed, ingest, access, Vapi and deployment utilities
supabase/migrations/  database schema, RLS, retrieval and runtime migrations
docs/                 submission-facing system documentation
```

## Local setup

Requires Node.js 22+ and pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm seed
pnpm ingest
```

Fill the required values in `.env.local`; never commit real secrets.

Start the services separately:

```bash
pnpm dev:mcp-server
pnpm dev:agent-server
pnpm dev:web
```

For MCP-only grading or inspection, see [`mcp-server/README.md`](mcp-server/README.md).

## Access

The deployed customer experience includes sample customer accounts for straightforward review of account-bound behavior. Each sample customer can see only their own RelayPay records.

Staff access remains invite-controlled. Staff accounts use Supabase Auth and can access the support console. The invite utility is:

```bash
node scripts/invite-user.mjs --email reviewer@example.com --name "Ada Mensah" --link
node scripts/invite-user.mjs --email staff@example.com --name "Theo Mann" --staff --link
```

`--link` prints a one-use invite link. Without it, Supabase sends the invitation email when email delivery is configured.

## Limits and notifications

- **Calls:** 5 per day per account, up to 5 minutes each, with a 30-second silence end condition and at most 3 concurrent calls.
- **Chat:** separate from call limits, with a 1,000-character message limit, 30 messages per conversation, 90 messages per day and its own session pool.
- **Discord alerts:** escalations, urgent tickets, failures, outages, capacity events and spend alerts go to the alerts channel.
- **Discord activity:** finished conversations, usage-limit events, evaluation runs and the daily digest go to the activity channel.
- Discord notifications exclude transcripts, names and email addresses.

## Testing and evaluation

```bash
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:replay
pnpm test:retrieval
pnpm test:e2e
pnpm check
```

The regular automated suites use stubs or replayed data where appropriate and are designed not to trigger unnecessary paid Claude or Vapi usage.

Real agent evaluation is explicit:

```bash
pnpm eval
pnpm eval -- --only <scenario>
```

Saved evaluation reports are in [`evals/results/`](evals/results/). The account-bound Sonnet 5 evaluation records 15/15 scenarios passing, including cross-account access, prompt injection, unsupported questions and reference-recovery variants. A later targeted account-activity run records 2/2 passing after the additional account-overview capability was added.

## Key implementation notes

- Vapi handles speech-to-text, text-to-speech and turn-taking. The Agent SDK remains the support agent itself through Vapi's custom-LLM endpoint.
- General product and policy answers are grounded through `search_knowledge` rather than model memory.
- Retrieval uses Supabase pgvector plus full-text search with local `gte-small` embeddings.
- Tickets and escalations are idempotent and logged in Supabase.
- Conversation turns, retrieved knowledge, tool calls, tickets, escalations, costs and evaluation records are persisted for review.
- The support console shows conversations, sources, tool calls, cases and evaluation runs.
- The agent records each turn as one of four paths: `answer`, `clarify`, `escalate` or `decline`.
