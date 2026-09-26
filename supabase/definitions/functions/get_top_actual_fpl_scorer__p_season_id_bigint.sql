-- Live definition exported from the database (function get_top_actual_fpl_scorer(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_top_actual_fpl_scorer(p_season_id bigint)
 RETURNS TABLE(web_name text, total_points bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select fp.web_name, sum(g.total_points) as total_points
  from public.fpl_player_gameweeks g
  join public.fpl_players fp on fp.fpl_player_id = g.fpl_player_id and fp.season_id = p_season_id
  where g.season_id = p_season_id
  group by fp.web_name
  order by total_points desc
  limit 4;
$function$
;
