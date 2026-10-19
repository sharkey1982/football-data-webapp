-- Live definition exported from the database (function ai_tool_find_entity(args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_tool_find_entity(args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  n text := args->>'name';
  k text := coalesce(args->>'kind', 'any');
  out jsonb := '[]'::jsonb;
  r jsonb;
begin
  if n is null then return jsonb_build_object('error', 'name is required'); end if;
  if k in ('any', 'team') then
    r := public.ai_resolve_team(n); out := out || jsonb_build_array(jsonb_build_object('kind', 'team') || r); end if;
  if k in ('any', 'competition') then
    r := public.ai_resolve_competition(n); out := out || jsonb_build_array(jsonb_build_object('kind', 'competition') || r); end if;
  if k in ('any', 'player') then
    r := public.ai_resolve_fpl_player(n, public.fpl_current_season_id());
    out := out || jsonb_build_array(jsonb_build_object('kind', 'fpl_player (current season)') || r); end if;
  return jsonb_build_object('tool', 'find_entity', 'source', jsonb_build_array('teams', 'team_aliases', 'leagues', 'fpl_players'),
    'as_of', now(), 'kind', 'observed', 'rows', out);
end $function$
;
