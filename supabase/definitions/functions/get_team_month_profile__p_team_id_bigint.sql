-- Live definition exported from the database (function get_team_month_profile(p_team_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_team_month_profile(p_team_id bigint)
 RETURNS TABLE(month_num integer, month_label text, venue text, played integer, points integer, goals_for integer, goals_against integer, ppg numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with res as (
    select extract(month from m.match_date)::int as mo, 'home'::text as v,
           m.full_time_home_goals as gf, m.full_time_away_goals as ga
    from public.matches m
    where m.home_team_id = p_team_id and m.league_id between 1 and 5 and m.full_time_home_goals is not null
    union all
    select extract(month from m.match_date)::int, 'away',
           m.full_time_away_goals, m.full_time_home_goals
    from public.matches m
    where m.away_team_id = p_team_id and m.league_id between 1 and 5 and m.full_time_home_goals is not null
  )
  select mo, to_char(make_date(2000, mo, 1), 'Mon'), v, count(*)::int,
    (3 * count(*) filter (where gf > ga) + count(*) filter (where gf = ga))::int,
    sum(gf)::int, sum(ga)::int,
    round((3 * count(*) filter (where gf > ga) + count(*) filter (where gf = ga))::numeric / count(*), 2)
  from res group by mo, v
  order by (mo + 5) % 12, v;
$function$
;
