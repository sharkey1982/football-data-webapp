-- ============================================================================
-- Edge-function guards (audit SEC-01, SEC-02; 22 Oct 2026). Safe to re-run.
--
-- SEC-01: ingest-cup-data is public (verify_jwt off) and writes fixtures and
-- matches with the service role. It now requires the header x-ingest-token,
-- a secret generated here in Vault (never in the repo). The pg_cron job sends
-- it through private.call_ingest_cup_data(); the function checks it with
-- public.ingest_cup_token_ok() (service_role only).
--
-- SEC-02: fpl-optimize-squad (public) runs a search of up to 15 s on every
-- request that misses the cache. public.fpl_optimizer_rate_ok(client) allows
-- 4 live searches a minute per client and 30 a minute overall.
-- ============================================================================

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ingest_cup_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'ingest_cup_token',
      'pg_cron -> edge function ingest-cup-data (header x-ingest-token)');
  end if;
end $$;

create or replace function public.ingest_cup_token_ok(p_token text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_token) >= 32 and p_token = (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cup_token'), false)
$$;
revoke all on function public.ingest_cup_token_ok(text) from public, anon, authenticated;
grant execute on function public.ingest_cup_token_ok(text) to service_role;

create or replace function private.call_ingest_cup_data()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_token text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_cup_token';
  return net.http_post(
    url := 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/ingest-cup-data',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
end;
$$;
revoke all on function private.call_ingest_cup_data() from public, anon, authenticated;

-- Same job name and time; cron.schedule replaces the command.
select cron.schedule('ingest-cup-data-daily', '15 5 * * *', 'select private.call_ingest_cup_data()');

create table if not exists private.fpl_optimizer_calls (
  client text not null,
  called_at timestamptz not null default now()
);
create index if not exists fpl_optimizer_calls_at_idx on private.fpl_optimizer_calls (called_at);
alter table private.fpl_optimizer_calls enable row level security;

create or replace function public.fpl_optimizer_rate_ok(p_client text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_client text := left(coalesce(nullif(p_client, ''), 'unknown'), 100);
begin
  delete from private.fpl_optimizer_calls where called_at < now() - interval '10 minutes';
  if (select count(*) from private.fpl_optimizer_calls where called_at > now() - interval '1 minute') >= 30
     or (select count(*) from private.fpl_optimizer_calls where client = v_client and called_at > now() - interval '1 minute') >= 4 then
    return false;
  end if;
  insert into private.fpl_optimizer_calls (client) values (v_client);
  return true;
end;
$$;
revoke all on function public.fpl_optimizer_rate_ok(text) from public, anon, authenticated;
grant execute on function public.fpl_optimizer_rate_ok(text) to service_role;
