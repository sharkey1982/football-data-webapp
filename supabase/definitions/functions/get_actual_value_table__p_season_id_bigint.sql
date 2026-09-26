-- Live definition exported from the database (function get_actual_value_table(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_actual_value_table(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_player_id bigint, web_name text, slug text, team_name text, position_label text, price numeric, total_points integer, points_per_million numeric, minutes integer, goals integer, assists integer, clean_sheets integer, bonus integer, ownership numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with latest as (
    select max(snapshot_date) as d from public.fpl_player_snapshots
  ),
  snap as (
    select s.* from public.fpl_player_snapshots s, latest l where s.snapshot_date = l.d
  ),
  totals as (
    select g.fpl_player_id,
      sum(coalesce(g.minutes, 0))::integer as mins,
      sum(coalesce(g.goals_scored, 0))::integer as gls,
      sum(coalesce(g.assists, 0))::integer as ast,
      sum(coalesce(g.clean_sheets, 0))::integer as cs,
      sum(coalesce(g.bonus, 0))::integer as bns
    from public.fpl_player_gameweeks g
    where g.season_id = p_season_id
    group by g.fpl_player_id
  )
  select
    p.fpl_player_id, p.web_name, p.slug, t.display_name,
    case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
    round(sn.now_cost / 10.0, 1),
    coalesce(sn.total_points, 0),
    case when sn.now_cost > 0 then round((coalesce(sn.total_points, 0) / (sn.now_cost / 10.0))::numeric, 2) else 0 end,
    coalesce(tt.mins, 0), coalesce(tt.gls, 0), coalesce(tt.ast, 0), coalesce(tt.cs, 0), coalesce(tt.bns, 0),
    round(sn.selected_by_percent::numeric, 1)
  from snap sn
  join public.fpl_players p on p.fpl_player_id = sn.fpl_player_id
  left join public.teams t on t.team_id = p.canonical_team_id
  left join totals tt on tt.fpl_player_id = sn.fpl_player_id
  where p.web_name is not null and coalesce(sn.total_points, 0) > 0
  order by 8 desc;
$function$
;
