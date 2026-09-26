-- Live definition exported from the database (function get_fpl_projection_snapshot(p_season_id bigint, p_league_id bigint, p_model_version text, p_scenario_key text, p_from_matchweek integer, p_to_matchweek integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_projection_snapshot(p_season_id bigint, p_league_id bigint, p_model_version text, p_scenario_key text, p_from_matchweek integer, p_to_matchweek integer)
 RETURNS TABLE(max_generated_at timestamp with time zone, row_count bigint, matchweeks_covered integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select max(pr.generated_at), count(*), count(distinct f.matchweek)::int
  from public.fpl_player_projections pr
  join public.fixtures f on f.fixture_id = pr.fixture_id
  where pr.season_id = p_season_id
    and f.league_id = p_league_id
    and pr.model_version = p_model_version
    and pr.scenario_key = p_scenario_key
    and f.matchweek between p_from_matchweek and p_to_matchweek;
$function$
;
