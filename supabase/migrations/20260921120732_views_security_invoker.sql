-- ============================================================================
-- Views run with the VISITOR'S permissions (audit 2026-09-21, finding 3).
--
-- 16 publicly readable views ran with their creator's rights (Supabase
-- advisor: security_definer_view, ERROR). Nothing leaked -- every table they
-- reached is fully public -- but it was fragile: make one of those tables
-- private later and the view would silently keep exposing it.
--
-- Switched here: 15 of the 16. TESTED BEFORE APPLYING: inside a transaction,
-- every view was counted as anon, switched, counted again, then rolled back.
-- All 15 returned identical rows (29,427 down to 5); after applying, a
-- signed-in admin also sees identical counts.
--
-- DELIBERATE EXCEPTION: team_home_away_adjustment_v1 stays SECURITY
-- DEFINER. It is the public face of team_home_away_adjustment_experimental_v1,
-- which only the owner can read; the first trial caught that switching it
-- would have broken it for every visitor. Presenting a controlled result from
-- a private source is exactly what a definer view is for, so it is kept, and
-- the experimental view stays private. (The advisor will keep listing it.)
-- ============================================================================
alter view public.fixture_player_tactical_consensus set (security_invoker = true);
alter view public.fixture_team_tactical_consensus set (security_invoker = true);
alter view public.fpl_defensive_contribution_projection_leaguewide set (security_invoker = true);
alter view public.fpl_fixture_bps_projection_v1 set (security_invoker = true);
alter view public.fpl_optimizer_candidate_feed_v2 set (security_invoker = true);
alter view public.fpl_player_squad_state_current set (security_invoker = true);
alter view public.fpl_projection_frontend_feed_v6 set (security_invoker = true);
alter view public.fpl_projection_leaguewide_allocation_v2 set (security_invoker = true);
alter view public.fpl_projection_leaguewide_points set (security_invoker = true);
alter view public.fpl_projection_secondary_scoring set (security_invoker = true);
alter view public.fpl_projection_v4_leaguewide_inputs set (security_invoker = true);
alter view public.fpl_season_player_projection_feed set (security_invoker = true);
alter view public.fpl_set_piece_fixture_adjustments_v1 set (security_invoker = true);
alter view public.fpl_set_piece_fixture_exposure_v1 set (security_invoker = true);
alter view public.league_fit_status set (security_invoker = true);
