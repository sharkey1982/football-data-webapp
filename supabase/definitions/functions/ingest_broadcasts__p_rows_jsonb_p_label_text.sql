-- Live definition exported from the database (function ingest_broadcasts(p_rows jsonb, p_label text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ingest_broadcasts(p_rows jsonb, p_label text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r jsonb; v_idx bigint; v_key text; v_reason text; m record;
  v_status text; v_market text; v_bc text; v_ch text; v_ss text; v_remove boolean;
  v_date date; v_time time; v_verified timestamptz; v_access text; v_conf text; v_delivery text[];
  v_bad text; v_fx record;
  v_row public.fixture_broadcasts%rowtype; v_existing public.fixture_broadcasts%rowtype; v_found boolean; v_n int;
  n_seen int := 0; n_match int := 0; n_ins int := 0; n_upd int := 0; n_same int := 0; n_unm int := 0; n_rem int := 0;
  touched bigint[] := '{}'; unmatched jsonb := '[]'; warnings jsonb := '[]'; v_run bigint; v_blackout jsonb;
  c_bools constant text[] := array['is_free_to_air', 'is_subscription', 'is_ppv', 'is_live', 'uk_available', 'is_fast', 'remove'];
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'ingest_broadcasts: p_rows must be a JSON array';
  end if;
  if nullif(trim(p_label), '') is null then
    raise exception 'ingest_broadcasts: p_label is required';
  end if;

  for r, v_idx in
    select e.value, e.ordinality from jsonb_array_elements(p_rows) with ordinality e
    order by coalesce(jsonb_typeof(e.value) = 'object' and e.value->'remove' = 'true'::jsonb, false) desc, e.ordinality
  loop
    n_seen := n_seen + 1;
    v_reason := null; v_date := null; v_time := null; v_verified := null;
    if jsonb_typeof(r) <> 'object' then
      r := jsonb_build_object('raw', r);
      v_reason := 'row is not a JSON object';
    end if;
    v_remove := coalesce(r->'remove' = 'true'::jsonb, false);
    v_market := upper(coalesce(nullif(trim(r->>'market'), ''), 'GB'));
    v_status := nullif(trim(r->>'status'), '');
    v_bc := nullif(trim(r->>'broadcaster'), '');
    v_ch := nullif(trim(r->>'channel'), '');
    v_ss := nullif(trim(r->>'streaming_service'), '');
    v_key := 'research:' || md5(lower(concat_ws('|', trim(r->>'competition'), trim(r->>'home_team'), trim(r->>'away_team'),
               trim(r->>'kickoff_date'), v_market, v_status, v_bc, v_ch, v_remove::text)));

    -- Validation: every problem is reported as the row's reason, never raised,
    -- so one bad row does not hold up the rest.
    begin v_date := nullif(trim(r->>'kickoff_date'), '')::date;
    exception when others then v_reason := coalesce(v_reason || '; ', '') || 'kickoff_date is not a date (YYYY-MM-DD)'; end;
    begin v_time := nullif(trim(r->>'kickoff_time'), '')::time;
    exception when others then v_reason := coalesce(v_reason || '; ', '') || 'kickoff_time is not a time (HH:MM)'; end;
    begin v_verified := nullif(trim(r->>'verified_at'), '')::timestamptz;
    exception when others then v_reason := coalesce(v_reason || '; ', '') || 'verified_at is not a timestamp'; end;

    if nullif(trim(r->>'competition'), '') is null then v_reason := coalesce(v_reason || '; ', '') || 'competition is required'; end if;
    if v_date is null and v_reason is null then v_reason := 'kickoff_date is required'; end if;
    if v_market <> 'GB' then v_reason := coalesce(v_reason || '; ', '') || 'market must be GB'; end if;
    if v_status is null or v_status not in ('confirmed_broadcast', 'confirmed_not_televised') then
      v_reason := coalesce(v_reason || '; ', '') || 'status must be confirmed_broadcast or confirmed_not_televised';
    end if;
    select string_agg(k, ', ') into v_bad from unnest(c_bools) k
     where r ? k and jsonb_typeof(r->k) not in ('boolean', 'null');
    if v_bad is not null then v_reason := coalesce(v_reason || '; ', '') || 'not true/false: ' || v_bad; end if;

    if v_status = 'confirmed_broadcast' and v_bc is null then
      v_reason := coalesce(v_reason || '; ', '') || 'broadcaster is required for confirmed_broadcast';
    end if;
    if not v_remove then
      if nullif(trim(r->>'source'), '') is null then v_reason := coalesce(v_reason || '; ', '') || 'source is required'; end if;
      if v_status = 'confirmed_broadcast' and coalesce(r->>'source_url', '') !~* '^https?://\S+$' then
        v_reason := coalesce(v_reason || '; ', '') || 'source_url (http/https) is required for confirmed_broadcast';
      end if;
      if nullif(r->>'watch_url', '') is not null and r->>'watch_url' !~* '^https?://\S+$' then
        v_reason := coalesce(v_reason || '; ', '') || 'watch_url must be http/https';
      end if;
      if v_status = 'confirmed_not_televised' and (v_bc is not null or v_ch is not null or v_ss is not null or nullif(r->>'watch_url', '') is not null) then
        v_reason := coalesce(v_reason || '; ', '') || 'confirmed_not_televised rows carry no broadcaster, channel, streaming_service or watch_url';
      end if;
      if nullif(r->>'access_type', '') is not null and r->>'access_type' not in ('free', 'free_compatible_device', 'subscription', 'ppv', 'unknown') then
        v_reason := coalesce(v_reason || '; ', '') || 'access_type not recognised: ' || (r->>'access_type');
      end if;
      if nullif(r->>'confidence', '') is not null and r->>'confidence' not in ('confirmed_primary', 'confirmed_secondary', 'probable', 'needs_verification') then
        v_reason := coalesce(v_reason || '; ', '') || 'confidence not recognised: ' || (r->>'confidence');
      end if;
      if r ? 'delivery_methods' and jsonb_typeof(r->'delivery_methods') <> 'null' and (jsonb_typeof(r->'delivery_methods') <> 'array'
         or exists (select 1 from jsonb_array_elements(r->'delivery_methods') d
                    where jsonb_typeof(d) <> 'string' or d #>> '{}' not in ('tv_channel', 'streaming', 'fast', 'web', 'app'))) then
        v_reason := coalesce(v_reason || '; ', '') || 'delivery_methods must be an array of tv_channel, streaming, fast, web, app';
      end if;
    end if;

    if v_reason is null then
      select * into m from public.match_broadcast_fixture(r->>'competition', r->>'home_team', r->>'away_team', v_date, v_time);
      v_reason := m.reason;
    end if;

    -- A not-televised decision cannot sit beside a listing (or vice versa)
    -- unless the submission removes the other first. Saturday 3pm rule rows
    -- are not decisions of record: apply_uk_3pm_blackout() retires them.
    if v_reason is null and not v_remove then
      if v_status = 'confirmed_not_televised' and exists (
           select 1 from public.fixture_broadcasts fb where fb.fixture_id = m.fixture_id and fb.market = v_market and fb.status = 'confirmed_broadcast') then
        v_reason := 'conflict: the fixture has broadcast listings; remove them first ("remove": true)';
      elsif v_status = 'confirmed_broadcast' and exists (
           select 1 from public.fixture_broadcasts fb where fb.fixture_id = m.fixture_id and fb.market = v_market
              and fb.status = 'confirmed_not_televised' and fb.source <> 'rule:3pm_blackout') then
        v_reason := 'conflict: the fixture is marked confirmed_not_televised; remove that first ("status": "confirmed_not_televised", "remove": true)';
      end if;
    end if;

    if v_reason is not null then
      n_unm := n_unm + 1;
      unmatched := unmatched || jsonb_build_object('row', v_idx,
        'match', concat_ws(' v ', r->>'home_team', r->>'away_team'), 'competition', r->>'competition',
        'kickoff_date', r->>'kickoff_date', 'broadcaster', v_bc, 'reason', v_reason);
      insert into public.broadcast_sync_unmatched (airtable_record_id, match_label, kickoff_date, home_raw, away_raw, competition_label, reason, record)
      values (v_key, concat_ws(' v ', r->>'home_team', r->>'away_team'), v_date, nullif(trim(r->>'home_team'), ''),
              nullif(trim(r->>'away_team'), ''), nullif(trim(r->>'competition'), ''), v_reason,
              r || jsonb_build_object('_label', p_label))
      on conflict (airtable_record_id) do update set match_label = excluded.match_label, kickoff_date = excluded.kickoff_date,
        home_raw = excluded.home_raw, away_raw = excluded.away_raw, competition_label = excluded.competition_label,
        reason = excluded.reason, record = excluded.record, last_seen_at = now(), resolved_at = null;
      continue;
    end if;

    n_match := n_match + 1;
    update public.broadcast_sync_unmatched set resolved_at = now() where airtable_record_id = v_key and resolved_at is null;

    -- Stored kick-off differs from the source: worth a look at the fixture.
    select f.slug, f.kickoff_date, f.kickoff_time into v_fx from public.fixtures f where f.fixture_id = m.fixture_id;
    if v_fx.kickoff_date <> v_date or (v_time is not null and v_fx.kickoff_time is distinct from v_time) then
      warnings := warnings || jsonb_build_object('row', v_idx, 'fixture', v_fx.slug,
        'stored', concat_ws(' ', v_fx.kickoff_date::text, to_char(v_fx.kickoff_time, 'HH24:MI')),
        'submitted', concat_ws(' ', v_date::text, to_char(v_time, 'HH24:MI')));
    end if;

    if v_remove then
      delete from public.fixture_broadcasts fb
       where fb.fixture_id = m.fixture_id and fb.market = v_market and fb.status = v_status
         and (v_status = 'confirmed_not_televised'
              or (lower(fb.broadcaster) = lower(v_bc) and (v_ch is null or lower(coalesce(fb.channel, '')) = lower(v_ch))));
      get diagnostics v_n = row_count;
      n_rem := n_rem + v_n;
      continue;
    end if;

    v_access := coalesce(nullif(r->>'access_type', ''),
      case when r->'is_ppv' = 'true'::jsonb then 'ppv'
           when r->'is_free_to_air' = 'true'::jsonb then 'free'
           when r->'is_subscription' = 'true'::jsonb then 'subscription' end);
    v_conf := coalesce(nullif(r->>'confidence', ''), 'confirmed_primary');
    if r ? 'delivery_methods' and jsonb_typeof(r->'delivery_methods') = 'array' then
      v_delivery := array(select distinct d from jsonb_array_elements_text(r->'delivery_methods') d order by d);
    else
      v_delivery := array_remove(array[case when v_ch is not null then 'tv_channel' end, case when v_ss is not null then 'streaming' end], null);
    end if;

    v_row := null;
    v_row.fixture_id := m.fixture_id; v_row.market := v_market; v_row.status := v_status;
    v_row.competition_label := trim(r->>'competition');
    v_row.source := trim(r->>'source');
    v_row.source_url := nullif(trim(r->>'source_url'), '');
    v_row.verified_at := coalesce(v_verified, now());
    v_row.confidence := v_conf;
    v_row.availability_notes := nullif(trim(r->>'availability_notes'), '');
    v_row.delivery_methods := '{}'; v_row.is_fast := false;
    v_row.is_free_to_air := false; v_row.is_subscription := false; v_row.is_ppv := false;
    if v_status = 'confirmed_broadcast' then
      v_row.broadcaster := v_bc;
      v_row.channel := v_ch;
      v_row.streaming_service := v_ss;
      v_row.service_product := nullif(trim(r->>'service_product'), '');
      v_row.watch_url := nullif(trim(r->>'watch_url'), '');
      v_row.access_type := v_access;
      v_row.delivery_methods := v_delivery;
      v_row.platform_device := nullif(trim(r->>'platform_device'), '');
      v_row.is_live := coalesce((r->>'is_live')::boolean, true);
      v_row.uk_available := coalesce((r->>'uk_available')::boolean, true);
      v_row.is_fast := coalesce((r->>'is_fast')::boolean, false) or 'fast' = any(v_delivery);
      v_row.is_free_to_air := v_access in ('free', 'free_compatible_device');
      v_row.is_subscription := v_access = 'subscription';
      v_row.is_ppv := v_access = 'ppv';
    end if;

    -- Natural key: fixture + market + status (+ broadcaster and channel).
    if v_status = 'confirmed_not_televised' then
      select * into v_existing from public.fixture_broadcasts fb
       where fb.fixture_id = m.fixture_id and fb.market = v_market and fb.status = 'confirmed_not_televised';
      v_found := found;
    else
      select * into v_existing from public.fixture_broadcasts fb
       where fb.fixture_id = m.fixture_id and fb.market = v_market and fb.status = 'confirmed_broadcast'
         and lower(fb.broadcaster) = lower(v_bc) and lower(coalesce(fb.channel, '')) = lower(coalesce(v_ch, ''))
       order by fb.broadcast_id limit 1;
      v_found := found;
      -- Same broadcaster, channel renamed: adopt its one row, unless this run
      -- has already written it (two channels of one broadcaster stay two rows).
      if not v_found then
        select * into v_existing from public.fixture_broadcasts fb
         where fb.fixture_id = m.fixture_id and fb.market = v_market and fb.status = 'confirmed_broadcast'
           and lower(fb.broadcaster) = lower(v_bc) and not (fb.broadcast_id = any(touched))
           and (select count(*) from public.fixture_broadcasts o
                 where o.fixture_id = fb.fixture_id and o.market = fb.market and o.status = 'confirmed_broadcast'
                   and lower(o.broadcaster) = lower(v_bc)) = 1;
        v_found := found;
      end if;
    end if;

    if not v_found then
      insert into public.fixture_broadcasts (fixture_id, market, status, broadcaster, channel, streaming_service, is_free_to_air, is_subscription, is_ppv,
        watch_url, source, source_url, verified_at, service_product, access_type, delivery_methods, platform_device,
        is_live, uk_available, is_fast, confidence, availability_notes, competition_label, last_synced_at)
      values (v_row.fixture_id, v_row.market, v_row.status, v_row.broadcaster, v_row.channel, v_row.streaming_service, v_row.is_free_to_air,
        v_row.is_subscription, v_row.is_ppv, v_row.watch_url, v_row.source, v_row.source_url, v_row.verified_at, v_row.service_product,
        v_row.access_type, v_row.delivery_methods, v_row.platform_device, v_row.is_live, v_row.uk_available, v_row.is_fast, v_row.confidence,
        v_row.availability_notes, v_row.competition_label, now())
      returning broadcast_id into v_row.broadcast_id;
      touched := touched || v_row.broadcast_id;
      n_ins := n_ins + 1;
    elsif (v_existing.status, v_existing.broadcaster, v_existing.channel, v_existing.streaming_service,
           v_existing.service_product, v_existing.access_type, v_existing.delivery_methods, v_existing.platform_device, v_existing.is_live,
           v_existing.uk_available, v_existing.is_fast, v_existing.confidence, v_existing.availability_notes,
           coalesce(v_row.watch_url, v_existing.watch_url), v_existing.source, v_existing.source_url, v_existing.competition_label)
      is not distinct from
          (v_row.status, v_row.broadcaster, v_row.channel, v_row.streaming_service,
           v_row.service_product, v_row.access_type, v_row.delivery_methods, v_row.platform_device, v_row.is_live,
           v_row.uk_available, v_row.is_fast, v_row.confidence, v_row.availability_notes,
           v_existing.watch_url, v_row.source, v_row.source_url, v_row.competition_label) then
      -- Same facts: only record that they were confirmed again.
      update public.fixture_broadcasts set last_synced_at = now(), verified_at = greatest(verified_at, v_row.verified_at)
       where broadcast_id = v_existing.broadcast_id;
      touched := touched || v_existing.broadcast_id;
      n_same := n_same + 1;
    else
      update public.fixture_broadcasts set status = v_row.status, broadcaster = v_row.broadcaster,
        channel = v_row.channel, streaming_service = v_row.streaming_service, is_free_to_air = v_row.is_free_to_air,
        is_subscription = v_row.is_subscription, is_ppv = v_row.is_ppv, watch_url = coalesce(v_row.watch_url, watch_url),
        source = v_row.source, source_url = v_row.source_url, verified_at = v_row.verified_at,
        service_product = v_row.service_product, access_type = v_row.access_type, delivery_methods = v_row.delivery_methods,
        platform_device = v_row.platform_device, is_live = v_row.is_live, uk_available = v_row.uk_available, is_fast = v_row.is_fast,
        confidence = v_row.confidence, availability_notes = v_row.availability_notes, competition_label = v_row.competition_label,
        last_synced_at = now(), updated_at = now()
      where broadcast_id = v_existing.broadcast_id;
      touched := touched || v_existing.broadcast_id;
      n_upd := n_upd + 1;
    end if;
  end loop;

  -- Saturday 3pm blackout rows, after the listings so a real listing wins.
  v_blackout := public.apply_uk_3pm_blackout();

  insert into public.broadcast_sync_runs (records_seen, inserted, updated, unchanged, kept_stronger, unmatched, removed, source, label, notes)
  values (n_seen, n_ins, n_upd, n_same, 0, n_unm, n_rem, 'claude_research', trim(p_label),
          format('%s matched, %s unmatched, %s removed, %s kick-off warning(s); 3pm rule %s', n_match, n_unm, n_rem,
                 jsonb_array_length(warnings), v_blackout::text))
  returning run_id into v_run;

  return jsonb_build_object('run_id', v_run, 'label', trim(p_label), 'seen', n_seen, 'matched', n_match,
    'inserted', n_ins, 'updated', n_upd, 'unchanged', n_same, 'removed', n_rem, 'unmatched', n_unm,
    'unmatched_rows', unmatched, 'kickoff_warnings', warnings, 'blackout', v_blackout);
end;
$function$
;
