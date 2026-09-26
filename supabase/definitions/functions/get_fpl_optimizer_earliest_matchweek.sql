-- Live definition exported from the database (function get_fpl_optimizer_earliest_matchweek()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_optimizer_earliest_matchweek()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select min(f.matchweek)
  from public.fpl_player_projections pr
  join public.fixtures f on f.fixture_id = pr.fixture_id
  where pr.model_version = 'leaguewide_v6';
$function$
;
