-- FPL start probability: starts over AVAILABLE matches, with last season as a
-- prior (5 Oct 2026).
--
-- Chris: returning regulars should regain their place in long-term
-- projections. Caicedo (fit from GW8) was 0.03 to start, Saliba peaked at 0.15.
-- Cause: outfield start chances came from fixed tiers on this season's
-- appearances, so weeks out injured counted like weeks dropped, and players
-- with no appearances were "unknown squad players" (0.18).
--
-- Backtest (predict GW3, GW4, GW5 outfield starters from earlier gameweeks
-- only, 1,765 player-matches, then the existing team scaling):
--   current tiers                                  Brier 0.0992  log-loss 0.333
--   starts / all team matches, prior x2            Brier 0.0954  log-loss 0.320
--   starts / AVAILABLE matches, prior x1 (chosen)  Brier 0.0944  log-loss 0.313
--   same, prior x3                                 Brier 0.1011  log-loss 0.333
--   same, scaled by line (DEF / rest)              no better -- not adopted
-- Availability for a past match: the daily FPL snapshot on or before it, or
-- before 13 Sep the first snapshot's injury/suspension and its news date
-- (only 5 of 459 player-matches marked unavailable had a start).
-- Of six fit regulars returning from absence in that window, one started
-- straight away -- so a returner rises as he gets picked, not at once.
--
-- 1. fpl_player_start_record: per player this season -- appearances, starts,
--    team matches available for, last season's start rate (starts/38, max
--    0.9). Refreshed by refresh_fpl_start_record(), called from
--    refresh_fpl_fixture_availability() at the start of every projection run.
-- 2. fpl_fallback_start_probability_v6: outfield start rate =
--    (starts + prior) / (available matches + 1), max 0.97, times fixture
--    availability. Goalkeepers unchanged. Replaces the flagged-player prior
--    added earlier today (20261005230000), which this generalises.

create table public.fpl_player_start_record (
  fpl_player_id bigint primary key,
  season_id bigint not null,
  appearances integer not null,
  starts integer not null,
  available_matches integer not null,
  prior_rate numeric,
  refreshed_at timestamptz not null default now()
);
alter table public.fpl_player_start_record enable row level security;
create policy fpl_player_start_record_read on public.fpl_player_start_record for select to anon, authenticated using (true);
grant select on public.fpl_player_start_record to anon, authenticated;
comment on table public.fpl_player_start_record is 'Per player, current season: appearances, starts (FPL stats.starts), team matches he was available for (daily snapshots; before the first snapshot, its injury/suspension status from its news date), and last season''s league start rate. Feeds the outfield start probability in fpl_fallback_start_probability_v6. Refreshed by refresh_fpl_start_record().';

create or replace function public.refresh_fpl_start_record()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_rows integer; v_season bigint := public.fpl_current_season_id();
begin
  delete from public.fpl_player_start_record;
  insert into public.fpl_player_start_record (fpl_player_id, season_id, appearances, starts, available_matches, prior_rate)
  with g as (
    select pg.fpl_player_id, pg.kickoff_time::date as d, pg.minutes,
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
      end as avail
      from g left join first_snap fs using (fpl_player_id)
  ), prev as (
    select fpl_code, least(0.9, count(*) filter (where starts > 0) / 38.0) as pr
      from public.fpl_player_gameweek_history
     where season_id = (select max(season_id) from public.fpl_player_gameweek_history where season_id < v_season)
     group by fpl_code
  )
  select ga.fpl_player_id, v_season,
         count(*) filter (where ga.minutes > 0), coalesce(sum(ga.st), 0), count(*) filter (where ga.avail), max(pv.pr)
    from ga left join prev pv on pv.fpl_code = ga.fpl_code
   group by ga.fpl_player_id;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function public.refresh_fpl_start_record() from public, anon, authenticated;
grant execute on function public.refresh_fpl_start_record() to service_role;

create or replace function public.refresh_fpl_fixture_availability()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_rows integer;
begin
  delete from public.fpl_fixture_availability_store;
  insert into public.fpl_fixture_availability_store
    select v.*, now() from public.fpl_player_fixture_availability v;
  get diagnostics v_rows = row_count;
  -- Start records change with the same gameweek data (5 Oct 2026).
  perform public.refresh_fpl_start_record();
  return v_rows;
end $$;

select public.refresh_fpl_start_record();

create or replace view public.fpl_fallback_start_probability_v6 with (security_invoker=true) as
 WITH base AS (
         SELECT f.fixture_id,
            fp.canonical_team_id AS team_id,
            fp.fpl_player_id,
            fp.element_type,
            COALESCE(u.appearances, (0)::bigint) AS apps,
            COALESCE(u.likely_starts, (0)::bigint) AS starts,
            COALESCE(u.sub_appearances, (0)::bigint) AS subs,
            COALESCE(av.availability, ((COALESCE(fp.chance_of_playing_next_round, fp.chance_of_playing_this_round,
                CASE
                    WHEN (fp.status = ANY (ARRAY['i'::text, 'u'::text, 's'::text])) THEN 0
                    ELSE 100
                END))::numeric / (100)::numeric)) AS availability,
            COALESCE(h.squad_status, 'unknown'::text) AS squad_status,
            COALESCE(sr.starts, 0) AS sr_starts,
            COALESCE(sr.available_matches, 0) AS sr_available,
            sr.prior_rate
           FROM (((((fixtures f
             JOIN leagues l ON ((l.league_id = f.league_id)))
             JOIN fpl_players fp ON (((fp.season_id = f.season_id) AND ((fp.canonical_team_id = f.home_team_id) OR (fp.canonical_team_id = f.away_team_id)))))
             LEFT JOIN fpl_player_substitution_usage u ON (((u.season_id = fp.season_id) AND (u.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN player_squad_hierarchy h ON (((h.season_id = fp.season_id) AND (h.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN fpl_fixture_availability_store av ON (((av.fixture_id = f.fixture_id) AND (av.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN fpl_player_start_record sr ON ((sr.fpl_player_id = fp.fpl_player_id))
          WHERE ((f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (l.code = 'E0'::text))
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    LEAST(0.98, (availability *
        CASE
            -- Outfield (2026-10-05, backtested on GW3-5 starts: Brier 0.0992 ->
            -- 0.0944, log-loss 0.333 -> 0.313): starts over the matches he was
            -- AVAILABLE for, plus last season's start rate counted as one more
            -- match (0.20 with no Premier League record). Injured weeks no
            -- longer count against him; fit weeks on the bench do.
            WHEN (element_type <> 1) THEN LEAST(0.97, (((sr_starts)::numeric + COALESCE(prior_rate, 0.20)) / ((sr_available)::numeric + 1.0)))
            -- Goalkeepers: unchanged (not covered by the backtest).
            WHEN ((apps >= 4) AND (starts = apps)) THEN 0.96
            WHEN ((apps = 3) AND (starts = 3)) THEN 0.94
            WHEN ((apps >= 3) AND (starts >= (apps - 1))) THEN 0.84
            WHEN (apps > 0) THEN GREATEST(0.05, LEAST(0.90, (((starts)::numeric + 0.5) / ((apps)::numeric + 1.0))))
            ELSE
            CASE squad_status
                WHEN 'first_choice'::text THEN 0.72
                WHEN 'rotation'::text THEN 0.38
                WHEN 'backup'::text THEN 0.12
                ELSE 0.18
            END
        END)) AS start_probability,
    availability,
    apps,
    starts,
    subs,
        CASE
            WHEN ((element_type <> 1) AND (sr_available >= 3) AND (sr_starts >= sr_available)) THEN 'nailed_history'::text
            WHEN ((element_type <> 1) AND (sr_available >= 3) AND (sr_starts >= (sr_available - 1))) THEN 'strong_history'::text
            WHEN (element_type <> 1) THEN 'history_hierarchy'::text
            WHEN ((apps >= 3) AND (starts = apps)) THEN 'nailed_history'::text
            WHEN ((apps >= 3) AND (starts >= (apps - 1))) THEN 'strong_history'::text
            ELSE 'history_hierarchy'::text
        END AS probability_source
   FROM base;

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
values ('2026-10-05', 'prediction',
  'FPL: outfield start chance from starts over available matches, last season as prior',
  'Returning regulars were held near zero once fit (Caicedo 0.03, Saliba at most 0.15): start chances came from tiers on this season''s appearances, so injured weeks counted like dropped weeks, and players with no appearances were rated 0.18.',
  'Outfield start rate = (starts + last-season start rate) / (available matches + 1), max 0.97, times fixture availability; goalkeepers unchanged. Backtest on GW3-5 starts (1,765 player-matches): Brier 0.0992 -> 0.0944, log-loss 0.333 -> 0.313. Line-by-line (DEF/rest) scaling tested and not adopted (no gain).',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261005240000; docs/incidents.md 2026-10-05');

select public.meta_refresh_flow();
update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Per player this season: appearances, starts, matches available for, last season''s start rate -- the input to the outfield start probability.',
  refresh_note = 'refresh_fpl_start_record(), via refresh_fpl_fixture_availability() at the start of each projection run.', purpose_reviewed_at = now()
where node_key = 'object:fpl_player_start_record';
