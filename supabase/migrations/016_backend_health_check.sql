-- Backend health monitoring (SYSTEM-DESIGN.md §10). The watchdog (012, 015)
-- only notices a call stuck open - but if agent-server is down, calls can't
-- start at all, so nothing ever gets stuck and nobody is told. This pings
-- agent-server's /health from inside Supabase every 5 minutes.
--
-- pg_net requests are asynchronous (net.http_get returns a request id; the
-- response lands in net._http_response a moment later), so each run judges
-- the previous run's ping and then sends the next one. One #alerts message
-- when it goes down, one when it's back - not one every 5 minutes.
--
-- The health URL is a Vault secret (agent_server_health_url, set by
-- scripts/set-alert-secrets.mjs), like the webhook. Until it's set this does
-- nothing, so a development project isn't pinging anything.

create table if not exists ops_health_checks (
  request_id bigint primary key,
  sent_at timestamptz not null default now()
);
alter table ops_health_checks enable row level security;
grant select, insert, update, delete on ops_health_checks to service_role;

-- How one ping went: 'up' (HTTP 200), 'down' (an error, a timeout or any
-- other status) or 'pending' (no response recorded yet). Separate from the
-- job itself so it can be checked directly.
create or replace function backend_health_status(check_request_id bigint) returns text
language sql stable security definer set search_path = public, extensions, net as $$
  select case
    when r.id is null then 'pending'
    when r.timed_out or r.error_msg is not null or r.status_code is distinct from 200 then 'down'
    else 'up'
  end
  from (select check_request_id as id) wanted
  left join net._http_response r on r.id = wanted.id;
$$;

create or replace function backend_health_check() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  health_url text;
  webhook text;
  app_url text;
  last_request bigint;
  status text := 'first check';
  was_down boolean;
  message jsonb;
begin
  select decrypted_secret into health_url from vault.decrypted_secrets where name = 'agent_server_health_url' limit 1;
  if health_url is null or health_url = '' then
    return 'not configured';
  end if;
  select decrypted_secret into webhook from vault.decrypted_secrets where name = 'discord_alerts_webhook' limit 1;
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'app_url' limit 1;

  select request_id into last_request from ops_health_checks order by sent_at desc limit 1;
  if last_request is not null then
    status := backend_health_status(last_request);
    was_down := exists (select 1 from ops_alerts where key = 'backend_down');

    if status = 'down' and not was_down then
      insert into ops_alerts (key) values ('backend_down') on conflict (key) do nothing;
      message := jsonb_build_object(
        'title', 'Backend is down: health check failing',
        'description', 'agent-server''s /health didn''t answer. Calls and chats can''t start until it''s back.',
        'color', 12986408);
    elsif status = 'up' and was_down then
      delete from ops_alerts where key = 'backend_down';
      message := jsonb_build_object(
        'title', 'Backend is back up',
        'description', 'agent-server''s /health is answering again.',
        'color', 2062925);
    end if;

    if message is not null and webhook is not null and webhook <> '' then
      perform net.http_post(
        url := webhook,
        body := jsonb_build_object(
          'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb),
          'embeds', jsonb_build_array(jsonb_strip_nulls(message || jsonb_build_object(
            'url', case when app_url is not null and app_url <> '' then rtrim(app_url, '/') || '/console' end)))),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    end if;
  end if;

  insert into ops_health_checks (request_id) values (net.http_get(health_url, timeout_milliseconds := 10000));
  delete from ops_health_checks where sent_at < now() - interval '1 day';
  return status;
end;
$$;

revoke execute on function backend_health_check() from public;
revoke execute on function backend_health_status(bigint) from public;

select cron.schedule('relaypay-backend-health', '*/5 * * * *', $$select public.backend_health_check()$$);
