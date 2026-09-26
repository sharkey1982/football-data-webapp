-- Live definition exported from the database (function refresh_fpl_projections_range(p_from_matchweek integer, p_to_matchweek integer, p_season_id bigint, p_league_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_fpl_projections_range(p_from_matchweek integer, p_to_matchweek integer, p_season_id bigint DEFAULT 13, p_league_id bigint DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fixture record;
  v_total integer := 0;
begin
  for v_fixture in select fixture_id from public.fixtures where matchweek between p_from_matchweek and p_to_matchweek and season_id = p_season_id and league_id = p_league_id
  loop
    perform public.refresh_fpl_projection_fixture_v6(v_fixture.fixture_id);
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$function$
;
