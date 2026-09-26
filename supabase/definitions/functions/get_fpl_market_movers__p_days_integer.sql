-- Live definition exported from the database (function get_fpl_market_movers(p_days integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_market_movers(p_days integer DEFAULT 7)
 RETURNS TABLE(fpl_player_id bigint, web_name text, slug text, team_name text, position_label text, price_now numeric, price_change numeric, ownership_now numeric, ownership_change numeric, transfers_in_event bigint, transfers_out_event bigint, status text, news text, from_date date, to_date date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with bounds as (
    select max(snapshot_date) as to_d,
           max(snapshot_date) - (p_days || ' days')::interval as cutoff
    from public.fpl_player_snapshots
  ),
  first_in_window as (
    select distinct on (s.fpl_player_id) s.fpl_player_id, s.now_cost, s.selected_by_percent, s.snapshot_date
    from public.fpl_player_snapshots s, bounds b
    where s.snapshot_date >= b.cutoff::date
    order by s.fpl_player_id, s.snapshot_date asc
  ),
  latest as (
    select s.*
    from public.fpl_player_snapshots s, bounds b
    where s.snapshot_date = b.to_d
  )
  select
    l.fpl_player_id,
    p.web_name,
    p.slug,
    t.display_name,
    case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
    round(l.now_cost / 10.0, 1),
    round((l.now_cost - f.now_cost) / 10.0, 1),
    round(l.selected_by_percent::numeric, 1),
    round(l.selected_by_percent::numeric - f.selected_by_percent::numeric, 1),
    coalesce(l.transfers_in_event, 0)::bigint,
    coalesce(l.transfers_out_event, 0)::bigint,
    l.status,
    nullif(l.news, ''),
    f.snapshot_date,
    l.snapshot_date
  from latest l
  join first_in_window f on f.fpl_player_id = l.fpl_player_id
  join public.fpl_players p on p.fpl_player_id = l.fpl_player_id
  left join public.teams t on t.team_id = p.canonical_team_id
  where p.web_name is not null;
$function$
;
