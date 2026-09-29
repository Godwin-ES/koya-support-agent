# RelayPay Voice Support Agent

Week 6 capstone: a production-style voice customer support agent for
RelayPay, built with Vapi (voice), the Claude Agent SDK (agent logic), a
custom MCP server (support tools), and Supabase (data + logging).

- **What and why:** `../aat-c3-week-6-support-agent/PRD.md` and its assets.
- **How it's built:** `../SYSTEM-DESIGN.md`.
- **Build order:** `../IMPLEMENTATION-PLAN.md`.
- **Testing:** `../TESTING-GUIDE.md`.
- **Evidence, decisions, reflections:** `../BUILD-NOTES.md`.
- **Working rules for this repo:** `CLAUDE.md` (in `../`, applies here too).

## Layout

```
packages/core/     shared: schemas, Supabase access, retrieval, safety rules
mcp-server/         the required MCP server (own README - runnable by a grader)
agent-server/       Vapi's custom-LLM endpoint, the Agent SDK session, the text fallback
web/                Next.js: the voice page + the staff support console
evals/              the evaluation runner
scripts/            seed data, knowledge ingest, Vapi assistant config, deploy
supabase/migrations/
```

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in real values - never commit this file
pnpm db:migrate
pnpm seed
pnpm ingest
```

Then, per package: `pnpm dev:web`, `pnpm dev:agent-server`, `pnpm dev:mcp-server`.

## Tests

See `../TESTING-GUIDE.md`. Short version: `pnpm test` runs everything that
costs $0 (replay mode by default). `pnpm eval` and the voice checklist spend
real money and run only on purpose.
