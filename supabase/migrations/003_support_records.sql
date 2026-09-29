-- Migration 3 of 6: retrieval_logs, tool_calls, support_tickets,
-- escalations. SYSTEM-DESIGN.md §5, §7.
--
-- The idempotency rules from §5 ("one open ticket per conversation and
-- category", "one open escalation per conversation") are partial unique
-- indexes on status = 'open', not plain unique constraints - once a
-- ticket/escalation is closed, a genuinely new issue in a later turn (or a
-- resumed conversation) can open another one.

create table retrieval_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  turn_seq int not null,
  query text not null,
  chunk_ids uuid[] not null default '{}',
  -- Denormalised alongside chunk_ids so the console can show what was
  -- retrieved without a join back to knowledge_chunks, even if a chunk is
  -- later re-ingested and its content changes.
  source_titles text[] not null default '{}',
  source_summaries text[] not null default '{}',
  scores numeric(6, 4)[] not null default '{}',
  found boolean not null,
  created_at timestamptz not null default now()
);

create index retrieval_logs_conversation_id_idx on retrieval_logs (conversation_id);

create table tool_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  turn_seq int not null,
  tool_name text not null,
  purpose text,
  input_summary text,
  result_summary text,
  status text not null check (status in ('ok', 'not_found', 'refused', 'error')),
  error_message text,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index tool_calls_conversation_id_idx on tool_calls (conversation_id);

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  customer_id text references customers (customer_id),
  transaction_id text references transactions (transaction_id),
  category text not null,
  -- Not specified in the PRD's tools/escalation assets - a reasonable,
  -- easily-revised convention, unlike escalations.category below which the
  -- escalation rules document does define.
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  summary text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  created_at timestamptz not null default now()
);

create index support_tickets_conversation_id_idx on support_tickets (conversation_id);
create unique index support_tickets_open_unique on support_tickets (conversation_id, category) where status = 'open';

create table escalations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references support_tickets (id),
  conversation_id uuid not null references conversations (id) on delete cascade,
  customer_id text references customers (customer_id),
  user_name text,
  user_email text,
  -- assets/escalation-rules.md "Escalation Record Fields": compliance, account, dispute, payment, or other.
  category text not null check (category in ('compliance', 'account', 'dispute', 'payment', 'other')),
  reason text not null,
  call_booked boolean not null default false,
  callback_time timestamptz,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  created_at timestamptz not null default now()
);

create index escalations_conversation_id_idx on escalations (conversation_id);
create unique index escalations_open_unique on escalations (conversation_id) where status = 'open';

comment on table retrieval_logs is 'What search_knowledge found for a turn, for the console''s knowledge-used chips (SYSTEM-DESIGN.md §11.8).';
comment on table tool_calls is 'Every MCP tool call, success and failure alike (mcp-tool-requirements.md: "Tools should log failed calls with enough detail to debug").';
comment on table support_tickets is 'create_support_ticket''s records.';
comment on table escalations is 'create_escalation''s records - assets/escalation-rules.md.';
