-- Live definition exported from the database (function check_model_integrity()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_model_integrity()
 RETURNS TABLE(check_name text, status text, found bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cur as (select se.season_id s from public.seasons se
                where se.start_year = (select max(sm.start_year) from public.seasons sm
                                        where sm.season_id in (select m.season_id from public.matches m where m.league_id between 1 and 5)))
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
    'Runs still marked running past their job''s max_duration (job_registry; 6h if unregistered): ' || coalesce(names, '')
  from (select count(*) n, string_agg(distinct j, ', ') names from (
          select 'pipeline_runs:' || p.job_name j from public.pipeline_runs p where p.status = 'running' and p.started_at < now() - coalesce((select min(r.max_duration) from public.job_registry r where r.run_log = 'pipeline_runs' and p.job_name ~ r.run_key), interval '6 hours')
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
            'model_scorecard_matches', 'history_streaks', 'history_league_matches', 'team_season_summary', 'league_season_summary', 'league_pace_benchmarks', 'league_table_reliability'
          ]) v) q
        where not has_table_privilege('anon', ('public.' || q.v)::regclass, 'SELECT')) x
  union all
  -- Season rollover (2026-09-27): see docs/season-rollover.md.
  select 'season_rollover_ready',
    case when sr.cov is null or sr.fpl_ahead > 0 then 'failed'
         when sr.nxt is null and current_date >= make_date(sr.sy + 1, 3, 1) then 'warning'
         when current_date between make_date(extract(year from current_date)::int, 6, 15)
                               and make_date(extract(year from current_date)::int, 7, 31) then 'warning'
         else 'ok' end,
    sr.fpl_ahead,
    case when sr.cov is null then 'No seasons row covers today, so current_season_id() is stuck on ' || sr.lbl || '. Add next season''s row (docs/season-rollover.md).'
         when sr.fpl_ahead > 0 then sr.fpl_ahead || ' FPL gameweek(s) with a deadline after their season ended are stored under the old season: private.refresh_fpl() loaded the new FPL game before 1 August. See docs/season-rollover.md.'
         when sr.nxt is null and current_date >= make_date(sr.sy + 1, 3, 1) then 'Next season (' || (sr.sy + 1) || '/' || right((sr.sy + 2)::text, 2) || ') has no seasons row; add it now: the Norwegian, Swedish and Finnish seasons that start this spring are stored under it (docs/season-rollover.md).'
         when current_date between make_date(extract(year from current_date)::int, 6, 15)
                               and make_date(extract(year from current_date)::int, 7, 31)
           then 'Until 1 August private.refresh_fpl() stores FPL data under last season. Once FPL relaunches, pause cron jobs fpl-refresh-6-hourly and fpl-live-current-6-hourly until 1 August (docs/season-rollover.md).'
         else 'Current season ' || sr.lbl || ' is covered' || case when sr.nxt is null then '; next season''s row is not needed until 1 March' else ' and next season''s row exists' end || '.' end
  from (select c.cov, s.start_year sy, s.start_year || '/' || right(s.end_year::text, 2) lbl,
               (select n.season_id from public.seasons n where n.start_year = s.start_year + 1) nxt,
               (select count(*) from public.fpl_gameweeks g join public.seasons gs on gs.season_id = g.season_id
                 where g.deadline_time >= make_date(gs.start_year + 1, 7, 1)) fpl_ahead
          from (select public.season_id_for_date(current_date) cov) c
          join public.seasons s on s.season_id = public.current_season_id()) sr
  union all
  -- Split formats (2026-09-27): league_standings needs a league_season_formats
  -- row for every split-format season; warn once a season is past its split
  -- without one.
  select 'split_formats_configured', case when n = 0 then 'ok' else 'warning' end, n,
    'League-seasons past their split with no league_season_formats row (ranked on total points): ' || coalesce(names, '')
  from (select count(*) n, string_agg(ls, ', ' order by ls) names from (
          select distinct l.code || ' ' || se.label ls
          from public.matches m
          join public.seasons se on se.season_id = m.season_id
          join public.leagues l on l.league_id = m.league_id
          join lateral (select f.regular_meetings from public.league_season_formats f
                        join public.seasons fs on fs.season_id = f.season_id
                        where f.league_id = m.league_id and f.format = 'split' and fs.start_year < se.start_year
                        order by fs.start_year desc limit 1) prev on true
          where m.league_id in (select f.league_id from public.league_season_formats f where f.format = 'split')
            and not exists (select 1 from public.league_season_formats f2
                            where f2.league_id = m.league_id and f2.season_id = m.season_id)
          group by l.code, se.label, least(m.home_team_id, m.away_team_id), greatest(m.home_team_id, m.away_team_id), prev.regular_meetings
          having count(*) > prev.regular_meetings) q) x
  union all
  -- History layer (2026-09-27): each team's latest team_match_snapshot row
  -- must equal its league_standings row. Split formats excluded (halving).
  select 'history_snapshot_reconciles', case when n = 0 then 'ok' else 'failed' end, n,
    'Team-seasons whose latest team_match_snapshot row disagrees with league_standings (run refresh_history_derived(true)): ' || coalesce(names, '')
  from (select count(*) n, string_agg(l.league_id || '/' || l.season_id || '/' || l.team_id, ', ') filter (where rn <= 10) names
        from (select s.*, row_number() over () rn
              from (select distinct on (league_id, season_id, team_id) * from public.team_match_snapshot
                    order by league_id, season_id, team_id, matches_played desc) s
              join public.league_standings ls using (league_id, season_id, team_id)
              where not exists (select 1 from public.league_season_formats f
                                where f.league_id = s.league_id and f.season_id = s.season_id and f.format = 'split')
                and (ls.played <> s.matches_played or ls.won <> s.won or ls.drawn <> s.drawn or ls.lost <> s.lost
                     or ls.goals_for <> s.cum_goals_for or ls.goals_against <> s.cum_goals_against or ls.points <> s.points)) l) x
  union all
  -- Reported scores (2026-09-27): the fixture feed's score must match
  -- football-data's once both exist. A difference is a scraping, mapping or
  -- source error in one of them.
  select 'reported_vs_confirmed', case when n = 0 then 'ok' else 'warning' end, n,
    'Fixtures whose reported (feed) score differs from the confirmed result in matches: ' || coalesce(names, '')
  from (select count(*) n, string_agg(f.fixture_id || ' ' || f.reported_home_goals || '-' || f.reported_away_goals
                                      || ' v ' || m.full_time_home_goals || '-' || m.full_time_away_goals, ', ')
                                      filter (where rn <= 10) names
        from (select f.*, row_number() over (order by f.kickoff_date desc) rn from public.fixtures f
              where f.reported_home_goals is not null) f
        join public.matches m on m.league_id = f.league_id and m.season_id = f.season_id
          and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
          and m.match_date between f.kickoff_date - 3 and f.kickoff_date + 3
        where m.full_time_home_goals is not null
          and (m.full_time_home_goals <> f.reported_home_goals or m.full_time_away_goals <> f.reported_away_goals)) x
  union all
  -- Upcoming odds (2026-09-28): fixtures.csv prices should arrive at least
  -- weekly while fixtures are scheduled in the next fortnight.
  select 'upcoming_odds_fresh',
    case when not exists (select 1 from public.fixtures where status = 'scheduled' and kickoff_date between current_date and current_date + 14)
           or exists (select 1 from public.fixture_odds_snapshots where captured_at > now() - interval '8 days')
         then 'ok' else 'warning' end,
    (select count(*) from public.fixture_odds_snapshots where captured_at > now() - interval '8 days'),
    'Upcoming-match odds prices captured in the last 8 days (capture_upcoming_odds, pg_cron capture-upcoming-odds; see pipeline_runs)'
  union all
  -- FPL scoring engine (2026-09-28): fpl_score() must reproduce FPL's own
  -- points for every season held (fpl_scoring_regression).
  select 'fpl_scoring_regression',
    case when coalesce(sum(mismatches), 0) = 0 then 'ok' else 'failed' end,
    coalesce(sum(mismatches), 0),
    'Rows where fpl_score() disagrees with FPL''s points (fpl_scoring_regression; rules in fpl_scoring_rules)'
  from public.fpl_scoring_regression
  union all
  -- FPL market goals (2026-09-28): Premier League fixtures in the next
  -- fortnight should carry market expected goals written in the last 2 days.
  select 'fpl_market_goals_fresh',
    case when count(*) filter (where market_rated_at is null or market_rated_at < now() - interval '2 days') = 0
         then 'ok' else 'warning' end,
    count(*) filter (where market_rated_at is null or market_rated_at < now() - interval '2 days'),
    'Premier League fixtures in the next 14 days without market expected goals from the last 2 days (refresh_market_goals.py; FPL projection falls back to the model)'
  from public.fixtures
  where league_id = 1 and status = 'scheduled' and kickoff_date between current_date and current_date + 14
  union all
  -- FPL exit bands (2026-09-28): refreshed at the start of every FPL
  -- pipeline run; stale bands mean appearance and clean-sheet points drift.
  select 'fpl_exit_bands_fresh',
    case when not exists (select 1 from public.fixtures where league_id = 1 and status = 'scheduled' and kickoff_date between current_date and current_date + 14)
           or exists (select 1 from public.fpl_player_exit_bands where season_id = public.fpl_current_season_id() and updated_at > now() - interval '2 days')
         then 'ok' else 'warning' end,
    (select count(*) from public.fpl_player_exit_bands where season_id = public.fpl_current_season_id() and updated_at > now() - interval '2 days'),
    'Current-season players with exit bands refreshed in the last 2 days (refresh_exit_bands.py; without them FPL points fall back to 2 appearance points and the full-match clean sheet for every starter)'
  union all
  -- Squad state (2026-09-28): API-sourced injured/doubtful/suspended rows
  -- that are still active after 7 days override the live FPL availability.
  select 'fpl_squad_state_not_stale',
    case when count(*) = 0 then 'ok' else 'warning' end,
    count(*),
    'Active injured/doubtful/suspended squad-state rows from the FPL API older than 7 days (they override live availability): ' || coalesce(string_agg(fpl_player_id::text, ', '), '')
  from public.fpl_player_squad_state_current
  where source_name = 'official_fpl_api' and state in ('injured', 'doubtful', 'suspended')
    and updated_at < now() - interval '7 days'
  union all
  -- FPL Live (2026-10-11): while a Premier League match is in play the
  -- live feed must be under 5 minutes old; the last fetch should have worked.
  select 'fpl_live_feed_fresh',
    case when n = 0 then 'ok' else 'failed' end, n,
    'FPL fixtures in play (kicked off 10-100 minutes ago, not at full time) with the live feed more than 5 minutes old (private.fpl_live_tick, pg_cron every minute)'
  from (select count(*) n from public.fpl_fixtures f
        left join public.fpl_live_fixtures lf on lf.season_id = f.season_id and lf.fpl_fixture_id = f.fpl_fixture_id
        where f.season_id = public.fpl_current_season_id()
          and f.kickoff_time between now() - interval '100 minutes' and now() - interval '10 minutes'
          and not coalesce(lf.finished_provisional, false)
          and coalesce(lf.fetched_at, '-infinity'::timestamptz) < now() - interval '5 minutes') x
  union all
  select 'fpl_live_runs_ok',
    case when last_status is null or last_status = 'success' then 'ok' else 'warning' end,
    failed_24h,
    'Failed FPL live fetches in the last 24 hours (public.fpl_live_runs); warning when the most recent fetch failed'
  from (select (select status from public.fpl_live_runs order by run_at desc limit 1) last_status,
               (select count(*) from public.fpl_live_runs where status = 'failed' and run_at > now() - interval '24 hours') failed_24h) x
  union all
  -- Projection horizon (2026-10-12): each of the 10 gameweeks after the
  -- next deadline has leaguewide_v6 rows from within 36h of the newest run.
  select 'fpl_projection_horizon_fresh',
    case when n = 0 then 'ok' else 'warning' end, n,
    'Gameweeks in the 10 after the next deadline with no production-model baseline projections from within 36 hours of the newest run (pipeline window: scripts/get_next_matchweek_range.py)'
  from (select count(*) n
          from generate_series(public.ai_next_fpl_gameweek(public.fpl_current_season_id()),
                               least(38, public.ai_next_fpl_gameweek(public.fpl_current_season_id()) + 9)) s(gw)
          left join (select ff.fpl_event_id gw, max(p.generated_at) g
                       from public.fpl_player_projections p
                       join public.fpl_fixtures ff on ff.canonical_fixture_id = p.fixture_id and ff.season_id = p.season_id
                      where p.season_id = public.fpl_current_season_id() and p.model_version = public.fpl_production_model_version()
                        and coalesce(p.scenario_key, 'baseline') = 'baseline'
                      group by 1) w on w.gw = s.gw
         where coalesce(w.g, '-infinity'::timestamptz) <
               (select max(generated_at) from public.fpl_player_projections
                 where season_id = public.fpl_current_season_id() and model_version = public.fpl_production_model_version()) - interval '36 hours') x
  union all
  -- Gameweek log (2026-10-12): previews and reflections on time.
  select 'fpl_gameweek_reports_on_time',
    case when n = 0 then 'ok' else 'warning' end, n,
    'Gameweek log items late: ' || coalesce(detail, 'none') || ' (scripts/fpl_gameweek_report.py, pipeline step "Gameweek report")'
  from (
    select count(*) n, string_agg(item, '; ' order by item) detail from (
      select 'GW' || g.fpl_event_id || ' preview not published' item
        from public.fpl_gameweeks g
       where g.season_id = public.fpl_current_season_id() and g.fpl_event_id >= 7
         and g.deadline_time between now() and now() + interval '24 hours'
         and not exists (select 1 from public.fpl_gameweek_reports r where r.season_id = g.season_id and r.fpl_event_id = g.fpl_event_id
                           and r.kind = 'preview' and r.status = 'published')
      union all
      select 'GW' || g.fpl_event_id || ' preview not locked'
        from public.fpl_gameweeks g
       where g.season_id = public.fpl_current_season_id() and g.fpl_event_id >= 7
         and g.deadline_time < now() - interval '24 hours' and g.deadline_time > now() - interval '14 days'
         and not exists (select 1 from public.fpl_gameweek_reports r where r.season_id = g.season_id and r.fpl_event_id = g.fpl_event_id
                           and r.kind = 'preview' and r.status = 'published' and r.frozen)
      union all
      select 'GW' || g.fpl_event_id || ' reflection not published'
        from public.fpl_gameweeks g
       where g.season_id = public.fpl_current_season_id() and g.fpl_event_id >= 6
         and (select max(f.kickoff_time) from public.fpl_fixtures f where f.season_id = g.season_id and f.fpl_event_id = g.fpl_event_id)
             between now() - interval '14 days' and now() - interval '72 hours'
         and not exists (select 1 from public.fpl_gameweek_reports r where r.season_id = g.season_id and r.fpl_event_id = g.fpl_event_id
                           and r.kind = 'reflection' and r.status = 'published')
    ) late
  ) x
  union all
  -- Readiness (2026-10-16): every fixture in the projection horizon has a
  -- complete, current production-model projection (fpl_projection_fixture_readiness).
  select 'fpl_projection_readiness',
    case when count(*) filter (where readiness_status in ('missing', 'partial')) > 0 then 'failed'
         when count(*) filter (where readiness_status = 'stale') > 0 then 'warning' else 'ok' end,
    count(*) filter (where readiness_status in ('missing', 'partial', 'stale')),
    'Horizon fixtures whose production-model projection is missing, partial or stale: ' ||
      coalesce(string_agg(fixture_id || ' ' || readiness_status, ', ' order by fixture_id)
               filter (where readiness_status in ('missing', 'partial', 'stale')), 'none') ||
      ' (model ' || coalesce(public.fpl_production_model_version(), 'NOT SET') || ')'
  from public.fpl_projection_fixture_readiness where in_horizon
  union all
  -- Stale predictions (2026-10-16): scheduled/postponed fixtures must carry
  -- the latest accepted fit they are eligible for (fixture 6186 kept fit 966).
  select 'upcoming_predictions_current', case when n = 0 then 'ok' else 'warning' end, n,
    'Scheduled or postponed fixtures not predicted from their latest eligible accepted fit (backfill_fixture_predictions): ' || coalesce(ids, 'none')
  from (select count(*) n, string_agg(f.fixture_id || ' fit ' || coalesce(f.prediction_fit_run_id::text, 'none') || '->' || lf.fit_run_id, ', ' order by f.fixture_id) ids
        from public.fixtures f
        join lateral (select r.fit_run_id from public.model_fit_runs r
                      where r.league_id = f.league_id and r.status = 'accepted'
                        and public.prediction_fit_eligible(r.fitted_at, f.kickoff_date, f.status)
                      order by r.fitted_at desc limit 1) lf on true
        join public.team_ratings hr on hr.fit_run_id = lf.fit_run_id and hr.team_id = f.home_team_id
        join public.team_ratings ar on ar.fit_run_id = lf.fit_run_id and ar.team_id = f.away_team_id
        where f.status in ('scheduled', 'postponed')
          and (f.kickoff_date >= current_date or f.status = 'postponed')
          and f.prediction_fit_run_id is distinct from lf.fit_run_id) x
  union all
  -- Catalogue (2026-09-26): every live, non-scratch object has a description,
  -- reviewed since its definition last changed. Warning, not failure.
  select 'catalogue_current', case when n = 0 then 'ok' else 'warning' end, n,
    'Objects undocumented or changed since their catalogue entry was reviewed (see meta_catalogue_gaps): ' || coalesce(names, '')
  from (select count(*) n, string_agg(node_key, ', ' order by node_key) filter (where rn <= 10) names
        from (select node_key, row_number() over (order by node_key) rn from public.meta_catalogue_gaps) g) x;
$function$
;
