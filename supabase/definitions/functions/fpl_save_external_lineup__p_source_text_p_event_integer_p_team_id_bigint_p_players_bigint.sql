-- Live definition exported from the database (function fpl_save_external_lineup(p_source text, p_event integer, p_team_id bigint, p_players bigint[])).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_save_external_lineup(p_source text, p_event integer, p_team_id bigint, p_players bigint[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_season bigint := public.fpl_current_season_id(); v_bad integer; v_n integer;
begin
  perform public._require_admin();
  if coalesce(array_length(p_players, 1), 0) = 0 or array_length(p_players, 1) > 11 then
    raise exception 'a line-up needs 1 to 11 players';
  end if;
  select count(*) into v_bad from unnest(p_players) x(id)
   where not exists (select 1 from public.fpl_players p where p.fpl_player_id = x.id and p.season_id = v_season and p.canonical_team_id = p_team_id);
  if v_bad > 0 then raise exception '% player(s) are not in this club''s squad', v_bad; end if;
  delete from public.fpl_external_lineups
   where source = p_source and season_id = v_season and fpl_event_id = p_event and team_id = p_team_id;
  insert into public.fpl_external_lineups (source, season_id, fpl_event_id, team_id, fpl_player_id)
  select p_source, v_season, p_event, p_team_id, x.id from (select distinct unnest(p_players) id) x;
  get diagnostics v_n = row_count;
  return v_n;
end $function$
;
