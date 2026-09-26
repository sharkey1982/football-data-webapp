-- Live definition exported from the database (function get_daily_digest(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_daily_digest(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(change_type text, fpl_player_id bigint, web_name text, slug text, team_name text, position_label text, ownership numeric, old_value text, new_value text, detail text, from_date date, to_date date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with dates as (
    select max(snapshot_date) as to_d,
           (select max(snapshot_date) from public.fpl_player_snapshots
            where snapshot_date < (select max(snapshot_date) from public.fpl_player_snapshots)) as from_d
    from public.fpl_player_snapshots
  ),
  cur as (
    select s.* from public.fpl_player_snapshots s, dates d where s.snapshot_date = d.to_d
  ),
  prev as (
    select s.* from public.fpl_player_snapshots s, dates d where s.snapshot_date = d.from_d
  ),
  joined as (
    select c.fpl_player_id, c.now_cost as c_cost, p.now_cost as p_cost,
      c.selected_by_percent as c_own, p.selected_by_percent as p_own,
      c.status as c_status, p.status as p_status, c.news as c_news,
      pl.web_name, pl.slug, pl.element_type, t.display_name as team_name
    from cur c
    join prev p on p.fpl_player_id = c.fpl_player_id
    join public.fpl_players pl on pl.fpl_player_id = c.fpl_player_id
    left join public.teams t on t.team_id = pl.canonical_team_id
    where pl.web_name is not null
  ),
  labelled as (
    select j.*,
      case j.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end as pos
    from joined j
  )
  select 'price_rise', fpl_player_id, web_name, slug, team_name, pos,
    round(c_own::numeric, 1),
    '£' || round(p_cost / 10.0, 1)::text || 'm', '£' || round(c_cost / 10.0, 1)::text || 'm',
    null, (select from_d from dates), (select to_d from dates)
  from labelled where c_cost > p_cost

  union all
  select 'price_fall', fpl_player_id, web_name, slug, team_name, pos,
    round(c_own::numeric, 1),
    '£' || round(p_cost / 10.0, 1)::text || 'm', '£' || round(c_cost / 10.0, 1)::text || 'm',
    null, (select from_d from dates), (select to_d from dates)
  from labelled where c_cost < p_cost

  union all
  -- Availability changes are the ones people most want pushed at them,
  -- and the only category where the direction of travel matters more
  -- than the magnitude.
  select 'availability', fpl_player_id, web_name, slug, team_name, pos,
    round(c_own::numeric, 1), p_status, c_status, nullif(c_news, ''),
    (select from_d from dates), (select to_d from dates)
  from labelled where c_status is distinct from p_status

  union all
  select 'ownership', fpl_player_id, web_name, slug, team_name, pos,
    round(c_own::numeric, 1),
    round(p_own::numeric, 1)::text || '%', round(c_own::numeric, 1)::text || '%',
    null, (select from_d from dates), (select to_d from dates)
  from labelled
  where abs(c_own::numeric - p_own::numeric) >= 0.5

  order by 7 desc nulls last;
$function$
;
