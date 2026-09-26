-- Live definition exported from the database (function get_all_time_top_scorers()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_all_time_top_scorers()
 RETURNS TABLE(display_name text, goals bigint, seasons_covered bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select t.display_name,
    sum(case when m.home_team_id = t.team_id then m.full_time_home_goals else m.full_time_away_goals end)::bigint,
    (select count(distinct season_id) from public.matches)::bigint
  from public.matches m
  join public.teams t on t.team_id in (m.home_team_id, m.away_team_id)
  group by t.display_name
  order by 2 desc
  limit 4;
$function$
;
