-- Live definition exported from the database (function fpl_clear_external_lineup(p_source text, p_event integer, p_team_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_clear_external_lineup(p_source text, p_event integer, p_team_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public._require_admin();
  delete from public.fpl_external_lineups
   where source = p_source and season_id = public.fpl_current_season_id() and fpl_event_id = p_event and team_id = p_team_id;
end $function$
;
