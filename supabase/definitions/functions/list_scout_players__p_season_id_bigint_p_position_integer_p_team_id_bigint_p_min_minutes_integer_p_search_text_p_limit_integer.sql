-- Live definition exported from the database (function list_scout_players(p_season_id bigint, p_position integer, p_team_id bigint, p_min_minutes integer, p_search text, p_limit integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.list_scout_players(p_season_id bigint DEFAULT 13, p_position integer DEFAULT NULL::integer, p_team_id bigint DEFAULT NULL::bigint, p_min_minutes integer DEFAULT 0, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 RETURNS TABLE(fpl_code bigint, slug text, fpl_player_id bigint, web_name text, full_name text, team_name text, team_id bigint, element_type integer, now_cost integer, total_points integer, minutes integer, goals_scored integer, assists integer, clean_sheets integer, bonus integer, selected_by_percent numeric, points_per_million numeric, seasons_played bigint, price_pressure numeric, price_direction text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with pressure as (
    select r.fpl_player_id, r.pressure, r.direction
    from public.get_price_change_risk(p_season_id) r
  )
  select
    p.fpl_code, i.slug, p.fpl_player_id::bigint, p.web_name,
    trim(coalesce(p.first_name,'') || ' ' || coalesce(p.second_name,'')),
    t.display_name, p.canonical_team_id::bigint, p.element_type,
    p.now_cost, p.total_points, p.minutes, p.goals_scored, p.assists,
    p.clean_sheets, p.bonus, p.selected_by_percent,
    case when p.now_cost > 0
         then round((p.total_points / (p.now_cost / 10.0))::numeric, 2) end,
    (select count(*) from public.fpl_player_season_totals st where st.fpl_code = p.fpl_code),
    round(abs(pr.pressure)::numeric, 1), pr.direction
  from public.fpl_players p
  left join public.teams t on t.team_id = p.canonical_team_id
  left join public.player_identity i on i.fpl_code = p.fpl_code
  left join pressure pr on pr.fpl_player_id = p.fpl_player_id
  where p.season_id = p_season_id
    and (p_position is null or p.element_type = p_position)
    and (p_team_id is null or p.canonical_team_id = p_team_id)
    and coalesce(p.minutes, 0) >= coalesce(p_min_minutes, 0)
    and (
      p_search is null or length(trim(p_search)) = 0
      or p.web_name ilike '%' || trim(p_search) || '%'
      or trim(coalesce(p.first_name,'') || ' ' || coalesce(p.second_name,'')) ilike '%' || trim(p_search) || '%'
    )
  order by p.total_points desc nulls last, p.minutes desc nulls last
  limit greatest(1, least(p_limit, 700));
$function$
;
