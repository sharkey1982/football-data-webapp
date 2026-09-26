-- Live definition exported from the database (function get_totw_vs_model(p_event_id integer, p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_totw_vs_model(p_event_id integer DEFAULT NULL::integer, p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_event_id integer, actual_xi_points integer, model_xi_actual_points integer, overlap_count integer, model_xi_projected numeric, overlap_names text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with totw as (
    select * from public.get_team_of_the_week(p_event_id, p_season_id)
  ),
  ev as (select coalesce(p_event_id, (select max(fpl_event_id) from totw)) as e),
  -- The model's preferred XI for the same gameweek, by projected points,
  -- under the same formation minimums.
  proj as (
    select pr.fpl_player_id, p.element_type,
      sum(pr.expected_fpl_points) as proj_pts,
      row_number() over (
        partition by p.element_type order by sum(pr.expected_fpl_points) desc
      ) as rn
    from public.fpl_player_projections pr
    join public.fixtures f on f.fixture_id = pr.fixture_id
    join public.fpl_players p on p.fpl_player_id = pr.fpl_player_id
    join ev on f.matchweek = ev.e
    where pr.model_version = 'leaguewide_v6' and pr.scenario_key = 'baseline'
      and f.season_id = p_season_id
    group by pr.fpl_player_id, p.element_type
  ),
  model_xi as (
    select * from (
      select *, true as mand from proj
      where (element_type=1 and rn<=1) or (element_type=2 and rn<=3)
         or (element_type=3 and rn<=3) or (element_type=4 and rn<=1)
      union all
      select * from (
        select *, false from proj
        where (element_type=2 and rn between 4 and 5) or (element_type=3 and rn between 4 and 5)
           or (element_type=4 and rn between 2 and 3)
        order by proj_pts desc limit 3
      ) f2
    ) m
  ),
  model_actual as (
    select mx.fpl_player_id, coalesce(g.total_points, 0) as pts, mx.proj_pts
    from model_xi mx
    left join public.fpl_player_gameweeks g
      on g.fpl_player_id = mx.fpl_player_id and g.season_id = p_season_id
     and g.fpl_event_id = (select e from ev)
  )
  select
    (select e from ev)::integer,
    (select sum(points)::integer from totw),
    (select sum(pts)::integer from model_actual),
    (select count(*)::integer from totw t where t.fpl_player_id in (select fpl_player_id from model_xi)),
    (select round(sum(proj_pts)::numeric, 1) from model_actual),
    (select array_agg(t.web_name order by t.points desc) from totw t where t.fpl_player_id in (select fpl_player_id from model_xi));
$function$
;
