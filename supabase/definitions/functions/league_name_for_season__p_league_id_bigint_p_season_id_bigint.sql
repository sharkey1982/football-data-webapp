-- Live definition exported from the database (function league_name_for_season(p_league_id bigint, p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.league_name_for_season(p_league_id bigint, p_season_id bigint)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- The division's name in that season; today's name where no era row applies.
  select coalesce(
    (select n.name
       from public.league_season_names n
       join public.seasons s on s.season_id = p_season_id
      where n.league_id = p_league_id
        and s.start_year >= n.from_season_start_year
        and (n.to_season_start_year is null or s.start_year <= n.to_season_start_year)
      order by n.from_season_start_year desc
      limit 1),
    (select l.name from public.leagues l where l.league_id = p_league_id))
$function$
;
