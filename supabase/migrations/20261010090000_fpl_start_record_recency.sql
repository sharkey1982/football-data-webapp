-- FPL depth chart: recent matches count for more in the start record
-- (10 Oct 2026).
--
-- Chris: J.Timber (1st choice at right-back, back in the side) was 44% to
-- start and Ben White (2nd) 53%. Timber didn't play GW1-3 while White
-- started; FPL's data has him fit, so those matches counted as "fit and not
-- picked" in full. But Timber replaced White at half-time in GW4 and
-- started GW5 with White unused.
--
-- Registered backtest (scripts/backtest_depth_recency.py, GW3-5, 1,761
-- outfield player-matches; rule and decision fixed before scoring): each
-- earlier match weighted 0.5 ^ (matches since / 3). Brier 0.07830 ->
-- 0.07624, log loss 0.27018 -> 0.26363 (paired Brier difference -0.0021,
-- s.e. 0.0004); first choices 0.10913 -> 0.10566. Adopted as registered.
-- (A half-life of 1 scored better still; it was not the registered rule
-- and is left for a later test with more gameweeks.)
--
-- 1. fpl_player_start_record: starts_recent, available_recent (weighted).
-- 2. refresh_fpl_start_record fills them.
-- 3. get_fpl_depth_inputs uses them for the depth chart's start rate and
--    first-choice floor. Other uses of the start record are unchanged.

alter table public.fpl_player_start_record
  add column if not exists starts_recent numeric,
  add column if not exists available_recent numeric;
comment on column public.fpl_player_start_record.starts_recent is 'Starts this season, each match weighted 0.5^(matches since / 3) (latest = 1). Depth chart input.';
comment on column public.fpl_player_start_record.available_recent is 'Matches available for this season, weighted as starts_recent. Depth chart input.';

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
     where pg.season_id = v_season
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

create or replace function public.get_fpl_depth_inputs()
 returns table(fixture_id bigint, team_id bigint, formation text, fpl_player_id bigint, element_type integer, tactical_role text, depth_rank integer, availability double precision, rate double precision, start_if_fit double precision, starts double precision, available double precision)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select a.fixture_id::bigint, a.team_id::bigint, coalesce(c.formation, ''),
         d.fpl_player_id::bigint, p.element_type::integer, d.tactical_role, d.depth_rank::integer,
         a.availability::float8,
         -- Recent-weighted record (10 Oct 2026); unweighted if not yet filled.
         case when p.element_type = 1 then null
              else least(0.97, (coalesce(sr.starts_recent, sr.starts, 0) + coalesce(sr.prior_rate, 0.20)) / (coalesce(sr.available_recent, sr.available_matches, 0) + 1.0)) end::float8,
         fc.start_if_fit::float8,
         case when p.element_type = 1 then null else coalesce(sr.starts_recent, sr.starts, 0) end::float8,
         case when p.element_type = 1 then null else coalesce(sr.available_recent, sr.available_matches, 0) end::float8
    from public.fpl_fixture_availability_store a
    join public.team_player_tactical_defaults d
      on d.fpl_player_id = a.fpl_player_id and d.team_id = a.team_id and d.season_id = public.fpl_current_season_id()
    join public.fpl_players p on p.fpl_player_id = a.fpl_player_id and p.season_id = public.fpl_current_season_id()
    left join public.fixture_team_tactical_consensus c on c.fixture_id = a.fixture_id and c.team_id = a.team_id
    left join public.fpl_player_start_record sr on sr.fpl_player_id = a.fpl_player_id
    left join lateral (
      select x.start_if_fit from public.fpl_player_first_choice x
       where x.fpl_player_id = a.fpl_player_id and x.removed_at is null
         and a.kickoff_date between x.effective_from and coalesce(x.effective_to, '9999-12-31'::date)
       order by x.set_at desc limit 1) fc on true;
$function$;

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
values ('2026-10-10', 'prediction',
  'FPL: recent matches count for more in the depth chart''s start record',
  'J.Timber (1st choice, back in the side and starting GW5) was projected below Ben White, whose starts came while Timber was out of the side in GW1-3.',
  'Each earlier match weighted 0.5^(matches since / 3) in the depth chart''s start rate and first-choice floor. Registered backtest (scripts/backtest_depth_recency.py, GW3-5): Brier 0.07830 -> 0.07624, log loss 0.27018 -> 0.26363; first choices 0.10913 -> 0.10566.',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261010090000');
