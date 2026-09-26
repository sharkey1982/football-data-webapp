-- Live definition exported from the database (function get_scout_vs_model()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_scout_vs_model()
 RETURNS TABLE(scored_fixtures bigint, scout_mae numeric, model_mae numeric, scout_better bigint, model_better bigint, ties bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with played as (
    select f.fixture_id,
      f.predicted_home_goals ph, f.predicted_away_goals pa,
      f.raw_predicted_home_goals rh, f.raw_predicted_away_goals ra,
      m.full_time_home_goals gh, m.full_time_away_goals ga
    from public.fixtures f
    join public.matches m
      on m.league_id = f.league_id and m.season_id = f.season_id
     and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
     and m.match_date = f.kickoff_date
    where f.status = 'played'
      and f.predicted_home_goals is not null
      and f.raw_predicted_home_goals is not null
      and m.full_time_home_goals is not null
      -- Only where the adjustment bit.
      and (abs(f.raw_predicted_home_goals - f.predicted_home_goals) > 0.001
        or abs(f.raw_predicted_away_goals - f.predicted_away_goals) > 0.001)
  ),
  errs as (
    select
      (abs(ph - gh) + abs(pa - ga)) / 2 as scout_err,
      (abs(rh - gh) + abs(ra - ga)) / 2 as model_err
    from played
  )
  select
    count(*)::bigint,
    round(avg(scout_err)::numeric, 3),
    round(avg(model_err)::numeric, 3),
    count(*) filter (where scout_err < model_err)::bigint,
    count(*) filter (where model_err < scout_err)::bigint,
    count(*) filter (where abs(scout_err - model_err) < 1e-9)::bigint
  from errs;
$function$
;
