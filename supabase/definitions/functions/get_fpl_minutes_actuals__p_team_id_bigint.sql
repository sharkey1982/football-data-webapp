-- Live definition exported from the database (function get_fpl_minutes_actuals(p_team_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_minutes_actuals(p_team_id bigint)
 RETURNS TABLE(fpl_player_id bigint, fpl_event_id integer, minutes integer, started boolean, available boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with cur as (select public.fpl_current_season_id() as s),
  pl as (select p.fpl_player_id from public.fpl_players p, cur where p.canonical_team_id = p_team_id and p.season_id = cur.s),
  g as (
    select pg.fpl_player_id, pg.fpl_event_id, pg.kickoff_time::date as d, pg.minutes,
           coalesce((pg.source_payload->'stats'->>'starts')::int, 0) = 1 as st
      from public.fpl_player_gameweeks pg join pl using (fpl_player_id), cur
     where pg.season_id = cur.s
  ),
  evs as (select distinct g.fpl_event_id from g order by g.fpl_event_id desc limit 5),
  first_snap as (
    select distinct on (s.fpl_player_id) s.fpl_player_id, s.snapshot_date as fd, s.status as fs,
           (s.source_payload->>'news_added')::timestamptz::date as na
      from public.fpl_player_snapshots s join pl using (fpl_player_id), cur
     where s.season_id = cur.s
     order by s.fpl_player_id, s.snapshot_date
  ),
  ga as (
    select g.*,
      case when g.d >= fs.fd then
             coalesce((select s.status from public.fpl_player_snapshots s, cur
                        where s.fpl_player_id = g.fpl_player_id and s.season_id = cur.s and s.snapshot_date <= g.d
                        order by s.snapshot_date desc limit 1), 'a') not in ('i','s','u','n')
           else not (coalesce(fs.fs, 'a') in ('i','s','u','n') and fs.na <= g.d)
      end as avail
      from g left join first_snap fs using (fpl_player_id)
  )
  select ga.fpl_player_id::bigint, ga.fpl_event_id, sum(ga.minutes)::integer, bool_or(ga.st), bool_or(ga.avail)
    from ga
   where ga.fpl_event_id in (select evs.fpl_event_id from evs)
   group by ga.fpl_player_id, ga.fpl_event_id;
$function$
;
