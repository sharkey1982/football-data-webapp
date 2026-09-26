-- Live definition exported from the database (function get_countries_by_relevance()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_countries_by_relevance()
 RETURNS TABLE(country_id bigint, name text, code text, teams_with_matches bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.country_id, c.name, c.code,
    count(distinct t.team_id) filter (where exists (
      select 1 from matches m where m.home_team_id = t.team_id or m.away_team_id = t.team_id
    ))
  from countries c
  left join teams t on t.country_id = c.country_id
  group by c.country_id, c.name, c.code
  order by 4 desc, c.name asc;
$function$
;
