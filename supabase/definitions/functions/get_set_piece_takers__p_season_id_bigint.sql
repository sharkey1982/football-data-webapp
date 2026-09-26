-- Live definition exported from the database (function get_set_piece_takers(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_set_piece_takers(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(team_id bigint, team_name text, team_slug text, set_piece_type text, player_name text, rank integer, confidence numeric, source_name text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    t.team_id, t.display_name, t.slug,
    h.set_piece_type, h.player_name, h.rank, h.confidence, h.source_name, h.updated_at
  from public.set_piece_hierarchies h
  join public.teams t on t.team_id = h.team_id
  where h.season_id = p_season_id
    and (h.valid_to is null or h.valid_to > now())
  order by t.display_name, h.set_piece_type, h.rank;
$function$
;
