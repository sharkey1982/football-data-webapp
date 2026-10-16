-- Live definition exported from the database (function get_fpl_minutes_teams()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_minutes_teams()
 RETURNS TABLE(team_id bigint, team_name text, slug text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select distinct t.team_id, t.display_name, t.slug
    from public.fpl_players p
    join public.teams t on t.team_id = p.canonical_team_id
   where p.season_id = public.fpl_current_season_id()
   order by t.display_name;
$function$
;
