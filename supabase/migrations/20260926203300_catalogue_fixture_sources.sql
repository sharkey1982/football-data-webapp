-- Catalogue entries after the EC fixture loader and the cup ingest change
-- (20260926203100, 20260926203200).
select public.meta_refresh_flow();

update public.meta_flow_nodes set
  layer = 'pipeline', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Loads and maintains the full National League (EC) 2026/27 fixture list from footballwebpages.co.uk''s monthly pages: matches source rows to fixtures on league, season, home and away team (unique in a league season), logs kick-off date/time changes to fixture_changes, marks played and postponed fixtures, inserts missing ones. A blank source time never wipes a known one. Unmapped club names or a pairing listed twice mark the run failed. Returns a JSON summary.',
  refresh_note = 'pg_cron job refresh-national-league-fixtures-daily (35 4 * * *, 04:35 UTC). Records each run in fixture_refresh_runs (competitions {EC}); failures are recorded there rather than raised.',
  purpose_reviewed_at = now()
where node_key = 'function:refresh_national_league_fixtures()';

update public.meta_flow_nodes set
  refresh_note = 'Kick-off updates by refresh_fixture_feeds() (pg_cron 15 4 * * *); National League (EC) full season kept by refresh_national_league_fixtures() (pg_cron 35 4 * * *); cup fixtures written by ingest-cup-data (pg_cron 15 5 * * *), one row per tie (unique index fixtures_cup_tie_unique on league, season, teams and round for LC/FAC); status set to played from results by sync_fixture_status_from_results (pg_cron 30 9,21 * * *); predictions by backfill_fixture_predictions (04:15 cron, 06:00 workflow, cup ingest).',
  purpose_reviewed_at = now()
where node_key = 'object:fixtures';

update public.meta_flow_nodes set
  refresh_note = 'Written by public.refresh_fixture_feeds() (pg_cron refresh-football-fixtures-daily, 04:15 UTC), public.refresh_national_league_fixtures() (04:35 UTC) and the ingest-cup-data edge function (05:15 UTC).',
  purpose_reviewed_at = now()
where node_key = 'object:fixture_changes';

update public.meta_flow_nodes set
  refresh_note = 'Written by public.refresh_fixture_feeds() (pg_cron refresh-football-fixtures-daily, 04:15 UTC) and public.refresh_national_league_fixtures() (competitions {EC}, 04:35 UTC). Rows with competitions {EC} before 2026-09-26 are from the retired scripts/sync-fixtures.ts.',
  purpose_reviewed_at = now()
where node_key = 'object:fixture_refresh_runs';
