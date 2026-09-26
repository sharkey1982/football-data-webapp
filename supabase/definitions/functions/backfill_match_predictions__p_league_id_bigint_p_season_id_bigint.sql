-- Live definition exported from the database (function backfill_match_predictions(p_league_id bigint, p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.backfill_match_predictions(p_league_id bigint, p_season_id bigint)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with chosen as (
    select distinct on (m.match_id)
      m.match_id, mfr.fit_run_id, mfr.fitted_at,
      exp(mfr.home_advantage + hr.attack_strength - ar.defence_strength) as ph,
      exp(ar.attack_strength - hr.defence_strength) as pa
    from public.matches m
    join public.model_fit_runs mfr
      on mfr.league_id = m.league_id
     and mfr.status = 'accepted'
     and mfr.fitted_at::date < m.match_date::date
    join public.team_ratings hr on hr.fit_run_id = mfr.fit_run_id and hr.team_id = m.home_team_id
    join public.team_ratings ar on ar.fit_run_id = mfr.fit_run_id and ar.team_id = m.away_team_id
    where m.league_id = p_league_id
      and m.season_id = p_season_id
    order by m.match_id, mfr.fitted_at desc
  ),
  up as (
    insert into public.match_predictions as mp
      (match_id, fit_run_id, fit_as_of_date, predicted_home_goals, predicted_away_goals)
    select match_id, fit_run_id, fitted_at::date, ph, pa from chosen
    on conflict (match_id) do update
      set fit_run_id = excluded.fit_run_id,
          fit_as_of_date = excluded.fit_as_of_date,
          predicted_home_goals = excluded.predicted_home_goals,
          predicted_away_goals = excluded.predicted_away_goals,
          predicted_at = now()
      where mp.fit_run_id is distinct from excluded.fit_run_id
    returning 1
  )
  select count(*)::integer from up;
$function$
;
