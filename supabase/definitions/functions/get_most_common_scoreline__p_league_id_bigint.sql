-- Live definition exported from the database (function get_most_common_scoreline(p_league_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_most_common_scoreline(p_league_id bigint)
 RETURNS TABLE(home_goals integer, away_goals integer, occurrences bigint, total_matches bigint, seasons_covered bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with counts as (
    select full_time_home_goals, full_time_away_goals, count(*) as occurrences
    from public.matches
    where league_id = p_league_id
    group by full_time_home_goals, full_time_away_goals
  ), total as (
    select count(*) as total_matches, count(distinct season_id) as seasons_covered
    from public.matches where league_id = p_league_id
  )
  select c.full_time_home_goals, c.full_time_away_goals, c.occurrences, t.total_matches, t.seasons_covered
  from counts c, total t
  order by c.occurrences desc
  limit 4;
$function$
;
