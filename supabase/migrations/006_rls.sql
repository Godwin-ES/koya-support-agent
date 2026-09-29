-- Migration 6 of 6: grants + Row Level Security.
-- SYSTEM-DESIGN.md §7, §11.12: "Browsers never read seed or runtime tables
-- directly. The agent-server and MCP server use the service role. The
-- support console reads through server-side routes, for signed-in staff
-- only (Supabase Auth)."
--
-- Unlike week 5 (rows owned per-user, so `anon`/`authenticated` needed
-- scoped SELECT policies), nothing here is browser-readable at all: RLS is
-- enabled on every table with zero policies for `anon`/`authenticated`,
-- which denies them by default - the same pattern week 5 used for its
-- shared, internal-only cache tables. Staff access is checked in Next.js
-- server code (a valid Supabase Auth session - no self sign-up, so a
-- session at all means a manually-provisioned staff account), which then
-- reads with the service role; RLS never sees a "staff" concept.
--
-- Both layers matter, same as week 5: the bare GRANT (without it, a query
-- fails with "permission denied for table X" before RLS is ever evaluated)
-- and RLS underneath it. service_role bypasses RLS by role attribute
-- (Supabase's own convention) but still needs the base grant.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter table customers enable row level security;
alter table transactions enable row level security;
alter table payouts enable row level security;
alter table conversations enable row level security;
alter table conversation_turns enable row level security;
alter table conversation_events enable row level security;
alter table retrieval_logs enable row level security;
alter table tool_calls enable row level security;
alter table support_tickets enable row level security;
alter table escalations enable row level security;
alter table evaluations enable row level security;
alter table call_limits enable row level security;
alter table knowledge_chunks enable row level security;
