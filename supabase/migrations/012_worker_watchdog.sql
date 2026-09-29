-- Worker-down alerts (SYSTEM-DESIGN.md §10, IMPLEMENTATION-PLAN.md Task 8) -
-- the week-5 pattern (supabase/migrations/027_worker_watchdog.sql there),
-- adapted from "runs stuck queued/running" to "conversations stuck open":
-- a dead agent-server can't report itself, so this runs inside Supabase
-- instead. Every minute, pg_cron calls conversation_watchdog(), which
-- posts one Discord message (via pg_net) when a conversation has no
-- `ended_at` and started over 10 minutes ago - well past the 5-minute call
-- cap (SYSTEM-DESIGN.md §9's maxDurationSeconds: 300) with room for normal
-- end-of-call-report latency, so this only fires for a genuinely stuck
-- conversation, not a call still legitimately in progress. Each stuck
-- conversation is alerted once (ops_alerts), not every minute.
--
-- The webhook URL and app URL are secrets in Supabase Vault, set by
-- scripts/set-alert-secrets.mjs - never in a migration. Until they're set,
-- the watchdog does nothing, so development against this project isn't
-- alerted about calls left open while no local agent-server is running.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists ops_alerts (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table ops_alerts enable row level security;
-- No policies: only the watchdog (security definer) and the service role touch it.
grant select, insert, update, delete on ops_alerts to service_role;

create or replace function conversation_watchdog() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  webhook text;
  app_url text;
  new_stuck int := 0;
begin
  select decrypted_secret into webhook from vault.decrypted_secrets where name = 'discord_alerts_webhook' limit 1;
  if webhook is null or webhook = '' then
    return;
  end if;
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'app_url' limit 1;

  with stuck as (
    select id from conversations
     where ended_at is null
       and started_at < now() - interval '10 minutes'
  ), inserted as (
    insert into ops_alerts (key)
    select 'stuck_conversation:' || id from stuck
    on conflict (key) do nothing
    returning key
  )
  select count(*) into new_stuck from inserted;

  delete from ops_alerts where sent_at < now() - interval '7 days';

  if new_stuck = 0 then
    return;
  end if;

  perform net.http_post(
    url := webhook,
    body := jsonb_build_object(
      'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb),
      'embeds', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'title', 'agent-server is not responding',
        'description', new_stuck || ' call(s) have been open for over 10 minutes with no end-of-call-report - the agent-server is probably down.',
        'url', case when app_url is not null and app_url <> '' then rtrim(app_url, '/') || '/console' end,
        'color', 12986408
      )))
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end;
$$;

revoke execute on function conversation_watchdog() from public;

select cron.schedule('relaypay-conversation-watchdog', '* * * * *', $$select public.conversation_watchdog()$$);
