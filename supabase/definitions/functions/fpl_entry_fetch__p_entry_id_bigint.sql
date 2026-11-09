-- Live definition exported from the database (function fpl_entry_fetch(p_entry_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_entry_fetch(p_entry_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
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
$function$
;
