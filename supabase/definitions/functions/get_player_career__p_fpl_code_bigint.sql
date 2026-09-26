-- Live definition exported from the database (function get_player_career(p_fpl_code bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_player_career(p_fpl_code bigint)
 RETURNS TABLE(season_id bigint, season_slug text, web_name text, team_name text, element_type integer, start_cost integer, end_cost integer, total_points integer, minutes integer, goals_scored integer, assists integer, clean_sheets integer, bonus integer, points_per_start_million numeric, points_early integer, points_mid integer, points_late integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select t.season_id, s.slug, t.web_name, t.team_name, t.element_type,
    t.start_cost, t.end_cost, t.total_points, t.minutes,
    t.goals_scored, t.assists, t.clean_sheets, t.bonus,
    case when t.start_cost > 0
         then round((t.total_points / (t.start_cost / 10.0))::numeric, 2) end,
    h.early, h.mid, h.late
  from public.fpl_player_season_totals t
  join public.seasons s on s.season_id = t.season_id
  left join lateral (
    select sum(g.total_points) filter (where g.gameweek <= 13)::int early,
           sum(g.total_points) filter (where g.gameweek between 14 and 26)::int mid,
           sum(g.total_points) filter (where g.gameweek >= 27)::int late
    from public.fpl_player_gameweek_history g
    where g.season_id = t.season_id and g.fpl_code = t.fpl_code
  ) h on true
  where t.fpl_code = p_fpl_code
  order by t.season_id desc;
$function$
;
