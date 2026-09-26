-- Live definition exported from the database (function list_scout_teams(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.list_scout_teams(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(team_id bigint, team_name text, players integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select t.team_id::bigint, t.display_name, count(*)::int
  from public.fpl_players p
  join public.teams t on t.team_id = p.canonical_team_id
  where p.season_id = p_season_id
  group by t.team_id, t.display_name
  order by t.display_name;
$function$
;
