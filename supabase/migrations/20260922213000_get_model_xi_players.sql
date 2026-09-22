-- The model's XI for one gameweek, NAMED, so it can sit beside the week's
-- actual best XI on the page. Same selection as get_totw_vs_model (the
-- mandatory 1-3-3-1 spine, then the three best remaining), kept in SQL
-- rather than duplicated in the front end, and each player carries what the
-- model projected, what he actually scored, and whether he made the perfect
-- XI -- which is the quickest read of the comparison.
create or replace function public.get_model_xi_players(p_event_id integer, p_season_id bigint default 13)
returns table(
  fpl_player_id bigint, web_name text, team_name text, position_label text, element_type integer,
  projected_points numeric, actual_points integer, minutes integer, in_perfect_xi boolean)
language sql stable set search_path to 'public','pg_temp'
as $$
  with proj as (
    select pr.fpl_player_id, p.element_type, p.web_name,
      sum(pr.expected_fpl_points) as proj_pts,
      row_number() over (partition by p.element_type order by sum(pr.expected_fpl_points) desc) as rn
    from public.fpl_player_projections pr
    join public.fixtures f on f.fixture_id = pr.fixture_id
    join public.fpl_players p on p.fpl_player_id = pr.fpl_player_id and p.season_id = p_season_id
    where pr.model_version = 'leaguewide_v6' and pr.scenario_key = 'baseline'
      and f.season_id = p_season_id and f.matchweek = p_event_id
    group by pr.fpl_player_id, p.element_type, p.web_name
  ),
  model_xi as (
    select * from proj
    where (element_type=1 and rn<=1) or (element_type=2 and rn<=3)
       or (element_type=3 and rn<=3) or (element_type=4 and rn<=1)
    union all
    select * from (
      select * from proj
      where (element_type=2 and rn between 4 and 5) or (element_type=3 and rn between 4 and 5)
         or (element_type=4 and rn between 2 and 3)
      order by proj_pts desc limit 3
    ) rest
  ),
  totw as (select fpl_player_id from public.get_team_of_the_week(p_event_id, p_season_id))
  select mx.fpl_player_id::bigint, mx.web_name, coalesce(t.name,'')::text,
         (case mx.element_type when 1 then 'GK' when 2 then 'DEF' when 3 then 'MID' else 'FWD' end)::text,
         mx.element_type, round(mx.proj_pts,1), coalesce(g.total_points,0)::integer,
         coalesce(g.minutes,0)::integer,
         (mx.fpl_player_id in (select fpl_player_id from totw))
  from model_xi mx
  left join public.fpl_players p on p.fpl_player_id = mx.fpl_player_id and p.season_id = p_season_id
  left join public.fpl_teams t on t.fpl_team_id = p.fpl_team_id and t.season_id = p_season_id
  left join public.fpl_player_gameweeks g
    on g.fpl_player_id = mx.fpl_player_id and g.season_id = p_season_id and g.fpl_event_id = p_event_id
  order by mx.element_type, mx.proj_pts desc;
$$;
comment on function public.get_model_xi_players(integer, bigint) is
  'The eleven the model rated highest for a gameweek, with projected points, actual points and whether each made the perfect XI.';
grant execute on function public.get_model_xi_players(integer, bigint) to anon, authenticated;
