-- ============================================================================
-- L1 start chances in production (Model Lab L1_last_xi_changes passed its
-- holdout on 24 Nov 2026: GW11 Brier 0.0955 v published 0.1151, log loss
-- 0.3131 v 0.3582, starters right 178 v 169, naive last XI 176).
--
-- public.get_fpl_l1_inputs(p_gws): one row per upcoming Premier League
-- fixture (the next p_gws gameweeks) and squad player, with what L1 needs:
--   started_last  1 if he started his side's last finished league game
--   last_min      his minutes in that game
--   start_rate5   starts / available games over the side's last 5 finished
--                 league games (available: in the squad then and not flagged
--                 injured, suspended or unavailable at that gameweek's deadline)
--   availability  this fixture's availability (fpl_fixture_availability_store,
--                 return dates included), else FPL's chance of playing
-- scripts/fpl_l1_start.py turns them into start chances, which
-- refresh_fpl_projections.py writes over the pecking-order ones for those
-- fixtures (fpl_depth_start_store, read first by
-- fpl_fallback_start_probability_v6). The cup-midweek factor was tuned to
-- 1.0 (no effect), so it is not computed here.
-- ============================================================================

create or replace function public.get_fpl_l1_inputs(p_gws integer default 5)
returns table (fixture_id bigint, team_id bigint, fpl_player_id bigint, element_type integer, availability numeric,
               started_last integer, last_min integer, start_rate5 numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with s as (select public.fpl_current_season_id() sid),
  nextgw as (select min(g.fpl_event_id) gw from public.fpl_gameweeks g, s where g.season_id = s.sid and g.deadline_time > now()),
  done as (   -- finished league games per FPL team, newest first
    select x.team, x.fpl_fixture_id, x.fpl_event_id, row_number() over (partition by x.team order by x.kickoff_time desc) rn
      from (select f.fpl_home_team_id team, f.fpl_fixture_id, f.fpl_event_id, f.kickoff_time
              from public.fpl_fixtures f, s where f.season_id = s.sid and (f.finished or f.kickoff_time < now() - interval '3 hours') and f.kickoff_time < now()
            union all
            select f.fpl_away_team_id, f.fpl_fixture_id, f.fpl_event_id, f.kickoff_time
              from public.fpl_fixtures f, s where f.season_id = s.sid and (f.finished or f.kickoff_time < now() - interval '3 hours') and f.kickoff_time < now()) x),
  pg as (
    select pg.fpl_player_id, pg.fpl_fixture_id, coalesce(pg.minutes, 0) minutes,
           coalesce((pg.source_payload->'stats'->>'starts')::int, 0) st
      from public.fpl_player_gameweeks pg, s where pg.season_id = s.sid),
  players as (
    select p.fpl_player_id, p.element_type, p.fpl_team_id, p.canonical_team_id,
           coalesce(p.chance_of_playing_next_round, case when p.status in ('i', 'u', 's', 'n') then 0 else 100 end) / 100.0 chance
      from public.fpl_players p, s where p.season_id = s.sid and p.canonical_team_id is not null),
  last1 as (
    select pl.fpl_player_id, coalesce(pg.st, 0) started_last, coalesce(pg.minutes, 0) last_min
      from players pl join done d on d.team = pl.fpl_team_id and d.rn = 1
      left join pg on pg.fpl_player_id = pl.fpl_player_id and pg.fpl_fixture_id = d.fpl_fixture_id),
  last5 as (
    select pl.fpl_player_id,
           sum(pg.st) filter (where coalesce(fl.status, 'a') not in ('i', 'u', 's', 'n'))::numeric st5,
           count(*) filter (where coalesce(fl.status, 'a') not in ('i', 'u', 's', 'n'))::numeric av5
      from players pl join done d on d.team = pl.fpl_team_id and d.rn <= 5
      join pg on pg.fpl_player_id = pl.fpl_player_id and pg.fpl_fixture_id = d.fpl_fixture_id
      join public.fpl_gameweeks gw on gw.season_id = (select sid from s) and gw.fpl_event_id = d.fpl_event_id
      left join lateral (select sn.status from public.fpl_player_snapshots sn
                          where sn.season_id = (select sid from s) and sn.fpl_player_id = pl.fpl_player_id and sn.captured_at <= gw.deadline_time
                          order by sn.captured_at desc limit 1) fl on true
     group by pl.fpl_player_id),
  upcoming as (
    select f.fixture_id, f.home_team_id, f.away_team_id
      from public.fixtures f join public.leagues l on l.league_id = f.league_id, s, nextgw
     where f.season_id = s.sid and l.code = 'E0' and f.status <> 'played'
       and f.matchweek between nextgw.gw and nextgw.gw + p_gws - 1)
  select u.fixture_id, pl.canonical_team_id, pl.fpl_player_id, pl.element_type,
         coalesce(av.availability, pl.chance) availability,
         coalesce(l1.started_last, 0), coalesce(l1.last_min, 0),
         case when coalesce(l5.av5, 0) > 0 then round(coalesce(l5.st5, 0) / l5.av5, 4) else 0 end
    from upcoming u
    join players pl on pl.canonical_team_id in (u.home_team_id, u.away_team_id)
    left join public.fpl_fixture_availability_store av on av.fixture_id = u.fixture_id and av.fpl_player_id = pl.fpl_player_id
    left join last1 l1 on l1.fpl_player_id = pl.fpl_player_id
    left join last5 l5 on l5.fpl_player_id = pl.fpl_player_id;
$$;
revoke all on function public.get_fpl_l1_inputs(integer) from public, anon, authenticated;
grant execute on function public.get_fpl_l1_inputs(integer) to service_role;

update public.lab_experiments
   set status = 'passed', variants_tried = 405, concluded_at = now(),
       conclusion = 'PASSED and ADOPTED (24 Nov 2026). Holdout GW11 (672 players, 20 sides): L1 Brier 0.0955 / log loss 0.3131 / starters right 178 of 220; '
                 || 'published model 0.1151 / 0.3582 / 169; naive last XI 0.1120 / 0.3807 / 176. Paired Brier L1 minus published -0.0196 (se 0.0076, t -2.58). '
                 || 'Validation GW9-10: L1 0.0705 / 0.2432 / 380 of 440; published 0.0865 / 0.2836 / 363; naive 0.0843 / 0.3068 / 377. '
                 || 'Chosen on tuning GW2-8: r 0.88, r_gk 0.98, e 0.7, c 1.0, a 0.15 (e and a at the edges of the registered grid; c = 1.0 means the '
                 || 'midweek-cup factor has no effect). Single-gameweek holdout: GW12 reported as a forward check. Production: start chances for the '
                 || 'next five gameweeks from scripts/fpl_l1_start.py, written over the pecking-order ones; later gameweeks keep the pecking order.'
 where experiment_id = 'L1_last_xi_changes' and status <> 'passed';
