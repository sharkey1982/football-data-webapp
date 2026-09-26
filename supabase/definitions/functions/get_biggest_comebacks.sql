-- Live definition exported from the database (function get_biggest_comebacks()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_biggest_comebacks()
 RETURNS TABLE(home text, away text, ht_home integer, ht_away integer, ft_home integer, ft_away integer, match_date date, league_code text, deficit integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select ht.display_name, at.display_name,
    m.half_time_home_goals, m.half_time_away_goals,
    m.full_time_home_goals, m.full_time_away_goals,
    m.match_date, l.code,
    greatest(m.half_time_away_goals - m.half_time_home_goals,
             m.half_time_home_goals - m.half_time_away_goals) as deficit
  from public.matches m
  join public.teams ht on ht.team_id = m.home_team_id
  join public.teams at on at.team_id = m.away_team_id
  join public.leagues l on l.league_id = m.league_id
  where m.half_time_home_goals is not null
    and (
      (m.half_time_away_goals - m.half_time_home_goals >= 2 and m.full_time_home_goals > m.full_time_away_goals)
      or (m.half_time_home_goals - m.half_time_away_goals >= 2 and m.full_time_away_goals > m.full_time_home_goals)
    )
  order by deficit desc, m.match_date desc
  limit 8;
$function$
;
