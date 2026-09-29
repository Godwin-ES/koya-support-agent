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

How the system works and how to try it: [`docs/ONE-PAGE.md`](docs/ONE-PAGE.md).

## Giving someone access

The app is invite-only. There's no sign-up, and an account needs an
`invited` flag that only the admin API can set:

```bash
node scripts/invite-user.mjs --email reviewer@example.com --name "Ada Mensah" --link
node scripts/invite-user.mjs --email staff@example.com --name "Theo Mann" --staff --link
```

`--link` prints a one-use invite link to send yourself (Supabase's built-in
email only reaches your own team's addresses unless custom SMTP is set up);
leave it off to have Supabase email the invite. An existing account is just
granted access.

## Limits and notifications

- **Calls:** 5 a day per account, 5 minutes each, ended after 30 seconds of
  silence, at most 3 at once.
- **Chat**, counted separately: 1,000 characters a message, 30 messages a
  conversation, 90 a day, one reply at a time, its own 4 sessions.
- **Discord:** `DISCORD_ALERTS_WEBHOOK_URL` (escalations, urgent tickets,
  failures, outages, busy, daily spend over `DAILY_SPEND_ALERT_USD`) and
  `DISCORD_ACTIVITY_WEBHOOK_URL` (finished conversations, limits reached, a
  daily digest, evaluation runs). No transcripts, names or emails in either.
  `node scripts/set-alert-secrets.mjs` stores the alerts webhook for the
  database watchdog.

## Tests

See `../TESTING-GUIDE.md`. Short version: `pnpm test` runs everything that
costs $0 (replay mode by default). `pnpm eval` and the voice checklist spend
real money and run only on purpose (`pnpm eval -- --only <scenario>` re-checks
one scenario).
