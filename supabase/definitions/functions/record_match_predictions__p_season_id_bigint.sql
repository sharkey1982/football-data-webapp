-- Live definition exported from the database (function record_match_predictions(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.record_match_predictions(p_season_id bigint DEFAULT current_season_id())
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
