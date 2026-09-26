-- Live definition exported from the database (function get_rolling_xi_candidates(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_rolling_xi_candidates(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_code bigint, web_name text, team_name text, element_type integer, august_cost integer, now_cost integer, total_points integer, minutes integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    p.fpl_code, p.web_name, t.display_name, p.element_type,
    -- cost_change_start is the movement SINCE the season opened, so
    -- subtracting it recovers the opening price.
    (p.now_cost - coalesce((p.source_payload->>'cost_change_start')::int, 0)),
    p.now_cost, coalesce(p.total_points, 0), coalesce(p.minutes, 0)
  from public.fpl_players p
  left join public.teams t on t.team_id = p.canonical_team_id
  where p.season_id = p_season_id
    and p.now_cost is not null
    and p.element_type is not null
    -- A player who hasn't appeared can't be in a best XI, and including
    -- them only slows the solve.
    and coalesce(p.minutes, 0) > 0
  order by coalesce(p.total_points, 0) desc;
$function$
;
