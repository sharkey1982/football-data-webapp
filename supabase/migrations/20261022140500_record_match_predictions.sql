-- Audit 2026-10-22, DQ-09: keep the match_predictions ledger current.
--
-- match_predictions is the archive of pre-match predictions behind Model
-- Returns and the model scorecard for past seasons (get_betting_bets,
-- model_scorecard_matches read fixtures for the current season and this
-- table otherwise). Its only writer was scripts/retrofit_verify_and_predict.py,
-- run by hand, so nothing was added after 23 Sep and League One, League Two
-- and the National League had no 2026/27 rows (E0 50/70, E1 95/131, E2 0,
-- E3 0, EC 0). At the 2027/28 rollover the 2026/27 track record would have
-- lost most of its matches.
--
-- record_match_predictions(season) copies each played match's frozen fixture
-- prediction into the ledger once its result is in:
--   - same columns and meaning as backfill_match_predictions: fit_run_id,
--     fit_as_of_date = the fit's fitted_at date, predicted goals;
--     predicted_at = when the fixture prediction was made;
--   - point-in-time rule as check_model_integrity's
--     archive_predictions_point_in_time: accepted fit, fitted_at::date (and
--     as_of_date when set) strictly before the match date;
--   - never overwrites a row (on conflict do nothing): the ledger is a record.
-- Runs from pg_cron twice a day, before refresh-model-scorecard; this file
-- also backfills 2026/27 once. Safe to re-run.

create or replace function public.record_match_predictions(p_season_id bigint default public.current_season_id())
returns integer
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with src as (
    select distinct on (m.match_id)
           m.match_id, f.prediction_fit_run_id as fit_run_id, r.fitted_at::date as fit_as_of_date,
           f.predicted_home_goals, f.predicted_away_goals, coalesce(f.predicted_at, now()) as predicted_at
      from public.fixtures f
      join public.matches m
        on m.league_id = f.league_id and m.season_id = f.season_id
       and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
       and m.match_date::date = f.kickoff_date
      join public.model_fit_runs r
        on r.fit_run_id = f.prediction_fit_run_id
       and r.status = 'accepted'
       and r.fitted_at::date < m.match_date::date
       and (r.as_of_date is null or r.as_of_date < m.match_date::date)
     where f.season_id = p_season_id
       and f.predicted_home_goals is not null and f.predicted_away_goals is not null
       and m.full_time_home_goals is not null and m.full_time_away_goals is not null
     order by m.match_id, f.fixture_id
  ), ins as (
    insert into public.match_predictions
      (match_id, fit_run_id, fit_as_of_date, predicted_home_goals, predicted_away_goals, predicted_at)
    select match_id, fit_run_id, fit_as_of_date, predicted_home_goals, predicted_away_goals, predicted_at from src
    on conflict (match_id) do nothing
    returning 1
  )
  select count(*)::integer from ins;
$function$;

comment on function public.record_match_predictions(bigint) is
  'Copies played matches'' frozen pre-kick-off fixture predictions into the match_predictions ledger (point-in-time: accepted fit dated before the match; never overwrites). pg_cron record-match-predictions, twice daily. Audit 2026-10-22 DQ-09.';

revoke all on function public.record_match_predictions(bigint) from public, anon, authenticated;
grant execute on function public.record_match_predictions(bigint) to service_role;

-- Backfill 2026/27 (season 13) once.
select public.record_match_predictions(13);

-- Twice a day, after sync-fixture-status-from-results (09:30/21:30) and
-- before refresh-model-scorecard (10:00/22:00).
select cron.unschedule('record-match-predictions') where exists (select 1 from cron.job where jobname = 'record-match-predictions');
select cron.schedule('record-match-predictions', '45 9,21 * * *', $$select public.record_match_predictions()$$);

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, notes)
values ('record-match-predictions', 'football', 'supabase_cron', '45 9,21 * * *', interval '12 hours', interval '00:10:00',
        'pg_cron', '^record-match-predictions$',
        'Writes played matches'' fixture predictions to the match_predictions ledger (audit 2026-10-22 DQ-09).')
on conflict (job_key) do update
  set schedule = excluded.schedule, expected_interval = excluded.expected_interval,
      max_duration = excluded.max_duration, run_key = excluded.run_key, notes = excluded.notes;
