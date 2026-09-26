-- Live definition exported from the database (function get_digest_gameweeks(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_digest_gameweeks(p_season_id bigint DEFAULT 13)
 RETURNS TABLE(gameweek integer, first_date date, last_date date, days integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;
