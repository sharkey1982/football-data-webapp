-- ============================================================================
-- HISTORY BACKFILL (National League): let the scratch table
-- historic_source_rows hold tier-5 rows (league code EC), so the Conference
-- 2004/05-2013/14 files from football-data.co.uk and engsoccerdata's
-- england_nonleague.csv can be staged and cross-checked like E0-E3.
-- See docs/history-backfill.md.
-- ============================================================================

alter table public.historic_source_rows drop constraint if exists historic_source_rows_league_code_check;
alter table public.historic_source_rows add constraint historic_source_rows_league_code_check
  check (league_code = any (array['E0', 'E1', 'E2', 'E3', 'EC']));
