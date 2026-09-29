-- Migration 4 of 6: evaluations (Task 12's runner) and call_limits (the
-- daily-call cap, SYSTEM-DESIGN.md §9).

create table evaluations (
  id uuid primary key default gen_random_uuid(),
  -- Groups every scenario from one `pnpm eval` invocation together (e.g. for the Haiku-vs-Sonnet comparison, SYSTEM-DESIGN.md §8, §12).
  run_id text not null,
  scenario text not null,
  input jsonb not null,
  expected_behavior text not null,
  actual_behavior text,
  passed boolean,
  -- Per-assertion results, e.g. [{ "check": "search_knowledge called", "passed": true }, ...].
  checks jsonb not null default '[]'::jsonb,
  notes text,
  model text not null,
  ttft_ms int,
  cost_usd numeric(10, 4),
  conversation_id uuid references conversations (id) on delete set null,
  created_at timestamptz not null default now()
);

create index evaluations_run_id_idx on evaluations (run_id);

create table call_limits (
  caller_ref text not null,
  day date not null,
  calls_started int not null default 0,
  primary key (caller_ref, day)
);

comment on table evaluations is 'One row per scenario per pnpm eval run - the testing-evidence table and the model comparison come from here (SYSTEM-DESIGN.md §8).';
comment on table call_limits is 'Per-visitor daily call count, for the 3-calls-a-day limit (SYSTEM-DESIGN.md §9). caller_ref is the same hashed visitor id as conversations.caller_ref.';
