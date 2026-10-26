-- Live definition exported from the database (function get_countries_by_relevance()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_countries_by_relevance()
 RETURNS TABLE(country_id bigint, name text, code text, teams_with_matches bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.country_id, c.name, c.code,
    -- one pass over matches (a per-team EXISTS on home OR away scanned
    -- matches once per team: 13.6s after the European history load)
    count(distinct t.team_id) filter (where p.team_id is not null)
  from countries c
  left join teams t on t.country_id = c.country_id
  left join (select home_team_id as team_id from matches
             union select away_team_id from matches) p on p.team_id = t.team_id
  group by c.country_id, c.name, c.code
  order by 4 desc, c.name asc;
$function$
;
