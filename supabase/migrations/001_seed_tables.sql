-- Migration 1 of 6: extensions + the seed-data tables (customers,
-- transactions, payouts). SYSTEM-DESIGN.md §7. Loaded from
-- assets/seed-data/*.csv by scripts/seed.ts (idempotent - upserts on the
-- primary key, safe to re-run).
--
-- Value lists (plan/account_status/kyc_status/transaction_type/status) are
-- the exact enums from assets/supabase-schema-and-seed-data.md, not just
-- what the 3-5 row sample CSVs happen to show.

create extension if not exists pgcrypto;

create table customers (
  customer_id text primary key,
  company_name text not null,
  contact_name text not null,
  contact_email text not null,
  plan text not null check (plan in ('Starter', 'Growth', 'Scale')),
  account_status text not null check (account_status in ('active', 'restricted', 'pending verification')),
  region text not null,
  kyc_status text not null check (kyc_status in ('pending', 'approved', 'review required')),
  support_notes text,
  created_at timestamptz not null default now()
);

create table transactions (
  transaction_id text primary key,
  customer_id text not null references customers (customer_id) on delete cascade,
  transaction_type text not null check (transaction_type in ('incoming transfer', 'outgoing payout', 'invoice payment')),
  amount numeric(14, 2) not null,
  currency text not null,
  destination_country text,
  status text not null check (status in ('processing', 'completed', 'delayed', 'failed', 'review required')),
  -- The seed CSV's own created_at (when the transaction happened) - distinct
  -- from any row-insert timestamp, which these tables don't otherwise need.
  created_at date not null,
  estimated_arrival date,
  support_summary text not null,
  inserted_at timestamptz not null default now()
);

create index transactions_customer_id_idx on transactions (customer_id);

create table payouts (
  payout_id text primary key,
  transaction_id text not null references transactions (transaction_id) on delete cascade,
  customer_id text not null references customers (customer_id) on delete cascade,
  recipient_name text not null,
  amount numeric(14, 2) not null,
  currency text not null,
  status text not null check (status in ('scheduled', 'processing', 'completed', 'failed', 'review required')),
  scheduled_for date,
  failure_reason text,
  inserted_at timestamptz not null default now()
);

create index payouts_customer_id_idx on payouts (customer_id);
create index payouts_transaction_id_idx on payouts (transaction_id);

comment on table customers is 'RelayPay seed data (assets/seed-data/customers.csv). Looked up only through the MCP lookup_customer tool - never read by the browser directly (SYSTEM-DESIGN.md §7).';
comment on table transactions is 'RelayPay seed data (assets/seed-data/transactions.csv).';
comment on table payouts is 'RelayPay seed data (assets/seed-data/payouts.csv).';
