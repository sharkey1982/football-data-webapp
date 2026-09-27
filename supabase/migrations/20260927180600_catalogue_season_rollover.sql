-- Catalogue entries for the season-rollover changes (migrations
-- 20260927180000-20260927180500). Run after select public.meta_refresh_flow();
-- Idempotent: plain updates by node_key.

-- New helpers
update public.meta_flow_nodes set layer = 'helper', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'The current football season''s season_id: the season whose 1 July - 30 June window contains today. Single source of truth for "this season" in fixture feeds, cup ingestion, the daily results import, betting defaults and the site; never use max(season_id) or a hard-coded id (ids are not chronological). If next season''s seasons row is missing on 1 July it stays on the latest season that has started, and check_model_integrity() fails season_rollover_ready. FPL uses fpl_current_season_id() instead. See docs/season-rollover.md.',
  refresh_note = 'Computed on call from seasons and today''s date; rolls over by itself on 1 July once next season''s seasons row exists.',
  purpose_reviewed_at = now()
where node_key = 'function:current_season_id()';

update public.meta_flow_nodes set layer = 'helper', status = 'current', is_public = false, ai_relevant = true,
  purpose = 'season_id of the season whose 1 July - 30 June window contains a date (null if no seasons row covers it). Used by current_season_id() and the season_rollover_ready check; the same rule maps cup rows to seasons in ingest-cup-data.',
  refresh_note = 'Computed on call from seasons.',
  purpose_reviewed_at = now()
where node_key = 'function:season_id_for_date(p_date date)';

-- Defaults now follow the current season; "default 13" wording replaced
update public.meta_flow_nodes set
  purpose = regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(purpose,
      'default season 13', 'default: the current FPL season', 'g'),
      '\(season default 13\)', '(season default: current FPL season)', 'g'),
      '\(default 13\)', '(default: current FPL season)', 'g'),
      'default 13', 'default the current FPL season (fpl_current_season_id())', 'g'),
      'defaults season 13', 'defaults to the current FPL season', 'g'),
  purpose_reviewed_at = now()
where node_key in (
  'function:get_completed_gameweeks(p_season_id bigint)',
  'function:get_model_xi_history(p_season_id bigint, p_league_id bigint)',
  'function:get_model_xi_players(p_event_id integer, p_season_id bigint)',
  'function:get_player_gameweek_breakdown(p_fpl_player_id bigint, p_season_id bigint)',
  'function:get_rolling_xi_candidates(p_season_id bigint)',
  'function:get_set_piece_index(p_season_id bigint)',
  'function:get_set_piece_takers(p_season_id bigint)',
  'function:list_scout_players(p_season_id bigint, p_position integer, p_team_id bigint, p_min_minutes integer, p_search text, p_limit integer)',
  'function:list_scout_teams(p_season_id bigint)');

update public.meta_flow_nodes set refresh_note = 'Page load: /fpl/player-scout via src/lib/playerScoutApi.ts (current FPL season).'
where node_key = 'function:list_scout_teams(p_season_id bigint)';

update public.meta_flow_nodes set
  purpose = replace(purpose, 'p_season_id defaults to 13 (2026/27)', 'p_season_id defaults to the current football season (current_season_id())'),
  purpose_reviewed_at = now()
where node_key = 'function:get_betting_bets(p_edge numeric, p_market text, p_closing boolean, p_best_price boolean, p_stake numeric, p_season_id bigint, p_league_id bigint, p_promoted text)';

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key = 'function:get_betting_returns(p_edge numeric, p_market text, p_closing boolean, p_best_price boolean, p_stake numeric, p_season_id bigint, p_league_id bigint, p_promoted text)';

update public.meta_flow_nodes set
  purpose = 'Loops over every fixture in a matchweek range (defaults: current FPL season, league_id 1) and calls refresh_fpl_projection_fixture_v6 for each, skipping played fixtures; returns the number of fixtures visited (not rows written). Over PostgREST it exceeds the gateway/statement timeout (~85s for 10 gameweeks), which is why callers moved to per-fixture calls.',
  refresh_note = 'No live caller: the Team Strength page and scripts/refresh_fpl_projections.py stopped calling it (per their comments) and now loop per fixture; still executable by service_role for direct SQL use.',
  purpose_reviewed_at = now()
where node_key = 'function:refresh_fpl_projections_range(p_from_matchweek integer, p_to_matchweek integer, p_season_id bigint, p_league_id bigint)';

-- FPL functions now scoped to one season
update public.meta_flow_nodes set
  purpose = 'FPL value table: every player with points > 0 from the season''s latest FPL snapshot, with price (£m), total points, points per £m, season minutes/goals/assists/clean sheets/bonus (summed from fpl_player_gameweeks) and ownership %, sorted by points per £m. p_season_id defaults to the current FPL season and selects the snapshots, players and gameweeks. Observed FPL data, not model output. Used by /fpl/value (ValuePage) and the FPL hub landing tiles.',
  purpose_reviewed_at = now()
where node_key = 'function:get_actual_value_table(p_season_id bigint)';

update public.meta_flow_nodes set
  purpose = 'FPL ''what changed'' feed comparing the season''s two most recent snapshot dates: price rises/falls, availability status changes (with news) and ownership moves of 0.5pp or more, one row per change with old/new value, sorted by ownership. p_season_id (default: current FPL season) selects the snapshots; rows are only compared within one season, and each joins the player of that season. Used by /fpl/in-the-papers.',
  purpose_reviewed_at = now()
where node_key = 'function:get_daily_digest(p_season_id bigint)';

update public.meta_flow_nodes set
  purpose = 'Lists FPL gameweeks that have day-over-day snapshot pairs within p_season_id (default: current FPL season) for the ''in the papers'' digest, with first/last snapshot date and number of days; each snapshot date is assigned to a gameweek via fpl_gameweek_for_date (last deadline before that date). Drives the gameweek selector on /fpl/in-the-papers.',
  purpose_reviewed_at = now()
where node_key = 'function:get_digest_gameweeks(p_season_id bigint)';

update public.meta_flow_nodes set
  purpose = 'Same change feed as get_daily_digest (price rises/falls, availability changes, ownership moves >= 0.5pp) but for every day-over-day snapshot pair of p_season_id (default: current FPL season) belonging to one FPL gameweek (p_gameweek, default latest), with the date of each change. Pairs and player names are matched within the season. Observed FPL data. Used by /fpl/in-the-papers.',
  purpose_reviewed_at = now()
where node_key = 'function:get_gameweek_digest(p_season_id bigint, p_gameweek integer)';

update public.meta_flow_nodes set
  purpose = 'FPL market movers over the last p_days (default 7) of snapshots of the latest snapshot''s season: per player current price, price change, current ownership and ownership change, this gameweek''s transfers in/out, status and news, with window start/end dates. Window rows and player names are matched within that season (FPL reuses player ids each season). Observed FPL data. Used by the market movers panel on /fpl/in-the-papers and the FPL player page.',
  purpose_reviewed_at = now()
where node_key = 'function:get_fpl_market_movers(p_days integer)';

update public.meta_flow_nodes set
  purpose = 'Returns the earliest matchweek of the current FPL season that has leaguewide_v6 FPL projections. UI helper that bounds the matchweek range on the optimal squad pages.',
  purpose_reviewed_at = now()
where node_key = 'function:get_fpl_optimizer_earliest_matchweek()';

update public.meta_flow_nodes set
  purpose = 'Current FPL injury/availability list: every player whose status in the season''s latest snapshot is not ''a'' (available), with price, ownership, points, status, chance of playing next round, news, a return date parsed from the news text (heuristic regex, year guessed), number of scheduled fixtures missed before that date and next fixture date. p_season_id (default: current FPL season) selects the snapshots, players and fixtures. Used by /fpl/injuries, the FPL player page and landing tiles.',
  purpose_reviewed_at = now()
where node_key = 'function:get_injury_report(p_season_id bigint)';

update public.meta_flow_nodes set
  purpose = 'FPL price-change pressure ranking from the season''s latest snapshot: net transfers this gameweek scaled by ownership into a relative ''pressure'' score, with direction rise/fall/steady. Heuristic proxy (not FPL''s actual price algorithm) for which players are likely to change price. p_season_id (default: current FPL season) selects the snapshot and players. Used by /fpl/price-risk, player page, landing tiles and list_scout_players.',
  purpose_reviewed_at = now()
where node_key = 'function:get_price_change_risk(p_season_id bigint)';

update public.meta_flow_nodes set
  purpose = replace(purpose, 'Note: EXECUTE is granted', 'Players and latest ownership are those of p_season_id (default: current FPL season). Note: EXECUTE is granted'),
  purpose_reviewed_at = now()
where node_key = 'function:get_tactical_role_worklist(p_season_id bigint)';

update public.meta_flow_nodes set
  purpose = replace(purpose, ' Caveat: live-season branch joins fpl_players on fpl_player_id only (no season), so it will duplicate rows once fpl_players holds two seasons.', ' p_season_id defaults to the current FPL season; players are joined within the gameweek''s season.'),
  purpose_reviewed_at = now()
where node_key = 'function:get_team_of_the_week(p_event_id integer, p_season_id bigint)';

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key = 'function:get_totw_vs_model(p_event_id integer, p_season_id bigint)';

-- Fixture feeds
update public.meta_flow_nodes set
  purpose = 'Generic fixture-feed loader for fixturedownload.com JSON feeds: for league p_code in the current season (current_season_id()), matches feed rows to existing fixtures by teams and nearest date (within 60 days), logs date/time changes to fixture_changes, updates kickoff date/time/matchweek/status, and inserts missing fixtures. Returns the number of rows changed. Also inserts a whole new season''s list when refresh_fixture_feeds() finds a league with no fixtures for the current season. Caveats: status is set to ''played'' purely because kick-off time has passed, not from results; unmatched team names are dropped silently.',
  purpose_reviewed_at = now()
where node_key = 'function:refresh_feed_nearest_date(p_code text, p_url text)';

update public.meta_flow_nodes set
  purpose = 'Daily fixture-list sync from fixturedownload.com JSON feeds for E0-E3, UCL, UEL, UECL and D1 (plus SC0, I1, F1, SP1 via isolated sub-functions) for the current season (current_season_id(); feed URLs end in its start year): logs kick-off changes to fixture_changes, updates kickoff date/time, matchweek and status on existing fixtures, records the run in fixture_refresh_runs, then calls backfill_fixture_predictions(). A league with no fixtures yet for the current season gets its whole list inserted once via refresh_feed_nearest_date (automatic at the rollover). A 404 before 1 October (feed not published yet, e.g. UEFA before the draw) is skipped and noted on the run. For UCL, UEL and UECL it is also the results source: feed rows with both scores (league phase, rounds 1-8) are upserted into matches with source_name ''FixtureDownload''; a row from another source is never overwritten. Caveats: fixture status becomes ''played'' purely because kick-off time has passed, not because a result exists (check_model_integrity ''played_without_result'' catches a missing result); knockout-round results are not written yet; unmapped feed team names are skipped silently (docs/incidents.md).',
  purpose_reviewed_at = now()
where node_key = 'function:refresh_fixture_feeds()';

update public.meta_flow_nodes set
  purpose = 'Loads and maintains the full National League (EC) fixture list for the current season (current_season_id()) from footballwebpages.co.uk''s monthly pages: rows dated outside the season''s 1 July - 30 June window are ignored; matches source rows to fixtures on league, season, home and away team (unique in a league season), logs kick-off date/time changes to fixture_changes, marks played and postponed fixtures, inserts missing ones. A blank source time never wipes a known one. Unmapped club names or a pairing listed twice mark the run failed. Returns a JSON summary.',
  purpose_reviewed_at = now()
where node_key = 'function:refresh_national_league_fixtures()';

update public.meta_flow_nodes set
  purpose = 'Thin wrapper that loads the Scottish Premiership (SC0) fixturedownload.com feed for the current season (URL built from current_season_id()''s start year) via refresh_feed_nearest_date.',
  purpose_reviewed_at = now()
where node_key = 'function:refresh_scottish_premiership_fixtures()';

-- Views scoped to the current FPL season
update public.meta_flow_nodes set
  purpose = replace(purpose, 'Joins fpl_players on canonical_team_id with no season filter.', 'Players are the current FPL season''s (fpl_current_season_id()).'),
  purpose_reviewed_at = now()
where node_key = 'object:fixture_player_lineup_consensus';

update public.meta_flow_nodes set
  purpose = replace(purpose, 'Not used directly by any page;', 'Players are the current FPL season''s. Not used directly by any page;'),
  purpose_reviewed_at = now()
where node_key = 'object:fixture_player_expected_minutes_v2';

update public.meta_flow_nodes set
  purpose = replace(purpose, 'FPL team id/name,', 'FPL team id/name (current FPL season''s fpl_teams row),'),
  purpose_reviewed_at = now()
where node_key in ('object:fpl_team_strength_current');

update public.meta_flow_nodes set
  purpose = replace(purpose, 'FPL team mapping where available.', 'FPL team mapping (current FPL season) where available.'),
  purpose_reviewed_at = now()
where node_key = 'object:team_strength_current';

update public.meta_flow_nodes set
  purpose = replace(purpose, 'stuck pipeline runs and duplicate function names.', 'stuck pipeline runs, duplicate function names and season_rollover_ready (seasons row covers today; next season''s row exists from 1 March; no new-season FPL data stored under the old season; warning 15 June - 31 July to pause the FPL refresh -- docs/season-rollover.md).'),
  purpose_reviewed_at = now()
where node_key = 'function:check_model_integrity()';

update public.meta_flow_nodes set
  purpose = 'Reference list of seasons: one row per season with label in ''YYZZ'' form (e.g. ''2627'' = 2026/27), start_year, end_year and slug. season_id is used by every table but is NOT chronological (1992/93-2013/14 are 14-35; 2014/15-2026/27 are 1-13): order by start_year. The current season is current_season_id() (football, 1 July boundary) or fpl_current_season_id() (FPL); nothing should hard-code an id or label.',
  refresh_note = 'One new row each season, added by hand (docs/season-rollover.md) by 1 March; check_model_integrity season_rollover_ready warns until it exists. Importers look seasons up and never create them.',
  purpose_reviewed_at = now()
where node_key = 'object:seasons';

update public.meta_flow_nodes set
  refresh_note = 'Written by admins from the Tactical Roles admin page (src/lib/tacticalRoleAdminApi.ts, source_name ''manual_tactical_override'', upsert/delete) for the current FPL season; RLS allows authenticated admin writes.',
  purpose_reviewed_at = now()
where node_key = 'object:fpl_player_squad_state';
