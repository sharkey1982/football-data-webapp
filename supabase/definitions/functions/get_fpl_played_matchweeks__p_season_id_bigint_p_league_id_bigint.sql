-- Live definition exported from the database (function get_fpl_played_matchweeks(p_season_id bigint, p_league_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_played_matchweeks(p_season_id bigint, p_league_id bigint)
 RETURNS integer[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(array_agg(distinct f.matchweek order by f.matchweek), array[]::int[])
  from public.fpl_player_gameweeks gw
  join public.fixtures f on f.fixture_id = gw.fpl_fixture_id
  where gw.season_id = p_season_id and f.league_id = p_league_id;
$function$
;
