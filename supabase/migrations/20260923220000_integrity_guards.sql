-- Applied 2026-09-23 (evening). Guards added after the day's incidents; see
-- docs/incidents.md. Data corrections made alongside (fit #38 retired, 51 + 83
-- predictions corrected or removed, 88 statuses synced) are recorded in
-- prediction_corrections and model_change_log, not repeated here.

-- Fit version dc_v1_1: dc_v1 + scoring-level gate (scripts/fit_dixon_coles.py).
insert into public.model_versions (version, component, description, params, introduced_at) values
 ('dc_v1_1', 'fit',
  'dc_v1 plus a scoring-level gate: a fit is rejected unless its ratings, exactly as stored, reproduce the window''s weighted average home and away goals within 5%. Added after the June 2026 fits predicted about 30% too few goals while passing every existing check.',
  '{"window_days": 730, "half_life_days": 180, "min_matches_for_direct_fit": 10, "min_matches_for_production": 50, "strength_bound": 2.5, "movement_warning": 1.0, "rho": "estimated", "home_advantage": "one per league, estimated", "promoted_relegated_method": "median division gap (estimate_promoted_team_ratings.py)", "scoring_level_tolerance": 0.05}'::jsonb,
  '2026-09-23')
on conflict (version) do nothing;
update public.model_versions set retired_at = '2026-09-23' where version = 'dc_v1' and retired_at is null;

-- The pipelines' role reads every public table, now and for new tables.
grant select on all tables in schema public to service_role;
alter default privileges for role postgres in schema public grant select on tables to service_role;

-- Status from results, independent of the fixture feed (cron twice daily).
create or replace function public.sync_fixture_status_from_results()
returns integer
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.fixtures f set status = 'played', updated_at = now()
    where f.status in ('scheduled', 'postponed')
      and f.kickoff_date < current_date
      and exists (select 1 from public.matches m
                  where m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
                    and m.match_date::date = f.kickoff_date and m.full_time_home_goals is not null)
    returning 1)
  select count(*)::integer from upd;
$$;
revoke all on function public.sync_fixture_status_from_results() from public, anon, authenticated;
grant execute on function public.sync_fixture_status_from_results() to service_role;
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'sync-fixture-status-from-results') then
    perform cron.schedule('sync-fixture-status-from-results', '30 9,21 * * *', 'select public.sync_fixture_status_from_results();');
  end if;
end $$;

-- Daily integrity checks, one per incident (run by .github/workflows/integrity-checks.yml).
create or replace function public.check_model_integrity()
returns table(check_name text, status text, found bigint, detail text)
language sql stable
security definer
set search_path = public
as $$
  with cur as (select max(season_id) s from public.matches where league_id between 1 and 5)
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
  select 'new_fits_versioned', case when n = 0 then 'ok' else 'failed' end, n,
    'Fits made since versioning began with no model_version'
  from (select count(*) n from public.model_fit_runs where fitted_at > '2026-09-24' and not is_retrofit and model_version is null) x
  union all
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
  select 'service_role_can_read_tables', case when n = 0 then 'ok' else 'failed' end, n,
    'Public tables service_role cannot SELECT: ' || coalesce(names, '')
  from (select count(*) n, string_agg(c.relname, ', ') names from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
        where ns.nspname = 'public' and c.relkind = 'r' and not has_table_privilege('service_role', c.oid, 'SELECT')) x
  union all
  select 'stale_scheduled_fixtures', case when n = 0 then 'ok' else 'warning' end, n,
    'Fixtures still scheduled/postponed more than 3 days after their kick-off date'
  from (select count(*) n from public.fixtures where status in ('scheduled', 'postponed') and kickoff_date < current_date - 3) x;
$$;
revoke all on function public.check_model_integrity() from public, anon, authenticated;
grant execute on function public.check_model_integrity() to service_role;
