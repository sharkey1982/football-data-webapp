-- Live definition exported from the database (function get_tactical_role_worklist(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_tactical_role_worklist(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(team_id bigint, team_name text, fpl_player_id bigint, web_name text, slug text, position_label text, assigned_role text, confidence numeric, minutes integer, ownership numeric, total_points integer, priority text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with mins as (
    select g.fpl_player_id, sum(g.minutes)::integer as m, sum(g.total_points)::integer as pts
    from public.fpl_player_gameweeks g
    where g.season_id = p_season_id
    group by g.fpl_player_id
  ),
  latest_snap as (
    select distinct on (s.fpl_player_id) s.fpl_player_id, s.selected_by_percent
    from public.fpl_player_snapshots s
    order by s.fpl_player_id, s.snapshot_date desc
  )
  select
    d.team_id, t.display_name, d.fpl_player_id, p.web_name, p.slug,
    case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
    d.tactical_role, d.confidence,
    coalesce(m.m, 0), round(coalesce(ls.selected_by_percent, 0)::numeric, 1), coalesce(m.pts, 0),
    case
      when coalesce(m.m, 0) >= 270 then 'starter'
      when coalesce(m.m, 0) >= 90 then 'rotation'
      else 'fringe'
    end
  from public.team_player_tactical_defaults d
  join public.fpl_players p on p.fpl_player_id = d.fpl_player_id
  left join public.teams t on t.team_id = d.team_id
  left join mins m on m.fpl_player_id = d.fpl_player_id
  left join latest_snap ls on ls.fpl_player_id = d.fpl_player_id
  where d.season_id = p_season_id
    and d.source_name = 'fpl_position_fallback'
    -- A keeper's position IS their role.
    and p.element_type <> 1
  order by coalesce(m.m, 0) desc, coalesce(ls.selected_by_percent, 0) desc;
$function$
;
