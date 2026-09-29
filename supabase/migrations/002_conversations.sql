-- Migration 2 of 6: conversations, conversation_turns, conversation_events.
-- SYSTEM-DESIGN.md §3-4, §7; PRD "Supabase Records".
--
-- `ended_reason` and `final_status` are free text, not CHECK-constrained:
-- `ended_reason` echoes Vapi's own `endedReason` values verbatim (its
-- vocabulary, not ours - checking it against Vapi's docs is Task 7's job,
-- when the real /vapi/events handler is built), and `final_status` is
-- decided alongside it. `channel` and `answer_type` do have a settled
-- vocabulary already (SYSTEM-DESIGN.md §3, §11.1), so those are constrained.

create table conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('web_voice', 'web_text', 'phone')),
  vapi_call_id text unique,
  -- Hashed visitor id (VISITOR_HASH_SALT, SYSTEM-DESIGN.md §9) - never a raw IP.
  caller_ref text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text,
  final_status text,
  summary text,
  verified_customer_id text references customers (customer_id),
  model text,
  cost_usd numeric(10, 4) not null default 0
);

create index conversations_started_at_idx on conversations (started_at);
create index conversations_caller_ref_idx on conversations (caller_ref);
create index conversations_verified_customer_id_idx on conversations (verified_customer_id);

create table conversation_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  seq int not null,
  user_transcript text not null,
  assistant_response text not null,
  answer_type text not null check (answer_type in ('answer', 'clarify', 'escalate', 'decline')),
  -- Set only when the agent declared its own decision (log_conversation_event);
  -- otherwise the server inferred answer_type from what happened this turn
  -- (SYSTEM-DESIGN.md §4) and this stays false.
  answer_type_inferred boolean not null default false,
  confidence numeric(3, 2) check (confidence is null or (confidence between 0 and 1)),
  confidence_note text,
  interrupted boolean not null default false,
  ttft_ms int,
  total_ms int,
  created_at timestamptz not null default now(),
  unique (conversation_id, seq)
);

create index conversation_turns_conversation_id_idx on conversation_turns (conversation_id);

create table conversation_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  turn_seq int,
  -- Free text (the MCP tool's own event_type input, e.g. "decision") - not
  -- constrained to a fixed list; the tool logs whatever it's given.
  event_type text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index conversation_events_conversation_id_idx on conversation_events (conversation_id);

comment on table conversations is 'One row per call or text session (SYSTEM-DESIGN.md §3). service_role only - the console reads it through server-side routes (§11.6), never a direct browser query.';
comment on table conversation_turns is 'One row per exchange: what the caller said, what the agent said, and how the agent decided.';
comment on table conversation_events is 'log_conversation_event''s own records - the agent''s declared decisions and other notable actions.';
