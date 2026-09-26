-- Live definition exported from the database (function get_player_seasons(p_fpl_code bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_player_seasons(p_fpl_code bigint)
 RETURNS TABLE(season_id bigint, season_slug text, total_points integer, is_current boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select distinct on (x.season_id) x.season_id, s.slug, x.total_points, (x.season_id = (SELECT public.fpl_current_season_id()))
  from (
    select t.season_id, t.total_points from public.fpl_player_season_totals t where t.fpl_code = p_fpl_code
    union all
    select p.season_id, p.total_points from public.fpl_players p
      where p.fpl_code = p_fpl_code and p.season_id = (SELECT public.fpl_current_season_id())
  ) x
  join public.seasons s on s.season_id = x.season_id
  order by x.season_id desc;
$function$
;
