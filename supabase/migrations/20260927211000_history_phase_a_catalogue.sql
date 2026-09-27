-- ============================================================================
-- Catalogue entries for the Phase A history objects (league_pace_benchmarks,
-- league_table_reliability, history_what_happened_next) and the changed
-- comparable_group definition on team_season_summary. Metadata only.
-- ============================================================================

select public.meta_refresh_flow();

update public.meta_flow_nodes set
  layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'league_standings materialised for league competitions, one row per league + season + team, plus season context and outcomes: games_in_season, clubs, comparable_group (clubs x double-round-robin games, e.g. 20x38, so the current season sits in the same group as the finished seasons it is compared with), split_format, champion, top_four, top_six (final seasons only), next_league_id, relegated and promoted. English leagues 1-5 read movement from where the club plays next season; a tier 1-4 club absent from the data next season is NULL (not guessed), a National League club absent is relegated. Other countries: only top flights are loaded, so relegated means absent next season. NULL for the current season and when next season is not loaded. Powers Club History, What Happened Next?, Historic Pace, Record Book, percentiles and SEO season pages.',
  refresh_note = 'Refreshed (concurrently) by refresh_history_derived() (pg_cron 50 6,12 * * *).',
  purpose_reviewed_at = now()
where node_key = 'object:team_season_summary';

update public.meta_flow_nodes set
  layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'Points after N matches by final outcome, one row per league + comparable_group + matches_played + outcome (all, champion, top_four, top_six, relegated): team_seasons, p10/p25/p50/p75/p90, min, max and mean points. Complete finished seasons only (is_final, not curtailed, not split_format), compared by matches played. From team_match_snapshot and team_season_summary. Powers Historic Pace (/football/history/pace).',
  refresh_note = 'Refreshed (concurrently) by refresh_history_derived() after team_season_summary.',
  purpose_reviewed_at = now()
where node_key = 'object:league_pace_benchmarks';

update public.meta_flow_nodes set
  layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'How settled the league table is after N matches, one row per league + comparable_group + matches_played: seasons, rank_correlation (Pearson on positions after N matches vs final positions, averaged over seasons), mean_abs_position_change (average places between position after N matches and final position) and same_position_share. Complete finished seasons only (is_final, not curtailed, not split_format); position is position_at_played (ranked on every club''s record after the same number of matches). Powers the History hub (/football/history).',
  refresh_note = 'Refreshed (concurrently) by refresh_history_derived() after team_season_summary.',
  purpose_reviewed_at = now()
where node_key = 'object:league_table_reliability';

update public.meta_flow_nodes set
  layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'What Happened Next?: every team-season in a league after p_matches_played matches, optionally filtered by position_at_played range, points range, start-year range and comparable_group, with where it finished (final position and points, champion, top four, top six, relegated, promoted). Complete finished seasons only (is_final, not curtailed, not split_format). Security invoker, read-only, capped at 2000 rows, granted to anon. Powers /football/history/what-happened-next.',
  refresh_note = 'Reads team_match_snapshot and team_season_summary; no state of its own.',
  purpose_reviewed_at = now()
where node_key = 'function:history_what_happened_next(p_league_id bigint, p_matches_played integer, p_position_min integer, p_position_max integer, p_points_min integer, p_points_max integer, p_from_year integer, p_to_year integer, p_comparable_group text)';

update public.meta_flow_nodes set
  layer = 'pipeline', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Refreshes the historical data layer: rebuilds team_match_snapshot for league-seasons whose matches changed (row count or updated_at) or gained a deduction since the last build (all of them with p_force), then refreshes team_season_summary, league_season_summary, league_pace_benchmarks and league_table_reliability concurrently. Returns league-seasons rebuilt, rows and seconds.',
  refresh_note = 'pg_cron refresh-history-derived (50 6,12 * * *). Run with true after editing point_deductions effective dates or team mappings.',
  purpose_reviewed_at = now()
where node_key = 'function:refresh_history_derived(p_force boolean)';

-- Recreated (league_season_summary, depends on team_season_summary) or patched
-- (check_model_integrity: anon read-grant list now includes the two new views)
-- by 20260927210000; their descriptions still hold.
update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key in ('object:league_season_summary', 'function:check_model_integrity()');
