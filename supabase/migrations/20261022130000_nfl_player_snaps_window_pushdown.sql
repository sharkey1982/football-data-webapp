-- ============================================================================
-- 20261022130000_nfl_player_snaps_window_pushdown.sql
--
-- /nfl/snap-outlook returned HTTP 500 (found 22 Oct 2026 by the smoke test of
-- every menu page, audit S-09). Its query on public.nfl_player_snaps filters
-- on season and team, but the view's window function
--   max(offense_snaps) OVER (PARTITION BY game_id, team)
-- stopped those filters reaching the table: Postgres pushes a filter below a
-- window only on a column in every PARTITION BY. So each request sorted all
-- 333,000 snap rows (1.8 s warm, over the API's limit under load).
--
-- Adding season and game_type to the partition changes no value (a game_id
-- belongs to one season and one game type) and lets season/game_type filters
-- use nfl_player_snaps_season_idx: 1.8 s -> 0.14 s for one team-season
-- (EXPLAIN ANALYZE in a rolled-back transaction, 22 Oct 2026).
--
-- Same columns, same order, security_invoker kept; CREATE OR REPLACE keeps
-- the grants. Safe to re-run.
-- ============================================================================

create or replace view public.nfl_player_snaps with (security_invoker = true) as
 select s.season,
    s.week,
    s.game_type,
    s.game_id,
    s.player_id,
    s.pfr_player_id,
    coalesce(p.name, s.player_name) as player_name,
    p.slug as player_slug,
    s."position",
    tf.franchise as team,
    tf.slug as team_slug,
    opf.franchise as opponent,
    s.offense_snaps,
    s.offense_pct,
    s.defense_snaps,
    s.defense_pct,
    s.st_snaps,
    s.st_pct,
    max(s.offense_snaps) over (partition by s.season, s.game_type, s.game_id, s.team) as team_offense_snaps
   from nfl.player_snaps s
     join nfl.team_codes tc on tc.code = s.team
     join nfl.franchises tf on tf.franchise = tc.franchise
     join nfl.team_codes oc on oc.code = s.opponent
     join nfl.franchises opf on opf.franchise = oc.franchise
     left join nfl.players p on p.player_id = s.player_id;
