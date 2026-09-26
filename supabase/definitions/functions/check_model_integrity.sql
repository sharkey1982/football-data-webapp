-- Live definition exported from the database (function check_model_integrity()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_model_integrity()
 RETURNS TABLE(check_name text, status text, found bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cur as (select max(season_id) s from public.matches where league_id between 1 and 5)
  -- Incident 2026-09-23: predictions from fits later retired, or from fits
  -- dated on/after kick-off (hindsight). Played fixtures must never carry one.
  select 'played_prediction_point_in_time', case when n = 0 then 'ok' else 'failed' end, n,
    'Played fixtures this season predicted from a non-accepted fit or a fit dated on/after kick-off'
  from (select count(*) n from public.fixtures f join public.model_fit_runs r on r.fit_run_id = f.prediction_fit_run_id
        where f.season_id = (select s from cur) and f.status = 'played'
          and (r.status <> 'accepted' or r.fitted_at::date >= f.kickoff_date)) x
  union all
  select 'upcoming_prediction_from_accepted_fit', case when n = 0 then 'ok' else 'failed' end, n,
    'Upcoming fixtures predicted from a fit that is not accepted'
  from (select count(*) n from public.fixtures f join public.model_fit_runs r on r.fit_run_id = f.prediction_fit_run_id
        where f.status in ('scheduled', 'postponed') and f.kickoff_date >= current_date and r.status <> 'accepted') x
  union all
  -- Incident 2026-09-23: the June fits predicted ~30% too few goals and passed
  -- every gate. Every accepted fit from the last 7 days must reproduce its
  -- window's weighted goals within 5%.
  select 'recent_fits_scoring_level', case when n = 0 then 'ok' else 'failed' end, n,
    'Accepted fits from the last 7 days whose ratings are more than 5% off the weighted in-window goals'
  from (select count(*) n from (
          select f.fit_run_id,
            sum(power(0.5, (f.window_end_date - m.match_date::date) / f.decay_half_life_days) * exp(f.home_advantage + h.attack_strength - a.defence_strength))
              / nullif(sum(power(0.5, (f.window_end_date - m.match_date::date) / f.decay_half_life_days) * m.full_time_home_goals), 0) rh,
            sum(power(0.5, (f.window_end_date - m.match_date::date) / f.decay_half_life_days) * exp(a.attack_strength - h.defence_strength))
              / nullif(sum(power(0.5, (f.window_end_date - m.match_date::date) / f.decay_half_life_days) * m.full_time_away_goals), 0) ra
          from public.model_fit_runs f
          join public.matches m on m.league_id = f.league_id and m.match_date::date between f.window_start_date and f.window_end_date and m.full_time_home_goals is not null
          join public.team_ratings h on h.fit_run_id = f.fit_run_id and h.team_id = m.home_team_id and not coalesce(h.is_estimated, false)
          join public.team_ratings a on a.fit_run_id = f.fit_run_id and a.team_id = m.away_team_id and not coalesce(a.is_estimated, false)
          where f.status = 'accepted' and f.fitted_at > now() - interval '7 days' and not f.is_retrofit
          group by f.fit_run_id) y
        where abs(rh - 1) > 0.05 or abs(ra - 1) > 0.05) x
  union all
  -- Versioning (2026-09-23): every new fit must name the settings that made it.
  select 'new_fits_versioned', case when n = 0 then 'ok' else 'failed' end, n,
    'Fits made since versioning began with no model_version'
  from (select count(*) n from public.model_fit_runs where fitted_at > '2026-09-24' and not is_retrofit and model_version is null) x
  union all
  -- Retro-fits must be stamped as-of 23:59:59 UTC or point-in-time selection breaks.
  select 'retrofit_stamps', case when n = 0 then 'ok' else 'failed' end, n,
    'Retro-fits whose fitted_at or window end does not match their as-of date'
  from (select count(*) n from public.model_fit_runs where is_retrofit
          and (fitted_at <> (as_of_date + time '23:59:59') at time zone 'UTC' or window_end_date <> as_of_date)) x
  union all
  select 'archive_predictions_point_in_time', case when n = 0 then 'ok' else 'failed' end, n,
    'Archived-match predictions from a non-accepted fit or a fit dated on/after the match'
  from (select count(*) n from public.match_predictions mp join public.matches m using (match_id)
          join public.model_fit_runs r on r.fit_run_id = mp.fit_run_id
        where r.status <> 'accepted' or r.fitted_at::date >= m.match_date::date) x
  union all
  -- Incident 2026-09-23: a new table lacked a service_role grant and a
  -- workflow's read got a 403. Every public table must be readable by it.
  select 'service_role_can_read_tables', case when n = 0 then 'ok' else 'failed' end, n,
    'Public tables service_role cannot SELECT: ' || coalesce(names, '')
  from (select count(*) n, string_agg(c.relname, ', ') names from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
        where ns.nspname = 'public' and c.relkind = 'r' and not has_table_privilege('service_role', c.oid, 'SELECT')) x
  union all
  -- Fixtures still 'scheduled' days after kick-off: the status lag that let
  -- hindsight re-predictions through. The kick-off guard now blocks those,
  -- but a growing count means results aren't being marked played.
  -- 2026-09-25: FAILS (was a warning nobody saw). See incidents.md.
  select 'stale_scheduled_fixtures', case when n = 0 then 'ok' else 'failed' end, n,
    'Fixtures still SCHEDULED more than 3 days after kick-off (played but result missed, or postponed but not marked): ' || coalesce(ids, '')
  from (select count(*) n, string_agg(fixture_id::text, ', ' order by fixture_id) ids
        from public.fixtures where status = 'scheduled' and kickoff_date < current_date - 3) x
  union all
  select 'stale_postponed_fixtures', case when n = 0 then 'ok' else 'warning' end, n,
    'Fixtures postponed more than 3 days ago with no new date yet'
  from (select count(*) n from public.fixtures where status = 'postponed' and kickoff_date < current_date - 3) x
  union all
  select 'played_without_result', case when n = 0 then 'ok' else 'failed' end, n,
    'Fixtures PLAYED more than 3 days ago with no result in matches (no results feed for that competition, or a mapping gap): ' || coalesce(ids, '')
  from (select count(*) n, string_agg(f.fixture_id::text, ', ' order by f.fixture_id) ids
        from public.fixtures f
        where f.status = 'played' and f.kickoff_date < current_date - 3
          and not exists (select 1 from public.matches m
                          where m.league_id = f.league_id and m.season_id = f.season_id
                            and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
                            and m.match_date = f.kickoff_date)) x
  union all
  select 'cup_ingestion_current', case when n = 0 then 'ok' else 'failed' end, n,
    'Cup feed (ingest-cup-data): latest run not a full success within 30h -- ' || coalesce(why, '')
  from (select case when r.ingestion_run_id is null then 1
                    when r.status <> 'success' or r.started_at < now() - interval '30 hours' then 1 else 0 end n,
               case when r.ingestion_run_id is null then 'no run recorded'
                    else 'run ' || r.ingestion_run_id || ' ' || r.status || ' at ' || to_char(r.started_at, 'YYYY-MM-DD HH24:MI')
                         || coalesce(': ' || r.error_message, '') end why
        from (select 1) one
        left join lateral (select * from public.result_ingestion_runs
                           where source_name = 'FootballWebPages (cups)'
                           order by started_at desc limit 1) r on true) x
  union all
  select 'no_stuck_runs', case when n = 0 then 'ok' else 'failed' end, n,
    'Runs still marked running after 6h (died without recording an outcome): ' || coalesce(names, '')
  from (select count(*) n, string_agg(distinct j, ', ') names from (
          select 'pipeline_runs:' || job_name j from public.pipeline_runs where status = 'running' and started_at < now() - interval '6 hours'
          union all
          select 'fpl_ingestion_runs' from public.fpl_ingestion_runs where status = 'running' and started_at < now() - interval '6 hours'
          union all
          select 'result_ingestion_runs:' || source_name from public.result_ingestion_runs where status = 'running' and started_at < now() - interval '6 hours'
        ) s) x
  union all
  select 'unique_function_names', case when n = 0 then 'ok' else 'failed' end, n,
    'Public function names defined more than once (an ambiguous call breaks the site): ' || coalesce(names, '')
  from (select count(*) n, string_agg(proname, ', ') names from (
          select p.proname from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname = 'public' and p.prokind = 'f'
            and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
          group by p.proname having count(*) > 1) q) x
  union all
  select 'public_views_readable_by_anon', case when n = 0 then 'ok' else 'failed' end, n,
    'Public-facing views anon cannot SELECT (grants silently dropped, e.g. by CREATE OR REPLACE VIEW): ' || coalesce(names, '')
  from (select count(*) n, string_agg(v, ', ') names from (
          select unnest(array[
            'team_strength_current', 'fpl_team_strength_current', 'league_standings',
            'model_scorecard_matches'
          ]) v) q
        where not has_table_privilege('anon', ('public.' || q.v)::regclass, 'SELECT')) x
  union all
  -- Catalogue (2026-09-26): every live, non-scratch object has a description,
  -- reviewed since its definition last changed. Warning, not failure.
  select 'catalogue_current', case when n = 0 then 'ok' else 'warning' end, n,
    'Objects undocumented or changed since their catalogue entry was reviewed (see meta_catalogue_gaps): ' || coalesce(names, '')
  from (select count(*) n, string_agg(node_key, ', ' order by node_key) filter (where rn <= 10) names
        from (select node_key, row_number() over (order by node_key) rn from public.meta_catalogue_gaps) g) x;
$function$
;
