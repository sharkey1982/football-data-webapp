-- ============================================================================
-- Squad Check: fetch a manager's FPL squad by FPL ID, from the database.
--
-- The FPL API (behind Cloudflare) refuses many cloud servers: the fpl-entry
-- Edge Function got a 403 on about half its calls, depending on which server
-- ran it. The database's own requests (private.refresh_fpl uses the same
-- endpoints) are accepted, so the fetch runs here, with the synchronous http
-- extension, and the browser calls it as an RPC.
--
-- Returns the raw pieces, trimmed to the fields the page uses; the logic
-- (Free Hit revert, transfers since the deadline, purchase prices) is in
-- src/lib/squadCheck.ts, where it is tested. Nothing is stored except a
-- timestamp per call for a global rate limit (120 a minute).
-- ============================================================================

create table if not exists private.fpl_entry_calls (called_at timestamptz not null default now());
create index if not exists fpl_entry_calls_called_at on private.fpl_entry_calls (called_at);

create or replace function public.fpl_entry_fetch(p_entry_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '7s'
as $$
declare
  base text := 'https://fantasy.premierleague.com/api/entry/' || p_entry_id::text;
  st int;
  body text;
  entry jsonb;
  hist jsonb;
  trans jsonb;
  picks jsonb;
  prev jsonb := null;
  ev int;
begin
  if p_entry_id is null or p_entry_id < 1 or p_entry_id > 99999999 then
    return jsonb_build_object('status', 'bad_id');
  end if;

  delete from private.fpl_entry_calls where called_at < now() - interval '2 minutes';
  if (select count(*) from private.fpl_entry_calls where called_at > now() - interval '1 minute') >= 120 then
    return jsonb_build_object('status', 'busy');
  end if;
  insert into private.fpl_entry_calls default values;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '2500');

  begin
    select status, content into st, body from extensions.http_get(base || '/');
  exception when others then
    return jsonb_build_object('status', 'unavailable', 'fpl_status', 0);
  end;
  if st = 404 then return jsonb_build_object('status', 'not_found'); end if;
  if st <> 200 then return jsonb_build_object('status', 'unavailable', 'fpl_status', st); end if;
  entry := body::jsonb;
  ev := (entry ->> 'current_event')::int;
  if ev is null then return jsonb_build_object('status', 'not_started'); end if;

  begin
    select status, content into st, body from extensions.http_get(base || '/event/' || ev || '/picks/');
  exception when others then st := 0;
  end;
  if st <> 200 then return jsonb_build_object('status', 'unavailable', 'fpl_status', st); end if;
  picks := body::jsonb;

  begin
    select status, content into st, body from extensions.http_get(base || '/history/');
    hist := case when st = 200 then body::jsonb end;
  exception when others then hist := null;
  end;
  begin
    select status, content into st, body from extensions.http_get(base || '/transfers/');
    trans := case when st = 200 then body::jsonb end;
  exception when others then trans := null;
  end;

  if picks ->> 'active_chip' = 'freehit' and ev > 1 then
    begin
      select status, content into st, body from extensions.http_get(base || '/event/' || (ev - 1) || '/picks/');
    exception when others then st := 0;
    end;
    if st <> 200 then return jsonb_build_object('status', 'unavailable', 'fpl_status', st); end if;
    prev := body::jsonb;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'entry', jsonb_build_object(
      'id', p_entry_id,
      'name', entry -> 'name',
      'current_event', ev,
      'last_deadline_bank', entry -> 'last_deadline_bank',
      'overall_rank', entry -> 'summary_overall_rank',
      'total_points', entry -> 'summary_overall_points'
    ),
    'chips', coalesce((select jsonb_agg(jsonb_build_object('name', c ->> 'name', 'event', (c ->> 'event')::int)) from jsonb_array_elements(hist -> 'chips') c), '[]'::jsonb),
    'transfers_known', trans is not null,
    'transfers', coalesce((select jsonb_agg(jsonb_build_object(
        'element_in', (t ->> 'element_in')::int, 'element_in_cost', (t ->> 'element_in_cost')::int,
        'element_out', (t ->> 'element_out')::int, 'element_out_cost', (t ->> 'element_out_cost')::int,
        'event', (t ->> 'event')::int, 'time', t ->> 'time')) from jsonb_array_elements(trans) t), '[]'::jsonb),
    'picks', jsonb_build_object('active_chip', picks -> 'active_chip', 'bank', picks -> 'entry_history' -> 'bank', 'picks', picks -> 'picks'),
    'prev_picks', case when prev is null then null
      else jsonb_build_object('active_chip', prev -> 'active_chip', 'bank', prev -> 'entry_history' -> 'bank', 'picks', prev -> 'picks') end
  );
end;
$$;

comment on function public.fpl_entry_fetch(bigint) is
  'Squad Check: a manager''s FPL squad by FPL ID from the public FPL API (entry, picks, history, transfers), trimmed. Runs in the database because FPL refuses many cloud servers. Rate-limited to 120 calls a minute; stores nothing else.';

revoke all on function public.fpl_entry_fetch(bigint) from public;
grant execute on function public.fpl_entry_fetch(bigint) to anon, authenticated, service_role;

select public.meta_refresh_flow();
