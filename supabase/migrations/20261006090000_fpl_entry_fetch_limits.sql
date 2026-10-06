-- ============================================================================
-- Rate My Team: cache and per-visitor limit on fpl_entry_fetch (6 Oct 2026).
--
-- The 6 Oct audit: fpl_entry_fetch runs as its owner, anyone can call it,
-- and each call makes up to five requests to the FPL API with a 7 s
-- timeout. The only limit was 120 calls a minute shared by everyone, so one
-- visitor (or a script) could use it all, lock Rate My Team for everyone
-- else and hold database connections open.
--
-- Now:
--   * the FPL work moves, unchanged, to private.fpl_entry_fetch_uncached,
--     which only the owner can run;
--   * public.fpl_entry_fetch answers a repeat request for the same team
--     within 5 minutes from private.fpl_entry_cache (no FPL calls);
--   * each visitor (by the client address the API gateway passes on) gets
--     at most 12 fresh fetches a minute (private.fpl_entry_clients); the
--     shared 120 a minute stays as a ceiling.
-- The result shape is unchanged, so the page needs no change.
-- ============================================================================

-- 1. The existing body, renamed into the private schema.
alter function public.fpl_entry_fetch(bigint) rename to fpl_entry_fetch_uncached;
alter function public.fpl_entry_fetch_uncached(bigint) set schema private;
revoke all on function private.fpl_entry_fetch_uncached(bigint) from public, anon, authenticated;

-- Per-visitor log, separate from fpl_entry_calls (which the uncached body
-- counts for the shared ceiling, so one row per fresh fetch stays one row).
create table if not exists private.fpl_entry_clients (
  client text not null,
  called_at timestamptz not null default now()
);
create index if not exists fpl_entry_clients_idx on private.fpl_entry_clients (client, called_at);
revoke all on private.fpl_entry_clients from public, anon, authenticated;

create table if not exists private.fpl_entry_cache (
  entry_id bigint primary key,
  fetched_at timestamptz not null default now(),
  result jsonb not null
);
revoke all on private.fpl_entry_cache from public, anon, authenticated;

-- 2. The public entry point.
create or replace function public.fpl_entry_fetch(p_entry_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
 set statement_timeout to '8s'
as $function$
declare
  hdr json := nullif(current_setting('request.headers', true), '')::json;
  who text;
  cached jsonb;
  res jsonb;
begin
  if p_entry_id is null or p_entry_id < 1 or p_entry_id > 99999999 then
    return jsonb_build_object('status', 'bad_id');
  end if;

  select c.result into cached from private.fpl_entry_cache c
   where c.entry_id = p_entry_id and c.fetched_at > now() - interval '5 minutes';
  if cached is not null then
    return cached;
  end if;

  -- Client address: Cloudflare's header when present, else the real-IP
  -- header, else the last X-Forwarded-For hop (the one the gateway added).
  who := coalesce(
    hdr ->> 'cf-connecting-ip',
    hdr ->> 'x-real-ip',
    nullif(trim(reverse(split_part(reverse(coalesce(hdr ->> 'x-forwarded-for', '')), ',', 1))), ''),
    'unknown');
  delete from private.fpl_entry_clients where called_at < now() - interval '2 minutes';
  if (select count(*) from private.fpl_entry_clients
       where client = who and called_at > now() - interval '1 minute') >= 12 then
    return jsonb_build_object('status', 'busy');
  end if;
  insert into private.fpl_entry_clients (client) values (who);

  -- The uncached body applies the shared 120-a-minute ceiling itself.
  res := private.fpl_entry_fetch_uncached(p_entry_id);
  if res ->> 'status' = 'ok' then
    insert into private.fpl_entry_cache (entry_id, fetched_at, result)
    values (p_entry_id, now(), res)
    on conflict (entry_id) do update set fetched_at = excluded.fetched_at, result = excluded.result;
  end if;
  delete from private.fpl_entry_cache where fetched_at < now() - interval '1 hour';
  return res;
end;
$function$;

revoke all on function public.fpl_entry_fetch(bigint) from public;
grant execute on function public.fpl_entry_fetch(bigint) to anon, authenticated, service_role;
