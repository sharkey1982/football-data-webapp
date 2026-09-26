-- Live definition exported from the database (function get_fpl_projection_available_matchweeks(p_season_id bigint, p_league_id bigint, p_model_version text, p_scenario_key text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_projection_available_matchweeks(p_season_id bigint, p_league_id bigint, p_model_version text, p_scenario_key text)
 RETURNS integer[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(array_agg(distinct f.matchweek order by f.matchweek), array[]::int[])
  from public.fpl_player_projections pr
  join public.fixtures f on f.fixture_id = pr.fixture_id
  where pr.season_id = p_season_id
    and f.league_id = p_league_id
    and pr.model_version = p_model_version
    and pr.scenario_key = p_scenario_key;
$function$
;
