-- Live definition exported from the database (function get_model_accuracy(p_league_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_model_accuracy(p_league_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(fixture_id bigint, league_code text, kickoff_date date, home_team text, away_team text, p_home numeric, p_draw numeric, p_away numeric, picked text, actual text, correct boolean, p_actual numeric, brier numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    f.fixture_id, l.code, f.kickoff_date,
    ht.display_name, at2.display_name,
    dm.home_win, dm.draw, dm.away_win,
    case when dm.home_win >= dm.draw and dm.home_win >= dm.away_win then 'H'
         when dm.draw    >= dm.away_win then 'D' else 'A' end,
    m.full_time_result,
    (case when dm.home_win >= dm.draw and dm.home_win >= dm.away_win then 'H'
          when dm.draw    >= dm.away_win then 'D' else 'A' end) = m.full_time_result,
    round(case m.full_time_result when 'H' then dm.home_win when 'D' then dm.draw else dm.away_win end, 2),
    round(
      power(dm.home_win/100 - (case when m.full_time_result='H' then 1 else 0 end), 2)
    + power(dm.draw    /100 - (case when m.full_time_result='D' then 1 else 0 end), 2)
    + power(dm.away_win/100 - (case when m.full_time_result='A' then 1 else 0 end), 2)
    , 4)
  from public.fixtures f
  join public.model_fit_runs r on r.fit_run_id = f.prediction_fit_run_id
  join public.leagues l on l.league_id = f.league_id
  join public.teams ht on ht.team_id = f.home_team_id
  join public.teams at2 on at2.team_id = f.away_team_id
  -- No FK between fixtures and matches; joined on the natural key, as
  -- documented in the project notes.
  join public.matches m on m.league_id = f.league_id and m.season_id = f.season_id
    and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
    and m.match_date = f.kickoff_date
  cross join lateral public.fixture_derived_markets(
    f.predicted_home_goals::numeric, f.predicted_away_goals::numeric, r.rho::numeric) dm
  where f.status = 'played'
    and f.predicted_home_goals is not null
    and r.rho is not null
    and m.full_time_result is not null
    and (p_league_id is null or f.league_id = p_league_id)
  order by f.kickoff_date desc;
$function$
;
