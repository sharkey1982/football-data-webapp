-- Live definition exported from the database (function backfill_historic_fixture_predictions(target_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.backfill_historic_fixture_predictions(target_season_id bigint)
 RETURNS integer
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with candidate_fits as (
    select
      f.fixture_id,
      mfr.fit_run_id,
      mfr.rho,
      mfr.home_advantage,
      row_number() over (partition by f.fixture_id order by mfr.fitted_at desc) as rn
    from public.fixtures f
    join public.model_fit_runs mfr
      on mfr.league_id = f.league_id
      and mfr.status = 'accepted'
      and mfr.fitted_at::date < f.kickoff_date
    where f.season_id = target_season_id
      and f.predicted_home_goals is null
  ),
  chosen as (
    select fixture_id, fit_run_id, rho, home_advantage
    from candidate_fits
    where rn = 1
  ),
  preds as (
    select
      c.fixture_id,
      c.fit_run_id,
      exp(c.home_advantage + hr.attack_strength - ar.defence_strength) as pred_home,
      exp(ar.attack_strength - hr.defence_strength) as pred_away
    from chosen c
    join public.fixtures f on f.fixture_id = c.fixture_id
    join public.team_ratings hr on hr.team_id = f.home_team_id and hr.fit_run_id = c.fit_run_id
    join public.team_ratings ar on ar.team_id = f.away_team_id and ar.fit_run_id = c.fit_run_id
  ),
  updated as (
    update public.fixtures f
    set predicted_home_goals = p.pred_home,
        predicted_away_goals = p.pred_away,
        prediction_fit_run_id = p.fit_run_id,
        predicted_at = now()
    from preds p
    where p.fixture_id = f.fixture_id
      and f.predicted_home_goals is null
    returning f.fixture_id
  )
  select count(*)::integer from updated;
$function$
;
