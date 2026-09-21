-- ============================================================================
-- Gameweek digest, part 2: the gameweek lookup.
--
-- The first version read public.fpl_gameweeks directly from invoker functions
-- and failed for anonymous visitors: fpl_gameweeks is deliberately private
-- (RLS on, no read policy -- the service-only pattern from the security
-- remediation), and the site never reads it directly.
--
-- Rather than open that table, this adds ONE narrowly scoped SECURITY DEFINER
-- helper that answers a single question -- which gameweek does this date
-- belong to? -- and returns only an integer, so nothing else in the table
-- (including source_payload) can be read through it. The two digest
-- functions stay SECURITY INVOKER and call it.
-- ============================================================================

create or replace function public.fpl_gameweek_for_date(p_season_id bigint, p_date date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  -- The latest gameweek whose deadline fell on an EARLIER date (UK time).
  select max(fpl_event_id)::integer
  from public.fpl_gameweeks
  where season_id = p_season_id
    and (deadline_time at time zone 'Europe/London')::date < p_date;
$$;

revoke all on function public.fpl_gameweek_for_date(bigint, date) from public;
grant execute on function public.fpl_gameweek_for_date(bigint, date) to anon, authenticated;

create or replace function public.get_digest_gameweeks(p_season_id bigint default 13)
returns table(gameweek integer, first_date date, last_date date, days integer)
language sql
stable
security invoker
set search_path = public
as $$
  with days as (select distinct snapshot_date as d from public.fpl_player_snapshots),
  pairs as (select d as to_d, lag(d) over (order by d) as from_d from days),
  owned as (
    select p.to_d, public.fpl_gameweek_for_date(p_season_id, p.to_d) as gw
    from pairs p where p.from_d is not null
  )
  select gw::integer, min(to_d), max(to_d), count(*)::integer
  from owned where gw is not null
  group by gw
  order by gw desc;
$$;

create or replace function public.get_gameweek_digest(p_season_id bigint default 13, p_gameweek integer default null)
returns table(gameweek integer, event_date date, change_type text, fpl_player_id bigint, web_name text, slug text,
              team_name text, position_label text, ownership numeric, old_value text, new_value text, detail text)
language sql
stable
security invoker
set search_path = public
as $$
  with days as (select distinct snapshot_date as d from public.fpl_player_snapshots),
  pairs as (select d as to_d, lag(d) over (order by d) as from_d from days),
  owned as (
    select p.to_d, p.from_d, public.fpl_gameweek_for_date(p_season_id, p.to_d) as gw
    from pairs p where p.from_d is not null
  ),
  target as (select coalesce(p_gameweek, (select max(gw) from owned)) as gw),
  sel as (select o.* from owned o, target t where o.gw = t.gw),
  joined as (
    select s.gw, s.to_d, c.fpl_player_id,
      c.now_cost as c_cost, pv.now_cost as p_cost,
      c.selected_by_percent as c_own, pv.selected_by_percent as p_own,
      c.status as c_status, pv.status as p_status, c.news as c_news,
      pl.web_name, pl.slug, pl.element_type, t.display_name as team_name
    from sel s
    join public.fpl_player_snapshots c on c.snapshot_date = s.to_d
    join public.fpl_player_snapshots pv on pv.snapshot_date = s.from_d and pv.fpl_player_id = c.fpl_player_id
    join public.fpl_players pl on pl.fpl_player_id = c.fpl_player_id
    left join public.teams t on t.team_id = pl.canonical_team_id
    where pl.web_name is not null
  ),
  labelled as (
    select j.*, case j.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end as pos
    from joined j
  )
  select gw::integer, to_d, 'price_rise', fpl_player_id, web_name, slug, team_name, pos, round(c_own::numeric, 1),
    '£' || round(p_cost / 10.0, 1)::text || 'm', '£' || round(c_cost / 10.0, 1)::text || 'm', null
  from labelled where c_cost > p_cost
  union all
  select gw::integer, to_d, 'price_fall', fpl_player_id, web_name, slug, team_name, pos, round(c_own::numeric, 1),
    '£' || round(p_cost / 10.0, 1)::text || 'm', '£' || round(c_cost / 10.0, 1)::text || 'm', null
  from labelled where c_cost < p_cost
  union all
  select gw::integer, to_d, 'availability', fpl_player_id, web_name, slug, team_name, pos, round(c_own::numeric, 1),
    p_status, c_status, nullif(c_news, '')
  from labelled where c_status is distinct from p_status
  union all
  select gw::integer, to_d, 'ownership', fpl_player_id, web_name, slug, team_name, pos, round(c_own::numeric, 1),
    round(p_own::numeric, 1)::text || '%', round(c_own::numeric, 1)::text || '%', null
  from labelled where abs(c_own::numeric - p_own::numeric) >= 0.5
  order by 2 desc, 9 desc nulls last;
$$;
