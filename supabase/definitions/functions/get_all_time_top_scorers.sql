-- Live definition exported from the database (function get_all_time_top_scorers()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_all_time_top_scorers()
 RETURNS TABLE(display_name text, goals bigint, seasons_covered bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with g as (
    select home_team_id as team_id, full_time_home_goals as goals from public.matches
    union all
    select away_team_id, full_time_away_goals from public.matches
  ), per_team as (
    select team_id, sum(goals) as goals from g group by team_id
  )
  select t.display_name, sum(p.goals)::bigint,
    (select count(distinct season_id) from public.matches)::bigint
  from per_team p
  join public.teams t on t.team_id = p.team_id
  group by t.display_name
  order by 2 desc
  limit 4;
$function$
;
