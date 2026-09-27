-- Catalogue entries after the season-order and division-name changes
-- (20260927100000, 20260927100100, 20260927100200).
select public.meta_refresh_flow();

-- New objects -----------------------------------------------------------------
update public.meta_flow_nodes set
  layer = 'helper', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Chronological sort key for a season: seasons.start_year for a season_id. season_id is not in date order (1992/93 to 2013/14 are ids 14-35, after 2026/27 = 13), so seasons are ordered and compared by this, never by id.',
  refresh_note = 'Called inline by get_player_by_slug, search_players and earlier_season/later_season.',
  purpose_reviewed_at = now()
where node_key = 'function:season_start_year(p_season_id bigint)';

update public.meta_flow_nodes set
  layer = 'helper', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'The season immediately before a given season by start_year (null if none). Replaces max(season_id) where season_id < x, which picks the wrong season once season_id is not chronological.',
  refresh_note = 'Called inline by ai_resolve_season (''last season'') and ai_tool_get_fpl_players.',
  purpose_reviewed_at = now()
where node_key = 'function:previous_season_id(p_season_id bigint)';

update public.meta_flow_nodes set
  layer = 'helper', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'The earlier of two seasons by start_year, ignoring nulls: least() by date rather than by season_id. Widens player_identity.first_seen_season_id.',
  refresh_note = 'Called by sync_player_identity() (trigger on fpl_players) and import_fpl_season().',
  purpose_reviewed_at = now()
where node_key = 'function:earlier_season(a bigint, b bigint)';

update public.meta_flow_nodes set
  layer = 'helper', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'The later of two seasons by start_year, ignoring nulls: greatest() by date rather than by season_id. Widens player_identity.last_seen_season_id.',
  refresh_note = 'Called by sync_player_identity() (trigger on fpl_players) and import_fpl_season().',
  purpose_reviewed_at = now()
where node_key = 'function:later_season(a bigint, b bigint)';

update public.meta_flow_nodes set
  layer = 'source', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'Division names by era: the name a league had over a range of seasons (from/to season start_year, inclusive; to null = still in use). English tiers 2-4 were First/Second/Third Division 1992/93-2003/04 and Championship/League One/League Two from 2004/05; tier 5 was Football Conference to 2003/04, Conference National 2004/05-2014/15 and National League from 2015/16; Premier League from 1992/93. Leagues with no rows use leagues.name.',
  refresh_note = 'Static reference data maintained by migrations (20260927100200_league_season_names.sql). Read through league_name_for_season().',
  purpose_reviewed_at = now()
where node_key = 'object:league_season_names';

update public.meta_flow_nodes set
  layer = 'helper', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Name of a division in a given season (league_id, season_id) from league_season_names, e.g. E1 in 1998/99 = First Division; falls back to leagues.name, so current seasons and leagues without era rows are unchanged.',
  refresh_note = 'Called inline by league_standings (league_name) and league_season_display_names.',
  purpose_reviewed_at = now()
where node_key = 'function:league_name_for_season(p_league_id bigint, p_season_id bigint)';

update public.meta_flow_nodes set
  layer = 'api', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'Every league x season with the division''s name in that season (league_name_for_season). The site reads it to label a historic season''s division (League Table and Results Data division lists, match pages). security_invoker view over leagues, seasons and league_season_names.',
  refresh_note = 'Computed on read; page load via src/lib/referenceApi.ts (getLeagueNamesForSeason, getLeagueNameForSeason).',
  purpose_reviewed_at = now()
where node_key = 'object:league_season_display_names';

-- Changed objects ------------------------------------------------------------
update public.meta_flow_nodes set
  purpose = 'AI Lab helper: the current season for a competition = the latest season by start_year with fixtures or results in it (handles calendar-year leagues filed as N/N+1). Ordered by start_year, not season_id, since historic seasons have higher ids.',
  purpose_reviewed_at = now()
where node_key = 'function:ai_current_season(p_league_id bigint)';

update public.meta_flow_nodes set
  purpose = 'AI Lab helper: turns "current", "last", "2025/26", "2526" or a slug into a season_id for a competition. "last" is the season before the current one by start_year (previous_season_id).',
  purpose_reviewed_at = now()
where node_key = 'function:ai_resolve_season(p_league_id bigint, p_season text)';

update public.meta_flow_nodes set
  purpose = 'AI Lab tool get_data_status: freshness timestamps (results, fixtures, model fit, FPL, projections, TV) and coverage (competitions, first/latest season by start_year, results count). Observed. Service role only.',
  purpose_reviewed_at = now()
where node_key = 'function:ai_tool_get_data_status(args jsonb)';

update public.meta_flow_nodes set
  purpose = 'AI Lab tool get_fpl_players: official FPL player data (price, points, minutes, goals, xG, defensive contribution points from the gameweek explain payload, status, news) for the current season, or final totals for a past season ("last" = previous season by start_year); filters player/team/position/availability, sortable. Observed. Service role only.',
  purpose_reviewed_at = now()
where node_key = 'function:ai_tool_get_fpl_players(args jsonb)';

update public.meta_flow_nodes set
  purpose = 'Daily guard suite returning (check_name, status, found, detail) rows, one per past incident: point-in-time prediction checks on fixtures and match_predictions, recent-fit scoring level, fit versioning and retro-fit stamps, service_role and anon read grants, stale scheduled/postponed fixtures, played fixtures with no result in matches (played_without_result), cup ingestion freshness, stuck pipeline runs and duplicate function names. The current season is the latest by start_year with English results. Read-only; any ''failed'' row fails the workflow.',
  purpose_reviewed_at = now()
where node_key = 'function:check_model_integrity()';

update public.meta_flow_nodes set
  purpose = 'Returns the season_id of the FPL season currently in play: the latest season by start_year with rows in fpl_gameweeks (not max(season_id) -- ids are not chronological); it rolls over automatically when next season''s FPL bootstrap is first loaded. Used by many FPL projection views and player functions instead of a hard-coded season.',
  purpose_reviewed_at = now()
where node_key = 'function:fpl_current_season_id()';

update public.meta_flow_nodes set
  purpose = 'Competitive-balance stats per top-flight league-season (tier 1 leagues plus E0): one row per league_code x season_label with club count, standard deviation of points-per-game, and how often a bottom-half side avoided defeat against a top-half side. Ordered by league and season start_year. Feeds the Countries Compared page.',
  purpose_reviewed_at = now()
where node_key = 'function:get_country_competitiveness()';

update public.meta_flow_nodes set
  purpose = 'Per top-flight league-season summary (tier 1 leagues plus E0; one row per country x league x season, ordered by country and season start_year): matches, goals per game (total/home/away), H/D/A %, cards per game, over-2.5 %, BTTS %, 0-0 % and comeback % (half-time leader failing to win). Feeds the Countries Compared page. Caveat: card averages exclude matches from ''/new/'' source files (no card data).',
  purpose_reviewed_at = now()
where node_key = 'function:get_country_league_summary()';

update public.meta_flow_nodes set
  purpose = 'Per league-season averages for the English leagues (E0-E3 and EC/National League) with 100+ completed matches, ordered by league and season start_year: goals per game (total/home/away), H/D/A %, yellows and reds per game, over 2.5 %, BTTS %, 0-0 %, and comeback % (HT leader failed to win). Observed results from public.matches. Used by /football/leagues-compared and a landing tile. league_name is today''s name for every season.',
  purpose_reviewed_at = now()
where node_key = 'function:get_cross_league_summary()';

update public.meta_flow_nodes set
  purpose = 'Average closing 1X2 overround (bookmaker margin) per season and league for a bookmaker (default ''Avg''), league-seasons with 100+ matches only, ordered by season start_year. Observed historic odds. Used by /football/market-efficiency.',
  purpose_reviewed_at = now()
where node_key = 'function:get_overround_trend(p_bookmaker text)';

update public.meta_flow_nodes set
  purpose = 'Player profile lookup by player_identity slug: fpl_code, canonical name, latest name/team/position (most recent season by start_year), seasons played, career FPL points and minutes (from fpl_player_season_totals), first/last season, plus current-season stats (points, minutes, goals, assists, bonus, price) if the player is in the current FPL squad (else current_* are null). Used by /fpl/player-scout/:slug.',
  purpose_reviewed_at = now()
where node_key = 'function:get_player_by_slug(p_slug text)';

update public.meta_flow_nodes set
  purpose = 'Season-by-season FPL career for one player (by fpl_code) from fpl_player_season_totals, newest season (by start_year) first: team, position, start/end price, points, minutes, goals, assists, clean sheets, bonus, points per start £m, and points split into early (GW1-13), mid (14-26) and late (27+) thirds from gameweek history. Historic completed seasons only (current season is not in season totals). Used on player record/scout pages.',
  purpose_reviewed_at = now()
where node_key = 'function:get_player_career(p_fpl_code bigint)';

update public.meta_flow_nodes set
  purpose = 'List of seasons a player (by fpl_code) has FPL data for, newest (by start_year) first, with season slug, total points and an is_current flag (current season taken from fpl_players). Season picker for player record pages.',
  purpose_reviewed_at = now()
where node_key = 'function:get_player_seasons(p_fpl_code bigint)';

update public.meta_flow_nodes set
  purpose = 'Imports one past season''s player totals from vaastav/Fantasy-Premier-League (data/<folder>/players_raw.csv) into fpl_player_season_totals (players with minutes > 0 only; start_cost derived as now_cost minus cost_change_start) and widens player_identity''s first/last-seen seasons by start_year (earlier_season/later_season). Resolves columns by name because the CSV layout changes by season; aborts on more than 1% malformed rows; insert-only.',
  purpose_reviewed_at = now()
where node_key = 'function:import_fpl_season(p_season_id bigint, p_folder text)';

update public.meta_flow_nodes set
  purpose = 'Name search over player_identity (canonical_name ILIKE, query at least 2 chars, limit 1-50): returns fpl_code, slug, name, latest FPL name/team/position (most recent season by start_year), seasons played, career points (historic season totals), first/last season and current-season slug if in the current squad. Players with no historic season totals (e.g. new this season) are not returned. Used by the Player Scout search box.',
  purpose_reviewed_at = now()
where node_key = 'function:search_players(p_query text, p_limit integer)';

update public.meta_flow_nodes set
  purpose = 'Trigger function (AFTER INSERT OR UPDATE on fpl_players) that keeps player_identity in step: creates the cross-season identity row keyed on fpl_code with a canonical name and a stable slug (collisions get ''-<fpl_code>'' appended), and on later runs only widens first/last-seen season (by start_year, via earlier_season/later_season), never changing an existing slug.',
  purpose_reviewed_at = now()
where node_key = 'function:sync_player_identity()';

update public.meta_flow_nodes set
  purpose = 'Computed league tables from results for every domestic league and season: one row per league x season x team with position, pyramid_position, P/W/D/L, goals, clean sheets, points (after point_deductions), PPG and full home/away splits. league_name is the division''s name in that season (league_name_for_season, e.g. First Division for E1 before 2004/05); season_start_year is the chronological sort key. Curtailed past seasons are ranked on points per game; is_final is false for the current season (latest by start_year with results). Caveats: the ''tier'' column is just league_id (correct for English divisions 1-5, wrong for other countries, e.g. La Liga shows 13); pyramid_position assumes lower league_id = higher division within a country; tie-breaks are GD, GF, then name (not official rules). Read by team history panels.',
  refresh_note = 'Computed on read. Page load: team history panels via src/lib/teamHistoryApi.ts (ordered by season_start_year); AI Lab get_league_table.',
  purpose_reviewed_at = now()
where node_key = 'object:league_standings';

update public.meta_flow_nodes set
  purpose = 'Materialized one-row-per-match evaluation set for the Model Scorecard: every played match (leagues 1-5 via the current-season rule: the latest season by start_year with results; archived predictions are seasons with an earlier start_year) with a point-in-time prediction (match_predictions for past seasons, fixtures for the current season) and closing market-average 1X2 odds, giving model H/D/A probabilities (Dixon-Coles with the fit''s rho), de-margined market probabilities, result, team_type and season phase. Only as fresh as its last refresh; anon SELECT is intentional (check_model_integrity needs it).',
  purpose_reviewed_at = now()
where node_key = 'object:model_scorecard_matches';

update public.meta_flow_nodes set
  purpose = 'For English divisions only (league_id 1-5): one row per league x season x team with the previous season''s league (the season with start_year one lower) and movement (''promoted'', ''relegated'', ''stayed'', ''new'', or ''unknown'' for the earliest season on file) plus is_promoted. Used to flag promoted/relegated teams in the model scorecard and betting backtests. Caveats: ''new'' (arrived from outside the data, e.g. from below the National League) counts as promoted; non-English leagues are not covered; a gap in loaded seasons makes the season after it read as ''new''.',
  refresh_note = 'Computed on read; used by model_scorecard_matches (refreshed 10:00 and 22:00 UTC).',
  purpose_reviewed_at = now()
where node_key = 'object:team_season_movement';

update public.meta_flow_nodes set
  purpose = 'Reference list of seasons: one row per season with label in ''YYZZ'' form (e.g. ''2627'' = 2026/27, ''9293'' = 1992/93), start_year (unique; the chronological order), end_year and slug (''YYYY-YY''). season_id is used by every table but is NOT in date order: 1-13 are 2014/15-2026/27 and 14-35 are 1992/93-2013/14. Order and compare seasons by start_year (season_start_year, previous_season_id). Several pipelines hard-code the current label or id.',
  refresh_note = 'Static reference data maintained by hand/migrations (historic rows: 20260927100100_historic_seasons_1992_2014.sql); importers look seasons up by label and never create them.',
  purpose_reviewed_at = now()
where node_key = 'object:seasons';
