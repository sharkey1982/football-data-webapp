-- Live definition exported from the database (function refresh_fpl_start_record()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_fpl_start_record()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rows integer; v_season bigint := public.fpl_current_season_id();
begin
  delete from public.fpl_player_start_record;
  insert into public.fpl_player_start_record (fpl_player_id, season_id, appearances, starts, available_matches, prior_rate, starts_recent, available_recent)
  with g as (
    select pg.fpl_player_id, pg.kickoff_time::date as d, pg.kickoff_time, pg.minutes,
           coalesce((pg.source_payload->'stats'->>'starts')::int, 0) as st, p.fpl_code
      from public.fpl_player_gameweeks pg
      join public.fpl_players p on p.fpl_player_id = pg.fpl_player_id and p.season_id = pg.season_id
      left join public.fpl_fixtures f on f.season_id = pg.season_id and f.fpl_fixture_id = pg.fpl_fixture_id
     where pg.season_id = v_season
       -- Only matches that have kicked off (12 Oct 2026): FPL creates a
       -- player's gameweek row, with 0 minutes, once the deadline passes.
       and coalesce(f.started or f.finished, pg.kickoff_time <= now())
  ), first_snap as (
    select distinct on (fpl_player_id) fpl_player_id, snapshot_date as fd, status as fs,
           (source_payload->>'news_added')::timestamptz::date as na
      from public.fpl_player_snapshots where season_id = v_season
     order by fpl_player_id, snapshot_date
  ), ga as (
    select g.*,
      case when g.d >= fs.fd then
             coalesce((select s.status from public.fpl_player_snapshots s
                        where s.fpl_player_id = g.fpl_player_id and s.season_id = v_season and s.snapshot_date <= g.d
                        order by s.snapshot_date desc limit 1), 'a') not in ('i','s','u','n')
           else not (coalesce(fs.fs, 'a') in ('i','s','u','n') and fs.na <= g.d)
      end as avail,
      -- Latest match 1, then halving every three matches (10 Oct 2026).
      power(0.5, (row_number() over (partition by g.fpl_player_id order by g.kickoff_time desc) - 1) / 3.0) as w
      from g left join first_snap fs using (fpl_player_id)
  ), prev as (
    select fpl_code, least(0.9, count(*) filter (where starts > 0) / 38.0) as pr
      from public.fpl_player_gameweek_history
     where season_id = (select max(season_id) from public.fpl_player_gameweek_history where season_id < v_season)
     group by fpl_code
  )
  select ga.fpl_player_id, v_season,
         count(*) filter (where ga.minutes > 0), coalesce(sum(ga.st), 0), count(*) filter (where ga.avail), max(pv.pr),
         round(coalesce(sum(ga.w) filter (where ga.st > 0), 0), 4), round(coalesce(sum(ga.w) filter (where ga.avail), 0), 4)
    from ga left join prev pv on pv.fpl_code = ga.fpl_code
   group by ga.fpl_player_id;
  get diagnostics v_rows = row_count;
  return v_rows;
end $function$
;
