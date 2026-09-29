-- Notifications (SYSTEM-DESIGN.md §10).
--
-- 1. ops_events: operational events with no conversation of their own - a
--    caller turned away because every slot was busy, an account reaching
--    its daily limit - so the daily Discord digest can count them. Never
--    personal data: `detail` holds counts and pool names only.
--
-- 2. The watchdog now only watches voice calls. It treated any conversation
--    open over 10 minutes as "agent-server is down", but a text chat left
--    open in a closed tab has no end-of-call event at all - it's closed by
--    agent-server's own inactivity sweep instead. Watching chats made every
--    abandoned chat a false "server down" alert.

create table if not exists ops_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ops_events_kind_created_at_idx on ops_events (kind, created_at);
alter table ops_events enable row level security;
grant select, insert, update, delete on ops_events to service_role;

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
       and channel in ('web_voice', 'phone')
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
