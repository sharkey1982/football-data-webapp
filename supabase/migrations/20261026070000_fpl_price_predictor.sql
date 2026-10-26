-- ============================================================================
-- FPL price changes from FPL's own predictor (Chris, 25-26 Oct 2026: "can we
-- not use the price pressure output?", "Do the price change work first").
--
-- Since 2026/27 FPL's bootstrap-static publishes, per player:
--   price_change_percent      progress to the next change; +-100 = past it
--   price_change_projections  [{offset, likelihood -5..5, projected_percent}],
--                             offset 0 = FPL's projection at its next update
--   price_change_hourly_rate, price_change_locked_until, price_change_calibrating
-- We have stored these in fpl_players / fpl_player_snapshots.source_payload
-- since 13 Sep 2026. Checked against what happened (43 nights, evening
-- snapshot v the next day's price): +100% or more rose 48 of 48; -100% or
-- less fell 248 of 251; 68 of 69 rises and 300 of 303 falls had +-90% the
-- evening before. Projection past 100 while the current figure is not:
-- 68% (rises) and 62% (falls). 90-99% without that: 21% and 7%.
-- Our own net-transfers / ownership "pressure" ranking had 4% of its top-3
-- risers right, so it goes.
--
-- 1. get_price_change_risk is rebuilt on FPL's figures. Same columns as
--    before (the FPL hub, player pages, scout table and trivia use it), with
--    pressure = FPL's progress % and direction its sign, plus the new
--    columns. Players at 50%+ either way, or projected past 100.
-- 2. A late-evening FPL refresh (21:47 UTC: 21:47 UK in winter, 22:47 in
--    summer), so the last reading of the day is close to the overnight change.
-- 3. fpl_price_predictor_nights: each night's reading for players near the
--    line or whose price changed, and the price the next morning. Filled at
--    06:40 UTC; backfilled here from the snapshots. Gives the page its
--    "changed last night" list and the running record.
-- ============================================================================

-- ---- 1. Rebuilt on FPL's predictor ----------------------------------------
drop function if exists public.get_price_change_risk(bigint);
create function public.get_price_change_risk(p_season_id bigint default public.fpl_current_season_id())
returns table(fpl_player_id bigint, web_name text, slug text, team_name text, position_label text,
              price numeric, ownership numeric, transfers_in integer, transfers_out integer, net_transfers integer,
              pressure numeric, direction text,
              progress numeric, projected_next numeric, likelihood integer, hourly_rate numeric,
              locked_until timestamptz, calibrating boolean, outlook text, updated_at timestamptz)
language sql stable set search_path = public, pg_temp as $$
  with c as (
    select p.*, sp,
           nullif(sp->>'price_change_percent', '')::numeric pct,
           nullif(sp->'price_change_projections'->0->>'projected_percent', '')::numeric p0,
           nullif(sp->'price_change_projections'->0->>'likelihood', '')::int lk,
           case when sp->>'price_change_locked_until' ~ '^\d{4}-\d{2}-\d{2}' then (sp->>'price_change_locked_until')::timestamptz end lck,
           coalesce((sp->>'price_change_calibrating')::boolean, false) cal,
           coalesce(nullif(sp->>'transfers_in_event', '')::int, 0) t_in,
           coalesce(nullif(sp->>'transfers_out_event', '')::int, 0) t_out
      from public.fpl_players p
      cross join lateral (select p.source_payload sp) x
     where p.season_id = p_season_id and p.web_name is not null)
  select c.fpl_player_id::bigint, c.web_name, c.slug, t.display_name,
         case c.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
         round(c.now_cost / 10.0, 1), round(c.selected_by_percent::numeric, 1),
         c.t_in, c.t_out, c.t_in - c.t_out,
         round(c.pct, 1),
         case when coalesce(nullif(c.pct, 0), c.p0) > 0 then 'rise' else 'fall' end,
         round(c.pct, 1), round(c.p0, 1), c.lk, nullif(c.sp->>'price_change_hourly_rate', '')::numeric,
         c.lck, c.cal,
         case when c.cal then 'calibrating'
              when abs(c.pct) >= 100 then 'expected'
              when abs(coalesce(c.p0, 0)) >= 100 then 'possible'
              when abs(c.pct) >= 90 then 'close'
              else 'building' end,
         c.updated_at
    from c
    left join public.teams t on t.team_id = c.canonical_team_id
   where c.pct is not null
     and (abs(c.pct) >= 50 or abs(coalesce(c.p0, 0)) >= 100)
     and (c.lck is null or c.lck <= now())
   order by abs(c.pct) desc, c.fpl_player_id;
$$;
revoke all on function public.get_price_change_risk(bigint) from public;
grant execute on function public.get_price_change_risk(bigint) to anon, authenticated, service_role;

-- ---- 2. Late-evening refresh ------------------------------------------------
select cron.schedule('fpl-refresh-late-evening', '47 21 * * *', 'select private.refresh_fpl();');

-- ---- 3. Each night's reading and what happened ------------------------------
create table if not exists public.fpl_price_predictor_nights (
  season_id bigint not null,
  night date not null,                 -- the evening of the reading; the change comes just after midnight
  fpl_player_id integer not null,
  progress numeric,                    -- FPL's price_change_percent at the evening reading
  projected_next numeric,              -- FPL's projection for its next update (offset 0)
  likelihood integer,
  ownership numeric,
  captured_at timestamptz not null,    -- when the evening reading was taken
  price_before integer not null,       -- now_cost, tenths of a million
  price_after integer not null,        -- the next morning
  recorded_at timestamptz not null default now(),
  primary key (season_id, night, fpl_player_id)
);
alter table public.fpl_price_predictor_nights enable row level security;
revoke all on public.fpl_price_predictor_nights from anon, authenticated;
comment on table public.fpl_price_predictor_nights is
  'FPL price predictor reading each evening (players at +-90%, projected past 100, or whose price changed) and the next morning''s price. Filled by private.record_fpl_price_predictor at 06:40 UTC.';

create or replace function private.record_fpl_price_predictor(p_night date default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_night date := coalesce(p_night, (now() at time zone 'Europe/London')::date - 1);
  n integer;
begin
  insert into public.fpl_price_predictor_nights as r
    (season_id, night, fpl_player_id, progress, projected_next, likelihood, ownership, captured_at, price_before, price_after)
  select s.season_id, s.snapshot_date, s.fpl_player_id,
         nullif(s.source_payload->>'price_change_percent', '')::numeric,
         nullif(s.source_payload->'price_change_projections'->0->>'projected_percent', '')::numeric,
         nullif(s.source_payload->'price_change_projections'->0->>'likelihood', '')::int,
         s.selected_by_percent, s.captured_at, s.now_cost, m.now_cost
    from public.fpl_player_snapshots s
    join public.fpl_player_snapshots m on m.season_id = s.season_id and m.fpl_player_id = s.fpl_player_id
                                      and m.snapshot_date = s.snapshot_date + 1
   where s.season_id = v_season and s.snapshot_date = v_night
     and s.source_payload ? 'price_change_percent'
     and (abs(nullif(s.source_payload->>'price_change_percent', '')::numeric) >= 90
          or abs(coalesce(nullif(s.source_payload->'price_change_projections'->0->>'projected_percent', '')::numeric, 0)) >= 100
          or m.now_cost <> s.now_cost)
  on conflict (season_id, night, fpl_player_id) do update set
    progress = excluded.progress, projected_next = excluded.projected_next, likelihood = excluded.likelihood,
    ownership = excluded.ownership, captured_at = excluded.captured_at,
    price_before = excluded.price_before, price_after = excluded.price_after, recorded_at = now();
  get diagnostics n = row_count;
  return jsonb_build_object('night', v_night, 'rows', n);
end;
$$;
revoke all on function private.record_fpl_price_predictor(date) from public, anon, authenticated;

-- Backfill every night we hold (safe to re-run: upsert).
do $$
declare d date;
begin
  for d in
    select distinct snapshot_date from public.fpl_player_snapshots
     where season_id = public.fpl_current_season_id() and source_payload ? 'price_change_percent'
       and snapshot_date < (now() at time zone 'Europe/London')::date
     order by 1
  loop
    perform private.record_fpl_price_predictor(d);
  end loop;
end $$;

select cron.schedule('fpl-price-predictor-record', '40 6 * * *', 'select private.record_fpl_price_predictor();');

-- How often FPL's predictor was right over the last p_days nights.
create or replace function public.get_price_predictor_record(p_season_id bigint default public.fpl_current_season_id(), p_days integer default 28)
returns table(from_night date, to_night date, nights integer,
              expected_rises integer, rose integer, expected_falls integer, fell integer,
              possible integer, possible_changed integer,
              rises integer, rises_expected integer, falls integer, falls_expected integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with r as (
    select * from public.fpl_price_predictor_nights
     where season_id = p_season_id
       and night > (select max(night) from public.fpl_price_predictor_nights where season_id = p_season_id) - greatest(p_days, 1))
  select min(night), max(night), count(distinct night)::int,
         count(*) filter (where progress >= 100)::int,
         count(*) filter (where progress >= 100 and price_after > price_before)::int,
         count(*) filter (where progress <= -100)::int,
         count(*) filter (where progress <= -100 and price_after < price_before)::int,
         count(*) filter (where abs(progress) < 100 and abs(coalesce(projected_next, 0)) >= 100)::int,
         count(*) filter (where abs(progress) < 100 and abs(coalesce(projected_next, 0)) >= 100
                            and sign(price_after - price_before) = sign(projected_next))::int,
         count(*) filter (where price_after > price_before)::int,
         count(*) filter (where price_after > price_before and progress >= 100)::int,
         count(*) filter (where price_after < price_before)::int,
         count(*) filter (where price_after < price_before and progress <= -100)::int
    from r;
$$;
revoke all on function public.get_price_predictor_record(bigint, integer) from public;
grant execute on function public.get_price_predictor_record(bigint, integer) to anon, authenticated, service_role;

-- Price changes on the most recent night(s) we have recorded.
create or replace function public.get_price_changes_recent(p_season_id bigint default public.fpl_current_season_id(), p_nights integer default 1)
returns table(night date, fpl_player_id bigint, web_name text, slug text, team_name text, position_label text,
              price_before numeric, price_after numeric, ownership numeric, progress numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with nights as (
    select distinct night from public.fpl_price_predictor_nights
     where season_id = p_season_id order by night desc limit greatest(p_nights, 1))
  select r.night, r.fpl_player_id::bigint, p.web_name, p.slug, t.display_name,
         case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
         round(r.price_before / 10.0, 1), round(r.price_after / 10.0, 1), round(r.ownership, 1), round(r.progress, 1)
    from public.fpl_price_predictor_nights r
    join nights n on n.night = r.night
    join public.fpl_players p on p.season_id = r.season_id and p.fpl_player_id = r.fpl_player_id
    left join public.teams t on t.team_id = p.canonical_team_id
   where r.season_id = p_season_id and r.price_after <> r.price_before
   order by r.night desc, (r.price_after > r.price_before) desc, r.ownership desc nulls last;
$$;
revoke all on function public.get_price_changes_recent(bigint, integer) from public;
grant execute on function public.get_price_changes_recent(bigint, integer) to anon, authenticated, service_role;

-- ---- 4. X: tonight's expected changes (draft only) --------------------------
-- After the late-evening refresh: players owned by 5%+ that FPL's predictor
-- has past the line (+-100%), so expected to change overnight. Stated as
-- FPL's estimate, with the predictor's record over the last 4 weeks. Not in
-- auto_post_types: a draft for Chris until he decides.
alter table public.social_post_candidates drop constraint social_post_candidates_post_type_check;
alter table public.social_post_candidates add constraint social_post_candidates_post_type_check check (post_type = any (array[
  'fpl_captaincy', 'team_xg_change', 'prediction_accuracy', 'historical_insight', 'announcement', 'fpl_price_changes',
  'gameweek_thread', 'fpl_availability', 'fpl_market', 'fpl_week_changes', 'gameweek_outlook', 'fixture_moved',
  'match_predictions', 'quiz', 'quiz_answer', 'fact', 'daily_market', 'lineup_vs_model', 'team_news', 'fpl_price_watch']));

create or replace function private.social_detect_price_watch(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_now timestamp := now() at time zone 'Europe/London';
  v_today date := (now() at time zone 'Europe/London')::date;
  v_key text; v_ts timestamptz; v_rows jsonb; v_rec record; v_head text; v_tail text; v_text text; v_id bigint;
  v_n integer;
begin
  if extract(hour from v_now) < 22 then
    return jsonb_build_object('status', 'none', 'reason', 'made after the late-evening FPL refresh (22:00-23:59 UK)');
  end if;
  v_key := format('fpl_price_watch:%s:%s', v_season, v_today);
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'already made today');
  end if;
  select max(updated_at) into v_ts from public.fpl_players where season_id = v_season;
  if v_ts is null or v_ts < now() - interval '90 minutes' then
    return jsonb_build_object('status', 'rejected', 'checks', jsonb_build_array(
      private.social_check('FPL players refreshed in the last 90 minutes', false, jsonb_build_object('updated_at', v_ts))));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', r.web_name, 'team', coalesce(ft.name, r.team_name), 'price', r.price,
                                               'own', r.ownership, 'progress', r.progress, 'dir', r.direction)
                            order by r.direction desc, r.ownership desc), '[]')
    into v_rows
    from public.get_price_change_risk(v_season) r
    join public.fpl_players p on p.season_id = v_season and p.fpl_player_id = r.fpl_player_id
    left join public.fpl_teams ft on ft.season_id = v_season and ft.fpl_team_id = p.fpl_team_id
   where r.outlook = 'expected' and r.ownership >= 5;
  if jsonb_array_length(v_rows) = 0 then
    return jsonb_build_object('status', 'none', 'reason', 'no player owned by 5%+ past the line');
  end if;

  select * into v_rec from public.get_price_predictor_record(v_season, 28);
  v_head := format('FPL''s own price predictor, %s: past the line, so expected to change overnight (FPL''s estimate, not ours)',
                   to_char(v_ts at time zone 'Europe/London', 'FMHH24:MI'));
  v_tail := case when coalesce(v_rec.nights, 0) >= 7 and v_rec.expected_rises + v_rec.expected_falls > 0 then
    format(E'\n\nLast %s nights: %s of %s such calls came true.', v_rec.nights,
           v_rec.rose + v_rec.fell, v_rec.expected_rises + v_rec.expected_falls) else '' end;

  v_n := jsonb_array_length(v_rows);
  loop
    select v_head
           || coalesce(E'\n\nRise: ' || string_agg(format('%s (%s, £%sm, %s%%)', x->>'name', x->>'team', x->>'price', round((x->>'own')::numeric)), ', ' order by ord) filter (where x->>'dir' = 'rise'), '')
           || coalesce(E'\n\nFall: ' || string_agg(format('%s (%s, £%sm, %s%%)', x->>'name', x->>'team', x->>'price', round((x->>'own')::numeric)), ', ' order by ord) filter (where x->>'dir' = 'fall'), '')
           || case when v_n < jsonb_array_length(v_rows) then format(E'\n+%s more owned by 5%%+', jsonb_array_length(v_rows) - v_n) else '' end
           || v_tail
      into v_text
      from (select x, ord from jsonb_array_elements(v_rows) with ordinality t(x, ord)
             order by (x->>'own')::numeric desc limit v_n) s;
    exit when public.social_weighted_length(v_text) <= 280 or v_n = 1;
    v_n := v_n - 1;
  end loop;
  if public.social_weighted_length(v_text) > 280 then
    return jsonb_build_object('status', 'rejected', 'reason', 'post is over 280 characters');
  end if;

  insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('fpl_price_watch', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'date', v_today, 'players', v_rows, 'record', to_jsonb(v_rec)),
          v_ts, v_key, ((v_today + 1)::timestamp - interval '5 minutes') at time zone 'Europe/London', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'fpl_price_watch', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id);
end;
$$;
revoke all on function private.social_detect_price_watch(bigint) from public, anon, authenticated;

create or replace function pg_temp.social_patch(p_sig text, p_old text, p_new text) returns void language plpgsql as $f$
declare d text; n integer;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_new in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, p_old, ''))) / length(p_old);
  if n <> 1 then raise exception 'social_patch: % anchor found % times: %', p_sig, n, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end;
$f$;
select pg_temp.social_patch('public.social_run_detectors(text)',
  $o$'quiz', 'fact', 'daily_market'] loop$o$,
  $n$'quiz', 'fact', 'daily_market', 'price_watch'] loop$n$);
