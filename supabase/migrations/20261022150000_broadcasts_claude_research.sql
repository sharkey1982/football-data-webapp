-- ============================================================================
-- UK TV broadcasts: Airtable removed, replaced by researched submissions
-- (22 Oct 2026, audit findings P-03 / DQ-04).
--
-- The Airtable sync (pg_cron 'sync-airtable-broadcasts-3-hourly') failed on
-- every run from 18 Oct 18:40 with HTTP 429: the free plan's monthly API cap
-- was used up (about 60 calls a day). Chris decided to drop Airtable. UK TV
-- information now comes from a scheduled Claude task that researches official
-- broadcaster and league sources and submits rows as a migration file calling
-- public.ingest_broadcasts(). The procedure is docs/broadcast-research.md.
--
-- Changes:
-- 1. broadcast_sync_runs gets source ('airtable' for history,
--    'claude_research' from now), label and removed.
-- 2. public.match_broadcast_fixture(): the matching core of the old
--    sync_airtable_broadcasts (team resolution, competition mapping, nearest
--    fixture within 3 days, exact-date fallback across competitions), now
--    shared and free of Airtable field ids. Accepts a league code, league
--    name or broadcast_competition_map label; kick-off time breaks ties.
-- 3. public.ingest_broadcasts(p_rows jsonb, p_label text): validates and
--    upserts researched rows (natural key fixture + market + status +
--    broadcaster/channel). Never deletes a row the input does not name,
--    except with "remove": true. Logs one broadcast_sync_runs row and
--    returns matched / unmatched counts with reasons. service_role only.
-- 4. resolve_broadcast_team(): team aliases with source_name 'broadcasts'
--    (new) or 'Airtable' (the 19 existing ones) are tried first.
-- 5. Airtable removed: cron job unscheduled, sync_airtable_broadcasts_from_api
--    and sync_airtable_broadcasts dropped, Vault secret airtable_token deleted.
--    fixture_broadcasts.airtable_record_id stays as history; nothing reads it
--    except apply_uk_3pm_blackout (rule rows have it null, as before).
-- 6. Monitoring: job_registry retires the Airtable job and registers
--    'broadcast-research' (location claude_task); job_runs_unified names
--    broadcast runs by source; public.check_broadcast_integrity() (new
--    integrity area 'broadcasts'): research freshness (warn 5 days, fail 9),
--    Premier League / EFL / Carabao Cup fixtures in the next 10 days with no
--    GB decision, unplaced submitted rows for upcoming games.
-- 7. Catalogue entries (meta_flow_nodes) rewritten.
--
-- The Airtable data could not be exported first: the Airtable API (and the
-- connector, which uses it) refuses every call until the monthly cap resets.
-- The site already holds every record synced up to 18 Oct 15:40; anything
-- added in Airtable after that is covered by the first research run.
-- Safe to re-run.
-- ============================================================================

-- 1. Run log ------------------------------------------------------------------

alter table public.broadcast_sync_runs add column if not exists source text;
alter table public.broadcast_sync_runs add column if not exists label text;
alter table public.broadcast_sync_runs add column if not exists removed integer not null default 0;
update public.broadcast_sync_runs set source = 'airtable' where source is null;
alter table public.broadcast_sync_runs alter column source set default 'claude_research';
alter table public.broadcast_sync_runs alter column source set not null;

-- 2. Team resolution ------------------------------------------------------------

create or replace function public.resolve_broadcast_team(p_raw text)
 returns bigint
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  with c as (
    select 1 lvl, team_id from public.team_aliases where source_name in ('broadcasts', 'Airtable') and raw_name = p_raw
    union all select 2, team_id from public.teams where lower(canonical_name) = lower(p_raw) or lower(display_name) = lower(p_raw)
    union all select 3, team_id from public.team_aliases where raw_name = p_raw
  ), lv as (
    select lvl, min(team_id) team_id, count(distinct team_id) n from c group by lvl
  )
  select team_id from lv where n = 1 order by lvl limit 1;
$function$;

-- 3. Shared matching core -------------------------------------------------------

create or replace function public.match_broadcast_fixture(
  p_competition text, p_home text, p_away text, p_date date, p_time time default null)
 returns table (fixture_id bigint, league_code text, reason text)
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_variable
declare
  v_comp text := nullif(trim(p_competition), '');
  v_home_raw text := nullif(trim(p_home), '');
  v_away_raw text := nullif(trim(p_away), '');
  v_code text; v_league bigint; v_home bigint; v_away bigint;
  v_fixture bigint; v_n int; v_reason text;
begin
  if p_date is null or v_home_raw is null or v_away_raw is null then
    return query select null::bigint, null::text, 'missing kickoff date or team'::text;
    return;
  end if;

  -- Competition: league code, league name, or a broadcast_competition_map label.
  if v_comp is not null then
    select l.code, l.league_id into v_code, v_league from public.leagues l
     where upper(l.code) = upper(v_comp) or lower(l.name) = lower(v_comp)
     order by (upper(l.code) = upper(v_comp)) desc limit 1;
    if v_code is null then
      v_code := (select m.league_code from public.broadcast_competition_map m where lower(m.label) = lower(v_comp) order by m.label limit 1);
      v_league := (select l.league_id from public.leagues l where l.code = v_code);
    end if;
  end if;

  v_home := public.resolve_broadcast_team(v_home_raw);
  v_away := public.resolve_broadcast_team(v_away_raw);
  if v_home is null then v_reason := 'unknown team: ' || v_home_raw; end if;
  if v_away is null then v_reason := coalesce(v_reason || '; ', '') || 'unknown team: ' || v_away_raw; end if;
  if v_comp is not null and v_code is null then
    v_reason := coalesce(v_reason || '; ', '') ||
      case when exists (select 1 from public.broadcast_competition_coverage c where lower(c.label) = lower(v_comp))
           then 'competition not covered by site fixtures: ' else 'competition not mapped: ' end || v_comp;
  elsif v_code is not null and v_league is null then
    v_reason := coalesce(v_reason || '; ', '') || 'competition not in database: ' || v_comp;
  end if;
  if v_reason is not null then
    return query select null::bigint, v_code, v_reason;
    return;
  end if;

  -- Nearest fixture of these two teams within 3 days in the competition; a
  -- matching kick-off time breaks a tie in distance.
  with cand as (
    select fx.fixture_id fid, abs(fx.kickoff_date - p_date) dist,
           (p_time is not null and fx.kickoff_time = p_time) tmatch
    from public.fixtures fx
    where fx.home_team_id = v_home and fx.away_team_id = v_away
      and fx.kickoff_date between p_date - 3 and p_date + 3
      and (v_league is null or fx.league_id = v_league)
  ), best as (select * from cand order by dist, tmatch desc, fid limit 1)
  select b.fid, (select count(*) from cand c where c.dist = b.dist and c.tmatch = b.tmatch)
    into v_fixture, v_n from best b;

  -- Nothing in the named competition: both teams on the EXACT date, unique
  -- across competitions (a mislabelled row). No tolerance, no partial match.
  if v_fixture is null and v_league is not null then
    select min(fx.fixture_id), count(*) into v_fixture, v_n from public.fixtures fx
     where fx.home_team_id = v_home and fx.away_team_id = v_away and fx.kickoff_date = p_date;
  end if;

  if v_fixture is null then v_reason := 'no fixture within 3 days';
  elsif v_n > 1 then v_reason := 'ambiguous fixture'; v_fixture := null; end if;

  return query select v_fixture, v_code, v_reason;
end;
$function$;

revoke all on function public.match_broadcast_fixture(text, text, text, date, time) from public, anon, authenticated;
grant execute on function public.match_broadcast_fixture(text, text, text, date, time) to service_role;

-- 4. Ingest ---------------------------------------------------------------------
--
-- One JSON object per row (docs/broadcast-research.md has the full contract):
--   competition       required  league code (E0, UCL ...), league name or map label
--   home_team         required  as the source names it; resolved by resolve_broadcast_team
--   away_team         required
--   kickoff_date      required  UK date, YYYY-MM-DD
--   kickoff_time      optional  UK time, HH:MM (tie-break, and a warning when it
--                               differs from the stored fixture)
--   market            optional  'GB' (default; the only market the site shows)
--   status            required  'confirmed_broadcast' | 'confirmed_not_televised'
--   broadcaster       required for confirmed_broadcast (e.g. 'Sky Sports')
--   channel, streaming_service, service_product, platform_device   optional text
--   access_type       optional  free | free_compatible_device | subscription | ppv | unknown
--   is_free_to_air, is_subscription, is_ppv   optional booleans; used only when
--                               access_type is absent (access_type wins)
--   delivery_methods  optional  array of tv_channel | streaming | fast | web | app
--                               (default: tv_channel if channel, streaming if streaming_service)
--   is_live, uk_available (default true), is_fast (default false)   optional booleans
--   watch_url         optional  http(s)
--   source            required  human description of the source
--   source_url        required for confirmed_broadcast, http(s)
--   verified_at       optional  timestamp (default now)
--   confidence        optional  confirmed_primary (default) | confirmed_secondary |
--                               probable | needs_verification
--   availability_notes optional text
--   remove            optional  true deletes the matching row(s) instead (removals
--                               run first, whatever their position in the array)

create or replace function public.ingest_broadcasts(p_rows jsonb, p_label text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
$function$;

revoke all on function public.ingest_broadcasts(jsonb, text) from public, anon, authenticated;
grant execute on function public.ingest_broadcasts(jsonb, text) to service_role;

-- 5. Remove Airtable -------------------------------------------------------------

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-airtable-broadcasts-3-hourly') then
    perform cron.unschedule('sync-airtable-broadcasts-3-hourly');
  end if;
end $$;

drop function if exists public.sync_airtable_broadcasts_from_api(boolean);
drop function if exists public.sync_airtable_broadcasts(jsonb);

delete from vault.secrets where name = 'airtable_token';

-- 6. Monitoring -------------------------------------------------------------------

alter table public.job_registry drop constraint if exists job_registry_location_check;
alter table public.job_registry add constraint job_registry_location_check
  check (location = any (array['supabase_cron', 'github_actions', 'edge_function', 'netlify', 'local_pc', 'claude_task']));

update public.job_registry set active = false,
  notes = 'Retired 22 Oct 2026: Airtable removed (API cap exhausted from 18 Oct). Replaced by broadcast-research.'
where job_key = 'sync-airtable-broadcasts-3-hourly';

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, output_check, notes)
values ('broadcast-research', 'broadcasts', 'claude_task', 'scheduled Claude task (claude.ai), at least weekly',
  interval '8 days 22 hours', interval '1 hour', 'broadcast_sync_runs', '^claude_research$',
  'Official broadcaster and league sources (docs/broadcast-research.md)', 'broadcast_research_fresh',
  'Each run is a migration calling ingest_broadcasts(); open unmatched rows: broadcast_unmatched_classified')
on conflict (job_key) do update set area = excluded.area, location = excluded.location, schedule = excluded.schedule,
  expected_interval = excluded.expected_interval, max_duration = excluded.max_duration, run_log = excluded.run_log,
  run_key = excluded.run_key, upstream = excluded.upstream, output_check = excluded.output_check, notes = excluded.notes, active = true;

create or replace view public.job_runs_unified as
 SELECT 'pipeline_runs'::text AS run_log,
    pipeline_runs.job_name AS run_key,
    (pipeline_runs.run_id)::text AS run_id,
    pipeline_runs.started_at,
    pipeline_runs.finished_at,
    pipeline_runs.status,
    pipeline_runs.rows_changed,
    pipeline_runs.error_message AS error
   FROM pipeline_runs
  WHERE (pipeline_runs.started_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'pg_cron'::text AS run_log,
    j.jobname AS run_key,
    (d.runid)::text AS run_id,
    d.start_time AS started_at,
    d.end_time AS finished_at,
        CASE d.status
            WHEN 'succeeded'::text THEN 'success'::text
            WHEN 'failed'::text THEN 'failed'::text
            WHEN 'running'::text THEN 'running'::text
            ELSE d.status
        END AS status,
    NULL::bigint AS rows_changed,
        CASE
            WHEN (d.status = 'failed'::text) THEN d.return_message
            ELSE NULL::text
        END AS error
   FROM (cron.job_run_details d
     JOIN cron.job j ON ((j.jobid = d.jobid)))
  WHERE (d.start_time > (now() - '30 days'::interval))
UNION ALL
 SELECT 'fixture_refresh_runs'::text AS run_log,
    'fixture_refresh'::text AS run_key,
    (fixture_refresh_runs.refresh_run_id)::text AS run_id,
    fixture_refresh_runs.started_at,
    fixture_refresh_runs.finished_at,
    fixture_refresh_runs.status,
    NULL::bigint AS rows_changed,
    fixture_refresh_runs.error_message AS error
   FROM fixture_refresh_runs
  WHERE (fixture_refresh_runs.started_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'broadcast_sync_runs'::text AS run_log,
        CASE broadcast_sync_runs.source
            WHEN 'airtable'::text THEN 'airtable_broadcasts'::text
            ELSE broadcast_sync_runs.source
        END AS run_key,
    (broadcast_sync_runs.run_id)::text AS run_id,
    broadcast_sync_runs.ran_at AS started_at,
    broadcast_sync_runs.ran_at AS finished_at,
    'success'::text AS status,
    ((COALESCE(broadcast_sync_runs.inserted, 0) + COALESCE(broadcast_sync_runs.updated, 0)))::bigint AS rows_changed,
    NULL::text AS error
   FROM broadcast_sync_runs
  WHERE (broadcast_sync_runs.ran_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'fpl_ingestion_runs'::text AS run_log,
    'refresh_fpl'::text AS run_key,
    (fpl_ingestion_runs.run_id)::text AS run_id,
    fpl_ingestion_runs.started_at,
    fpl_ingestion_runs.completed_at AS finished_at,
    fpl_ingestion_runs.status,
    NULL::bigint AS rows_changed,
    fpl_ingestion_runs.error_message AS error
   FROM fpl_ingestion_runs
  WHERE (fpl_ingestion_runs.started_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'result_ingestion_runs'::text AS run_log,
    result_ingestion_runs.source_name AS run_key,
    (result_ingestion_runs.ingestion_run_id)::text AS run_id,
    result_ingestion_runs.started_at,
    result_ingestion_runs.finished_at,
    result_ingestion_runs.status,
    (
        CASE
            WHEN ((result_ingestion_runs.matches_inserted IS NULL) AND (result_ingestion_runs.matches_changed IS NULL)) THEN NULL::integer
            ELSE (COALESCE(result_ingestion_runs.matches_inserted, 0) + COALESCE(result_ingestion_runs.matches_changed, 0))
        END)::bigint AS rows_changed,
    result_ingestion_runs.error_message AS error
   FROM result_ingestion_runs
  WHERE (result_ingestion_runs.started_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'match_import_runs'::text AS run_log,
    match_import_runs.league_code AS run_key,
    (match_import_runs.import_run_id)::text AS run_id,
    match_import_runs.started_at,
    match_import_runs.finished_at,
    match_import_runs.status,
    NULL::bigint AS rows_changed,
    match_import_runs.error_message AS error
   FROM match_import_runs
  WHERE (match_import_runs.started_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'fpl_live_runs'::text AS run_log,
    'fpl_live'::text AS run_key,
    (fpl_live_runs.run_id)::text AS run_id,
    fpl_live_runs.run_at AS started_at,
    fpl_live_runs.run_at AS finished_at,
    fpl_live_runs.status,
    (fpl_live_runs.elements_changed)::bigint AS rows_changed,
    fpl_live_runs.error
   FROM fpl_live_runs
  WHERE (fpl_live_runs.run_at > (now() - '30 days'::interval))
UNION ALL
 SELECT 'finance_ingestion_runs'::text AS run_log,
    finance_ingestion_runs.source AS run_key,
    (finance_ingestion_runs.ingestion_run_id)::text AS run_id,
    finance_ingestion_runs.started_at,
    finance_ingestion_runs.completed_at AS finished_at,
    finance_ingestion_runs.status,
    (finance_ingestion_runs.facts_extracted)::bigint AS rows_changed,
    NULL::text AS error
   FROM finance_ingestion_runs
  WHERE (finance_ingestion_runs.started_at > (now() - '30 days'::interval));

create or replace function public.check_broadcast_integrity()
 returns table(check_name text, status text, found bigint, detail text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- No submission yet counts from when the route was registered, so a task
  -- that never starts still goes red.
  select 'broadcast_research_fresh',
    case when age_days >= 9 then 'failed' when age_days >= 5 then 'warning' else 'ok' end,
    age_days::bigint,
    'Days since the last broadcast research submission (broadcast_sync_runs source claude_research; scheduled Claude task, docs/broadcast-research.md; warns at 5, fails at 9; '
      || coalesce('last ' || to_char(last_run, 'YYYY-MM-DD HH24:MI'), 'none yet, counted from set-up') || ')'
  from (select r.last_run,
               extract(day from now() - coalesce(r.last_run,
                 (select j.registered_at from public.job_registry j where j.job_key = 'broadcast-research'), now()))::int age_days
        from (select max(ran_at) last_run from public.broadcast_sync_runs where source = 'claude_research') r) x
  union all
  select 'broadcast_decisions_next_10d', case when n = 0 then 'ok' else 'warning' end, n,
    'Premier League, EFL and Carabao Cup fixtures in the next 10 days with no GB broadcast decision (no listing and not marked not televised)'
      || coalesce(': ' || sample, '')
  from (select count(*) n, string_agg(slug, ', ' order by rn) filter (where rn <= 10) sample
        from (select f.slug, row_number() over (order by f.kickoff_date, f.kickoff_time, f.slug) rn
              from public.fixtures f join public.leagues l on l.league_id = f.league_id
              where l.code in ('E0', 'E1', 'E2', 'E3', 'LC') and f.status = 'scheduled'
                and f.kickoff_date between current_date and current_date + 10
                and not exists (select 1 from public.fixture_broadcasts fb where fb.fixture_id = f.fixture_id and fb.market = 'GB')) y) x
  union all
  select 'broadcast_unmatched_upcoming', case when n = 0 then 'ok' else 'warning' end, n,
    'Submitted broadcast rows for upcoming games that ingest_broadcasts could not place (broadcast_unmatched_classified; fix the row or add a team alias, source_name broadcasts)'
  from (select count(*) n from public.broadcast_sync_unmatched u
        where u.resolved_at is null and u.airtable_record_id like 'research:%' and u.kickoff_date >= current_date
          and u.reason not like '%competition not covered%') x
$function$;

revoke all on function public.check_broadcast_integrity() from public, anon, authenticated;
grant execute on function public.check_broadcast_integrity() to service_role;

-- 7. Self-test (undone): a real upcoming fixture, ingested twice, then removed.

do $$
declare
  v_fx record; v_row jsonb; r1 jsonb; r2 jsonb; r3 jsonb; r4 jsonb; v_left int;
begin
  select f.fixture_id, ht.display_name home, at.display_name away, f.kickoff_date, l.code into v_fx
  from public.fixtures f join public.leagues l on l.league_id = f.league_id
  join public.teams ht on ht.team_id = f.home_team_id join public.teams at on at.team_id = f.away_team_id
  where l.code = 'E0' and f.status = 'scheduled' and f.kickoff_date >= current_date
    and not exists (select 1 from public.fixture_broadcasts fb where fb.fixture_id = f.fixture_id
                      and fb.status = 'confirmed_not_televised' and fb.source <> 'rule:3pm_blackout')
    and public.resolve_broadcast_team(ht.display_name) = ht.team_id and public.resolve_broadcast_team(at.display_name) = at.team_id
  order by f.kickoff_date, f.fixture_id limit 1;
  if v_fx.fixture_id is null then raise notice 'ingest_broadcasts self-test skipped: no upcoming E0 fixture'; return; end if;

  v_row := jsonb_build_object('competition', v_fx.code, 'home_team', v_fx.home, 'away_team', v_fx.away,
    'kickoff_date', v_fx.kickoff_date, 'status', 'confirmed_broadcast', 'broadcaster', 'Self-test TV', 'channel', 'Self-test 1',
    'access_type', 'subscription', 'source', 'migration self-test', 'source_url', 'https://example.org/self-test');
  begin
    r1 := public.ingest_broadcasts(jsonb_build_array(v_row,
            jsonb_build_object('competition', 'E0', 'home_team', 'Nowhere Rovers', 'away_team', v_fx.away, 'kickoff_date', v_fx.kickoff_date,
                               'status', 'confirmed_broadcast', 'broadcaster', 'X', 'source', 's', 'source_url', 'https://example.org'),
            jsonb_build_object('competition', 'E0', 'home_team', v_fx.home, 'away_team', v_fx.away, 'kickoff_date', v_fx.kickoff_date,
                               'status', 'confirmed_broadcast', 'broadcaster', 'X', 'source', 's')), 'self-test');
    r2 := public.ingest_broadcasts(jsonb_build_array(v_row), 'self-test');
    r3 := public.ingest_broadcasts(jsonb_build_array(v_row || '{"channel": "Self-test 2"}'::jsonb), 'self-test');
    r4 := public.ingest_broadcasts(jsonb_build_array(jsonb_build_object('competition', 'E0', 'home_team', v_fx.home, 'away_team', v_fx.away,
            'kickoff_date', v_fx.kickoff_date, 'status', 'confirmed_broadcast', 'broadcaster', 'Self-test TV', 'remove', true)), 'self-test');
    select count(*) into v_left from public.fixture_broadcasts where fixture_id = v_fx.fixture_id and broadcaster = 'Self-test TV';
    raise exception 'undo self-test' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'undo self-test' then raise; end if;
  end;
  if (r1->>'inserted')::int <> 1 or (r1->>'unmatched')::int <> 2 then raise exception 'self-test: first ingest %', r1; end if;
  if r1->'unmatched_rows'->0->>'reason' not like 'unknown team: Nowhere Rovers%' then raise exception 'self-test: reason %', r1->'unmatched_rows'; end if;
  if r1->'unmatched_rows'->1->>'reason' not like '%source_url%' then raise exception 'self-test: reason %', r1->'unmatched_rows'; end if;
  if (r2->>'unchanged')::int <> 1 or (r2->>'inserted')::int <> 0 then raise exception 'self-test: re-ingest not idempotent %', r2; end if;
  if (r3->>'updated')::int <> 1 or (r3->>'inserted')::int <> 0 then raise exception 'self-test: channel change %', r3; end if;
  if (r4->>'removed')::int <> 1 or v_left <> 0 then raise exception 'self-test: remove % left %', r4, v_left; end if;
end $$;

-- 8. Catalogue ----------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.meta_refresh_flow()') is not null then
    perform public.meta_refresh_flow();
    update public.meta_flow_nodes set layer = 'broadcast', status = 'current', is_public = false, ai_relevant = false,
      purpose = 'Loads researched UK TV rows into fixture_broadcasts: validates each JSON row (competition, teams, UK date and optional time, status, broadcaster/channel, access, source, source_url required for listings), places it on a fixture with match_broadcast_fixture(), and upserts on fixture + market + status + broadcaster/channel. Never deletes a row the input does not name, except rows with "remove": true. Unplaced rows go to broadcast_sync_unmatched (key research:<md5>) with a reason; logs one broadcast_sync_runs row (source claude_research) and returns matched/unmatched counts, reasons and kick-off mismatches. service_role only.',
      refresh_note = 'Called from migration files written by the scheduled Claude broadcast research task (docs/broadcast-research.md), applied on merge by apply-migrations.yml. Ends with apply_uk_3pm_blackout().',
      purpose_reviewed_at = now()
    where node_key = 'function:ingest_broadcasts(p_rows jsonb, p_label text)';
    update public.meta_flow_nodes set layer = 'broadcast', status = 'current', is_public = false, ai_relevant = false,
      purpose = 'Places one broadcast row on a fixture: competition as league code, league name or broadcast_competition_map label; both teams via resolve_broadcast_team; the nearest fixture of the pair within 3 days in that competition (kick-off time breaks ties), else a unique fixture of the pair on the exact date in any competition. Returns fixture_id, league_code and a reason when it cannot place it (unknown team, competition not covered / not mapped, no or ambiguous fixture).',
      refresh_note = 'Called by ingest_broadcasts() for every row.',
      purpose_reviewed_at = now()
    where node_key = 'function:match_broadcast_fixture(p_competition text, p_home text, p_away text, p_date date, p_time time without time zone)';
    update public.meta_flow_nodes set layer = 'operations', status = 'current', is_public = false, ai_relevant = false,
      purpose = 'Integrity area broadcasts: days since the last claude_research submission (warn 5, fail 9), Premier League / EFL / Carabao Cup fixtures in the next 10 days with no GB broadcast decision, unplaced submitted rows for upcoming games.',
      refresh_note = 'Called by scripts/run_integrity_checks.py (integrity-checks.yml, 09:45 UTC).',
      purpose_reviewed_at = now()
    where node_key = 'function:check_broadcast_integrity()';
    update public.meta_flow_nodes set
      purpose = 'Maps a free-text team name from a broadcast source to a team_id: tries a team alias with source_name ''broadcasts'' (or the older ''Airtable'' ones), then canonical/display name (case-insensitive), then any other source''s alias; a level counts only if it identifies exactly one club, otherwise NULL (ambiguous names are reported, never guessed).',
      refresh_note = 'Called by match_broadcast_fixture() for each row''s home and away team.', purpose_reviewed_at = now()
    where node_key = 'function:resolve_broadcast_team(p_raw text)';
    update public.meta_flow_nodes set
      refresh_note = 'Researched rows via ingest_broadcasts() (scheduled Claude task, docs/broadcast-research.md, submitted as migrations); until 18 Oct 2026 from the Airtable UK Broadcasts base (airtable_record_id kept as history). Rows are only deleted by an explicit remove row. Rule rows are added and removed by apply_uk_3pm_blackout() (end of each ingest and pg_cron ''apply-uk-3pm-blackout-daily''). Admins can also write directly (RLS is_admin()).',
      purpose_reviewed_at = now()
    where node_key = 'object:fixture_broadcasts';
    update public.meta_flow_nodes set
      purpose = 'Lookup from broadcast competition labels (e.g. ''Carabao Cup'', ''Champions League'') to FixtureShark league codes (LC, UCL...). One row per label. Used by match_broadcast_fixture to restrict matching to the right competition; a league code or league name also works without a row here.',
      purpose_reviewed_at = now()
    where node_key = 'object:broadcast_competition_map';
    update public.meta_flow_nodes set
      purpose = 'Broadcast rows that could not be attached to a fixture (unknown team, unmapped or uncovered competition, no/ambiguous fixture, invalid row): one row per key with the reason and the full submitted row. Key column airtable_record_id holds the Airtable record id for rows before 22 Oct 2026 and research:<md5> for submitted rows. resolved_at is set when a later submission places the same row. Admin-only (RLS).',
      refresh_note = 'Upserted by ingest_broadcasts(); history from the retired Airtable sync.', purpose_reviewed_at = now()
    where node_key = 'object:broadcast_sync_unmatched';
    update public.meta_flow_nodes set
      purpose = 'Run log of broadcast loads: one row per ingest_broadcasts call (source claude_research, label, seen, inserted, updated, unchanged, removed, unmatched, notes); older rows are the Airtable sync (source airtable, retired 22 Oct 2026). kept_stronger is always 0. Admin-only (RLS).',
      refresh_note = 'Inserted by ingest_broadcasts(). Monitored by job_registry ''broadcast-research'' and check_broadcast_integrity().', purpose_reviewed_at = now()
    where node_key = 'object:broadcast_sync_runs';
    update public.meta_flow_nodes set
      refresh_note = 'Called at the end of every ingest_broadcasts() (after listings are written) and by pg_cron ''apply-uk-3pm-blackout-daily'' (04:25 UTC, after the 04:15 fixture refresh). Rows follow fixture kick-off times, so a wrong kickoff_time gives a wrong row.',
      purpose_reviewed_at = now()
    where node_key = 'function:apply_uk_3pm_blackout()';
    update public.meta_flow_nodes set purpose_reviewed_at = now()
    where node_key in ('object:job_runs_unified', 'object:job_registry');
  end if;
end $$;
