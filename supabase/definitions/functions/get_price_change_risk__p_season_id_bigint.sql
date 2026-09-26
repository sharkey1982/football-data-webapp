-- Live definition exported from the database (function get_price_change_risk(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_price_change_risk(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_player_id bigint, web_name text, slug text, team_name text, position_label text, price numeric, ownership numeric, transfers_in integer, transfers_out integer, net_transfers integer, pressure numeric, direction text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with latest as (
    select max(snapshot_date) as d from public.fpl_player_snapshots
  ),
  snap as (
    select s.* from public.fpl_player_snapshots s
    join latest l on s.snapshot_date = l.d
  ),
  -- Total squads is unknown, so ownership share stands in for the owner
  -- base. Any constant scale factor cancels when players are compared
  -- with each other, which is all this ranking needs.
  calc as (
    select sn.*,
      coalesce(sn.transfers_in_event, 0) - coalesce(sn.transfers_out_event, 0) as net,
      greatest(sn.selected_by_percent::numeric, 0.1) as owned
    from snap sn
  )
  select
    p.fpl_player_id, p.web_name, p.slug, t.display_name,
    case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
    round(c.now_cost / 10.0, 1),
    round(c.selected_by_percent::numeric, 1),
    coalesce(c.transfers_in_event, 0),
    coalesce(c.transfers_out_event, 0),
    c.net::integer,
    round((c.net / c.owned / 1000.0)::numeric, 2),
    case when c.net > 0 then 'rise' when c.net < 0 then 'fall' else 'steady' end
  from calc c
  join public.fpl_players p on p.fpl_player_id = c.fpl_player_id
  left join public.teams t on t.team_id = p.canonical_team_id
  where p.web_name is not null and c.net <> 0
  order by abs(c.net / c.owned) desc;
$function$
;
