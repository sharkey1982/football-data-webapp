-- Catalogue entries for the objects changed by
-- 20260926190000_uefa_results_from_fixture_feed (run after meta_refresh_flow()).

update public.meta_flow_nodes set
  purpose = 'Daily fixture-list sync from fixturedownload.com JSON feeds for E0-E3, UCL, UEL, UECL and D1 (plus SC0, I1, F1, SP1 via isolated sub-functions): logs kick-off changes to fixture_changes, updates kickoff date/time, matchweek and status on existing fixtures (it never inserts new ones), records the run in fixture_refresh_runs, then calls backfill_fixture_predictions(). For UCL, UEL and UECL it is also the results source: feed rows with both scores (league phase, rounds 1-8) are upserted into matches with source_name ''FixtureDownload''; a row from another source is never overwritten. Caveats: fixture status becomes ''played'' purely because kick-off time has passed, not because a result exists (check_model_integrity ''played_without_result'' catches a missing result); knockout-round results (extra time, penalties) are not written yet; feed URLs and season label ''2627'' are hard-coded to 2026/27; unmapped feed team names are skipped silently (docs/incidents.md).',
  refresh_note = 'pg_cron job refresh-football-fixtures-daily (15 4 * * *, 04:15 UTC).'
where node_key = 'function:refresh_fixture_feeds()';

update public.meta_flow_nodes set
  purpose = 'Daily guard suite returning (check_name, status, found, detail) rows, one per past incident: point-in-time prediction checks on fixtures and match_predictions, recent-fit scoring level, fit versioning and retro-fit stamps, service_role and anon read grants, stale scheduled/postponed fixtures, played fixtures with no result in matches (played_without_result), cup ingestion freshness, stuck pipeline runs and duplicate function names. Read-only; any ''failed'' row fails the workflow.',
  refresh_note = 'Called by scripts/run_integrity_checks.py in the ''Model integrity checks'' GitHub workflow (cron 45 9 * * *, 09:45 UTC, plus manual).'
where node_key = 'function:check_model_integrity()';

update public.meta_flow_nodes set
  refresh_note = 'Upserted daily by scripts/import-daily.ts in ''Daily Premier League Import'' (0 6 * * *, E0-E3, EC) and ''Daily International Import'' (20 6 * * *, non-English top flights); Carabao Cup and FA Cup by the ingest-cup-data edge function (pg_cron 15 5 * * *); Champions League, Europa League and Conference League by refresh_fixture_feeds() (pg_cron 15 4 * * *); past seasons via the manual ''Import a historic season'' workflow. Row estimate 0 in stats is unreliable.'
where node_key = 'object:matches';
