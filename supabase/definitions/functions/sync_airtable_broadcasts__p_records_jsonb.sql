-- Live definition exported from the database (function sync_airtable_broadcasts(p_records jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sync_airtable_broadcasts(p_records jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r jsonb; f jsonb; rid text;
  v_match text; v_date date; v_home_raw text; v_away_raw text; v_comp text; v_code text; v_league bigint;
  v_home bigint; v_away bigint; v_fixture bigint; v_tie boolean; v_reason text;
  v_status text; v_access text; v_conf text; v_delivery text[];
  v_row public.fixture_broadcasts%rowtype; v_existing public.fixture_broadcasts%rowtype; v_found boolean;
  n_seen int := 0; n_ins int := 0; n_upd int := 0; n_same int := 0; n_kept int := 0; n_unm int := 0;
  synced text[] := '{}'; unmatched jsonb := '[]'; v_run bigint;
  sel constant text := 'name';
begin
  for r in select * from jsonb_array_elements(p_records) loop
    n_seen := n_seen + 1;
    rid := r->>'id';
    f := coalesce(r->'cellValuesByFieldId', r->'fields', '{}'::jsonb);
    v_match    := f->>'flddeM6xuoqoaPzea';
    v_date     := nullif(f->>'fldMtKYUVzWSvfjsw','')::date;
    v_home_raw := trim(f->>'fldiJTg56BqKPlJgd');
    v_away_raw := trim(f->>'fldpfiQHbbfjbDhn7');
    v_comp     := coalesce(nullif(trim(f->>'fldmK8oDxqwE9qzqJ'),''), f->'fldBFu0wI75sQ8k6B'->>sel, f->>'fldBFu0wI75sQ8k6B');
    v_code     := (select league_code from public.broadcast_competition_map where label = v_comp);
    v_league   := (select league_id from public.leagues where code = v_code);
    v_reason := null; v_fixture := null;

    if rid is null or v_date is null or v_home_raw is null or v_away_raw is null then
      v_reason := 'missing record id, date or team';
    else
      v_home := public.resolve_broadcast_team(v_home_raw);
      v_away := public.resolve_broadcast_team(v_away_raw);
      if v_home is null then v_reason := 'unknown team: ' || v_home_raw; end if;
      if v_away is null then v_reason := coalesce(v_reason || '; ', '') || 'unknown team: ' || v_away_raw; end if;
      if v_comp is not null and v_code is null then
        v_reason := coalesce(v_reason || '; ', '') || 'competition not mapped: ' || v_comp;
      elsif v_code is not null and v_league is null then
        v_reason := coalesce(v_reason || '; ', '') || 'competition not in database: ' || v_comp;
      end if;
    end if;

    if v_reason is null then
      select x.fixture_id, x.tie into v_fixture, v_tie from (
        select fx.fixture_id,
          count(*) over (partition by abs(fx.kickoff_date - v_date)) > 1 tie,
          abs(fx.kickoff_date - v_date) dist
        from public.fixtures fx
        where fx.home_team_id = v_home and fx.away_team_id = v_away
          and fx.kickoff_date between v_date - 3 and v_date + 3
          and (v_league is null or fx.league_id = v_league)
        order by dist limit 1) x;
      if v_fixture is null then v_reason := 'no fixture within 3 days';
      elsif v_tie then v_reason := 'ambiguous fixture'; v_fixture := null; end if;
    end if;

    if v_reason is not null then
      n_unm := n_unm + 1;
      unmatched := unmatched || jsonb_build_object('id', rid, 'match', v_match, 'reason', v_reason);
      insert into public.broadcast_sync_unmatched (airtable_record_id, match_label, kickoff_date, home_raw, away_raw, competition_label, reason, record)
      values (coalesce(rid, 'missing-' || md5(r::text)), v_match, v_date, v_home_raw, v_away_raw, v_comp, v_reason, r)
      on conflict (airtable_record_id) do update set match_label = excluded.match_label, kickoff_date = excluded.kickoff_date,
        home_raw = excluded.home_raw, away_raw = excluded.away_raw, competition_label = excluded.competition_label,
        reason = excluded.reason, record = excluded.record, last_seen_at = now(), resolved_at = null;
      continue;
    end if;

    v_status := case when (f->'fld2ke4qZAxCzthoG'->>sel) = 'Confirmed not televised' then 'confirmed_not_televised' else 'confirmed_broadcast' end;
    v_access := case f->'fldC79K6Q8tQJEGzn'->>sel
      when 'Free' then 'free' when 'Free with compatible device' then 'free_compatible_device'
      when 'Subscription' then 'subscription' when 'PPV' then 'ppv' when 'Unknown' then 'unknown'
      else case when (f->>'fldZmTOM5AulyXZ3j')::boolean then 'ppv'
                when (f->>'fldJcv7Kh5u3HkCj8')::boolean then 'free'
                when (f->>'fldgg1RA8DF9oTFrV')::boolean then 'subscription' end end;
    v_conf := case f->'fld2paMWsFES1xcJW'->>sel
      when 'Confirmed - primary source' then 'confirmed_primary' when 'Confirmed - reliable secondary' then 'confirmed_secondary'
      when 'Probable' then 'probable' when 'Needs verification' then 'needs_verification' end;
    select coalesce(array_agg(distinct case d->>sel when 'TV channel' then 'tv_channel' when 'Streaming' then 'streaming'
      when 'FAST' then 'fast' when 'Web' then 'web' when 'App' then 'app' end) filter (where d->>sel is not null), '{}')
      into v_delivery from jsonb_array_elements(coalesce(f->'fld4n1V81E2yrUfHc', '[]'::jsonb)) d;

    v_row := null;
    v_row.fixture_id := v_fixture; v_row.market := 'GB'; v_row.status := v_status;
    v_row.airtable_record_id := rid; v_row.competition_label := v_comp;
    v_row.source := coalesce(nullif(f->>'fldfCjtvOiCOVhnCn',''), 'Airtable');
    v_row.source_url := nullif(f->>'fldBXex42rGUfLPOv','');
    v_row.verified_at := coalesce(nullif(f->>'fldfJd50DRoyC5S3D','')::timestamptz, now());
    v_row.confidence := v_conf;
    v_row.availability_notes := nullif(coalesce(f->>'fldCitDScZReOzIje', f->>'fldP2hFkflQx0r94y'),'');
    v_row.delivery_methods := '{}'; v_row.is_fast := false;
    v_row.is_free_to_air := false; v_row.is_subscription := false; v_row.is_ppv := false;
    if v_status = 'confirmed_broadcast' then
      v_row.broadcaster := coalesce(nullif(trim(f->>'fld2FM3N1abudVRXm'),''), 'Unknown');
      v_row.channel := nullif(trim(f->>'fldi4828fym50CtEk'),'');
      v_row.streaming_service := nullif(trim(f->>'fldJvGS3iqvmD568s'),'');
      v_row.service_product := nullif(trim(f->>'fldaSUf1mQ1hjlRvf'),'');
      v_row.watch_url := nullif(f->>'fldnN8HersdQmC6t2','');
      v_row.access_type := v_access;
      v_row.delivery_methods := v_delivery;
      v_row.platform_device := nullif(trim(f->>'fldzUcmQsuCu3nOjU'),'');
      v_row.is_live := coalesce((f->>'fldthqHgW0SyD7aaU')::boolean, true);
      v_row.uk_available := coalesce((f->>'fldig3IxVuSB2OY8F')::boolean, true);
      v_row.is_fast := coalesce((f->>'fldrz9HaAUpscP5dA')::boolean, false) or 'fast' = any(v_delivery);
      v_row.is_free_to_air := v_access in ('free','free_compatible_device');
      v_row.is_subscription := v_access = 'subscription';
      v_row.is_ppv := v_access = 'ppv';
    end if;

    select * into v_existing from public.fixture_broadcasts where airtable_record_id = rid;
    v_found := found;
    if not v_found then
      select * into v_existing from public.fixture_broadcasts fb
      where fb.airtable_record_id is null and fb.fixture_id = v_fixture and fb.status = v_status
        and (v_status = 'confirmed_not_televised' or lower(fb.broadcaster) = lower(v_row.broadcaster))
      order by fb.broadcast_id limit 1;
      v_found := found;
    end if;

    if not v_found then
      insert into public.fixture_broadcasts (fixture_id, market, status, broadcaster, channel, streaming_service, is_free_to_air, is_subscription, is_ppv,
        watch_url, source, source_url, verified_at, airtable_record_id, service_product, access_type, delivery_methods, platform_device,
        is_live, uk_available, is_fast, confidence, availability_notes, competition_label, last_synced_at)
      values (v_row.fixture_id, v_row.market, v_row.status, v_row.broadcaster, v_row.channel, v_row.streaming_service, v_row.is_free_to_air,
        v_row.is_subscription, v_row.is_ppv, v_row.watch_url, v_row.source, v_row.source_url, v_row.verified_at, rid, v_row.service_product,
        v_row.access_type, v_row.delivery_methods, v_row.platform_device, v_row.is_live, v_row.uk_available, v_row.is_fast, v_row.confidence,
        v_row.availability_notes, v_row.competition_label, now());
      n_ins := n_ins + 1;
    elsif (v_existing.fixture_id, v_existing.status, v_existing.broadcaster, v_existing.channel, v_existing.streaming_service,
           v_existing.service_product, v_existing.access_type, v_existing.delivery_methods, v_existing.platform_device, v_existing.is_live,
           v_existing.uk_available, v_existing.is_fast, v_existing.confidence, v_existing.availability_notes, v_existing.watch_url,
           v_existing.source, v_existing.source_url, v_existing.verified_at, v_existing.airtable_record_id)
      is not distinct from
          (v_row.fixture_id, v_row.status, v_row.broadcaster, v_row.channel, v_row.streaming_service,
           v_row.service_product, v_row.access_type, v_row.delivery_methods, v_row.platform_device, v_row.is_live,
           v_row.uk_available, v_row.is_fast, v_row.confidence, v_row.availability_notes, v_row.watch_url,
           v_row.source, v_row.source_url, v_row.verified_at, rid) then
      update public.fixture_broadcasts set last_synced_at = now() where broadcast_id = v_existing.broadcast_id;
      n_same := n_same + 1;
    else
      update public.fixture_broadcasts set fixture_id = v_row.fixture_id, status = v_row.status, broadcaster = v_row.broadcaster,
        channel = v_row.channel, streaming_service = v_row.streaming_service, is_free_to_air = v_row.is_free_to_air,
        is_subscription = v_row.is_subscription, is_ppv = v_row.is_ppv, watch_url = coalesce(v_row.watch_url, watch_url),
        source = v_row.source, source_url = v_row.source_url, verified_at = v_row.verified_at, airtable_record_id = rid,
        service_product = v_row.service_product, access_type = v_row.access_type, delivery_methods = v_row.delivery_methods,
        platform_device = v_row.platform_device, is_live = v_row.is_live, uk_available = v_row.uk_available, is_fast = v_row.is_fast,
        confidence = v_row.confidence, availability_notes = v_row.availability_notes, competition_label = v_row.competition_label,
        last_synced_at = now(), updated_at = now()
      where broadcast_id = v_existing.broadcast_id;
      n_upd := n_upd + 1;
    end if;

    synced := synced || rid;
    update public.broadcast_sync_unmatched set resolved_at = now() where airtable_record_id = rid and resolved_at is null;
  end loop;

  insert into public.broadcast_sync_runs (records_seen, inserted, updated, unchanged, kept_stronger, unmatched)
  values (n_seen, n_ins, n_upd, n_same, n_kept, n_unm) returning run_id into v_run;

  return jsonb_build_object('run_id', v_run, 'seen', n_seen, 'inserted', n_ins, 'updated', n_upd, 'unchanged', n_same,
    'kept_stronger', n_kept, 'unmatched', n_unm, 'synced_ids', to_jsonb(synced), 'unmatched_records', unmatched);
end;
$function$
;
