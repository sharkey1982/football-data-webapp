-- Live definition exported from the database (function history_what_happened_next(p_league_id bigint, p_matches_played integer, p_position_min integer, p_position_max integer, p_points_min integer, p_points_max integer, p_from_year integer, p_to_year integer, p_comparable_group text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.history_what_happened_next(p_league_id bigint, p_matches_played integer, p_position_min integer DEFAULT NULL::integer, p_position_max integer DEFAULT NULL::integer, p_points_min integer DEFAULT NULL::integer, p_points_max integer DEFAULT NULL::integer, p_from_year integer DEFAULT NULL::integer, p_to_year integer DEFAULT NULL::integer, p_comparable_group text DEFAULT NULL::text)
 RETURNS TABLE(season_id bigint, season_label text, start_year integer, team_id bigint, team_name text, team_slug text, position_at_played integer, teams_at_played integer, points integer, goal_difference integer, final_position integer, final_points integer, clubs bigint, champion boolean, top_four boolean, top_six boolean, relegated boolean, promoted boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select s.season_id, t.season_label, t.start_year, s.team_id, tm.display_name, tm.slug,
    s.position_at_played, s.teams_at_played, s.points, s.goal_difference,
    t.position, t.points, t.clubs,
    t.champion, t.top_four, t.top_six, t.relegated, t.promoted
  from public.team_match_snapshot s
  join public.team_season_summary t using (league_id, season_id, team_id)
  join public.teams tm on tm.team_id = s.team_id
  where s.league_id = p_league_id
    and s.matches_played = p_matches_played
    and t.is_final and not t.curtailed and not t.split_format
    and (p_comparable_group is null or t.comparable_group = p_comparable_group)
    and (p_position_min is null or s.position_at_played >= p_position_min)
    and (p_position_max is null or s.position_at_played <= p_position_max)
    and (p_points_min is null or s.points >= p_points_min)
    and (p_points_max is null or s.points <= p_points_max)
    and (p_from_year is null or t.start_year >= p_from_year)
    and (p_to_year is null or t.start_year <= p_to_year)
  order by t.start_year desc, s.position_at_played, tm.display_name
  limit 2000;
$function$
;
