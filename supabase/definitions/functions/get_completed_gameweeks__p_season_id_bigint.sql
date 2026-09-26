-- Live definition exported from the database (function get_completed_gameweeks(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_completed_gameweeks(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_event_id integer, players bigint, total_points bigint, best_score integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select h.gameweek::integer, count(*)::bigint, sum(h.total_points)::bigint, max(h.total_points)::integer
  from public.fpl_player_gameweek_history h
  where h.season_id = p_season_id
  group by h.gameweek
  union all
  select g.fpl_event_id::integer, count(*)::bigint, sum(g.total_points)::bigint, max(g.total_points)::integer
  from public.fpl_player_gameweeks g
  where g.season_id = p_season_id
    and not exists (select 1 from public.fpl_player_gameweek_history h2 where h2.season_id = p_season_id)
    and g.total_points is not null
    and g.fpl_event_id in (
      select f.fpl_event_id from public.fpl_fixtures f
      where f.season_id = p_season_id group by f.fpl_event_id having bool_and(f.finished)
    )
  group by g.fpl_event_id
  order by 1 desc;
$function$
;
