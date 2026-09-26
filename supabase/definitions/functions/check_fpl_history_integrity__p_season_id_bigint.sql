-- Live definition exported from the database (function check_fpl_history_integrity(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_fpl_history_integrity(p_season_id bigint)
 RETURNS TABLE(players_checked bigint, points_mismatch bigint, minutes_mismatch bigint, goals_mismatch bigint, assists_mismatch bigint, worst_points_gap integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with gw as (
    select fpl_code,
      sum(total_points) pts, sum(minutes) mins,
      sum(goals_scored) gls, sum(assists) ast
    from public.fpl_player_gameweek_history
    where season_id = p_season_id
    group by fpl_code
  )
  select
    count(*)::bigint,
    count(*) filter (where gw.pts <> t.total_points)::bigint,
    count(*) filter (where gw.mins <> t.minutes)::bigint,
    count(*) filter (where gw.gls <> t.goals_scored)::bigint,
    count(*) filter (where gw.ast <> t.assists)::bigint,
    coalesce(max(abs(gw.pts - t.total_points)), 0)::integer
  from gw
  join public.fpl_player_season_totals t
    on t.season_id = p_season_id and t.fpl_code = gw.fpl_code;
$function$
;
