-- FPL start record: count only matches that have kicked off (12 Oct 2026).
--
-- Bug (found 11 Oct): FPL creates every player's gameweek row, with 0
-- minutes, once the deadline passes. refresh_fpl_start_record counted those
-- rows as matches the player was available for and didn't start, so until a
-- club played, its regulars looked like they had been dropped. Haaland was
-- 5 starts of 6 (start chance 0.78) on 11 Oct though he had started every
-- match; on 12 Oct the 71 players in that evening's match were affected.
-- Each gameweek it understated a club's regulars for up to three days, and
-- the unplayed row also took the top weight in the recency weighting.
--
-- Fix: join the FPL fixture and keep a row only once the match has started
-- (or finished; kick-off time if the fixture row is missing). The depth
-- chart backtests (backtest_depth_floor.py, backtest_depth_recency.py)
-- already use only matches before each kick-off, so this makes production
-- match the rule that was tested; their results don't change.

create or replace function public.refresh_fpl_start_record()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
end $function$;

select public.refresh_fpl_start_record();

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
select '2026-10-12', 'prediction',
  'FPL: start record ignores matches not yet played',
  'Regulars at clubs yet to play a gameweek were counted as fit and not picked (Haaland 5 starts of 6, start chance 0.78, on 11 Oct).',
  'refresh_fpl_start_record counts a gameweek only once its fixture has kicked off. Matches the backtested rule (only matches before kick-off).',
  'leaguewide_v6', 'leaguewide_v6', 'migration 20261012080000'
where not exists (select 1 from public.model_change_log where reference = 'migration 20261012080000');

-- Integrity: every gameweek in the 10 after the next deadline should have
-- projections from the latest run (12 Oct 2026; GW16 was 15 days old on
-- 11 Oct because the pipeline window stopped short during a live
-- gameweek -- fixed in scripts/get_next_matchweek_range.py). Warning, as
-- the site still works with older rows. Skipped if already added.
do $$
declare
  def text := pg_get_functiondef('public.check_model_integrity'::regproc);
  anchor text := '  -- Catalogue (2026-09-26)';
  addition text := $add$  -- Projection horizon (2026-10-12): each of the 10 gameweeks after the
  -- next deadline has leaguewide_v6 rows from within 36h of the newest run.
  select 'fpl_projection_horizon_fresh',
    case when n = 0 then 'ok' else 'warning' end, n,
    'Gameweeks in the 10 after the next deadline with no leaguewide_v6 baseline projections from within 36 hours of the newest run (pipeline window: scripts/get_next_matchweek_range.py)'
  from (select count(*) n
          from generate_series(public.ai_next_fpl_gameweek(public.fpl_current_season_id()),
                               least(38, public.ai_next_fpl_gameweek(public.fpl_current_season_id()) + 9)) s(gw)
          left join (select ff.fpl_event_id gw, max(p.generated_at) g
                       from public.fpl_player_projections p
                       join public.fpl_fixtures ff on ff.canonical_fixture_id = p.fixture_id and ff.season_id = p.season_id
                      where p.season_id = public.fpl_current_season_id() and p.model_version = 'leaguewide_v6'
                        and coalesce(p.scenario_key, 'baseline') = 'baseline'
                      group by 1) w on w.gw = s.gw
         where coalesce(w.g, '-infinity'::timestamptz) <
               (select max(generated_at) from public.fpl_player_projections
                 where season_id = public.fpl_current_season_id() and model_version = 'leaguewide_v6') - interval '36 hours') x
  union all
$add$;
begin
  if position('fpl_projection_horizon_fresh' in def) > 0 then return; end if;
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'check_model_integrity anchor not found exactly once';
  end if;
  execute replace(def, anchor, addition || anchor);
end $$;
