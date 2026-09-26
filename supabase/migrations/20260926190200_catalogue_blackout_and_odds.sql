-- Catalogue entries for the Saturday 3pm blackout rule and the daily odds
-- archive (migrations 20260926190000 and 20260926190100).

update public.meta_flow_nodes set
  layer = 'broadcast', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Generates UK not-televised rows for the Saturday 3pm blackout: every scheduled E0, E1, E2, E3 or EC fixture from today kicking off on a Saturday between 14:45 and 17:15 (kickoff_time, UK local) with no GB row gets one fixture_broadcasts row (status confirmed_not_televised, source ''rule:3pm_blackout'', confidence probable, no airtable_record_id). Removes a rule row once any other GB row exists for the fixture (a real listing always wins) or the fixture leaves the window. Returns {removed, added}. Cup and non-English fixtures are not covered.',
  refresh_note = 'Called at the end of every sync_airtable_broadcasts() (pg_cron every 3 hours, after Airtable rows are written) and by pg_cron ''apply-uk-3pm-blackout-daily'' (04:25 UTC, after the 04:15 fixture refresh). Rows follow fixture kick-off times, so a wrong kickoff_time gives a wrong row.'
where node_key = 'function:apply_uk_3pm_blackout()';

update public.meta_flow_nodes set
  purpose = 'Unpivots bookmaker prices held in raw football-data.co.uk rows (source_match_rows.raw_data) into match_odds: 1X2 (B365, BW, IW, PS, WH, VC, Max, Avg), over/under 2.5 and Asian handicap, opening and closing, matched to matches via team_aliases. Only considers matches with no football-data.co.uk odds yet (all markets for a match are inserted together), which keeps a run to about a second. Insert-only on the natural key (ON CONFLICT DO NOTHING), so corrected prices are never updated; returns rows inserted.',
  refresh_note = 'Called by scripts/import-daily.ts after each English division''s daily import (daily-import.yml, 06:00 UTC, IMPORT_ARCHIVE_ODDS=1), once that run has archived the file''s new or changed raw rows in source_match_rows. Safe to run by hand.'
where node_key = 'function:backfill_match_odds()';

update public.meta_flow_nodes set
  purpose = 'Core Airtable -> fixture_broadcasts upsert: for each Airtable record resolves both teams and competition (broadcast_competition_map), finds the nearest fixture within 3 days, and inserts/updates one fixture_broadcasts row per record (keyed on airtable_record_id; adopts rows with no airtable_record_id, including Saturday 3pm rule rows when the record is "Confirmed not televised"). Records it cannot place go to broadcast_sync_unmatched with a reason; each call ends with apply_uk_3pm_blackout() and logs one broadcast_sync_runs row. Idempotent; the latest Airtable version always wins.',
  refresh_note = 'Called by sync_airtable_broadcasts_from_api() (pg_cron every 3 hours); was also run manually with connector payloads before the API pull existed.'
where node_key = 'function:sync_airtable_broadcasts(p_records jsonb)';

update public.meta_flow_nodes set
  purpose = 'UK (market ''GB'') TV/streaming information per fixture: zero or more rows per fixture. status ''confirmed_broadcast'' = one viewing offer (broadcaster, channel/service, access type free/subscription/PPV, delivery methods, confidence, watch_url); status ''confirmed_not_televised'' = not shown live, either from a listing or from the Saturday 3pm blackout rule (source ''rule:3pm_blackout'', English leagues E0-EC only). Caveat: NO row means ''not yet determined'', never ''not on TV''; confidence can be ''probable'' or ''needs_verification''; uk_available=false offers are hidden from the guide. Read by match pages, the gameweek browser and the TV guide.',
  refresh_note = 'pg_cron ''sync-airtable-broadcasts-3-hourly'' (sync_airtable_broadcasts_from_api, minute 40 every 3 hours) from the Airtable UK Broadcasts base; the sync never deletes rows. Rule rows are added and removed by apply_uk_3pm_blackout() (end of each sync and pg_cron ''apply-uk-3pm-blackout-daily''). Admins can also write directly (RLS is_admin()).'
where node_key = 'object:fixture_broadcasts';

update public.meta_flow_nodes set
  refresh_note = 'Populated by backfill_match_odds(), called after each English division''s daily import (scripts/import-daily.ts, daily-import.yml 06:00 UTC); other leagues have no odds. Before 26 Sep 2026 this was manual and odds stopped at 5-10 Sep 2026.'
where node_key = 'object:match_odds';

update public.meta_flow_nodes set
  refresh_note = 'Written by edge functions backfill-football-raw (football-data.co.uk CSVs) and backfill-cup-raw (footballwebpages cup HTML), invoked manually, and by scripts/import-daily.ts for E0-EC each day (file_metadata.archived_by ''import-daily''; a row only when the file has new or changed rows).'
where node_key = 'object:raw_match_files';

update public.meta_flow_nodes set
  refresh_note = 'Written by edge functions backfill-football-raw and backfill-cup-raw (manual invocation) and, for E0-EC, by scripts/import-daily.ts each day: only rows that are new or differ from the latest archived copy (same row key as the edge function).'
where node_key = 'object:source_match_rows';

update public.meta_flow_nodes set
  purpose = 'UK TV guide feed: one row per viewing offer (or not-televised row, including Saturday 3pm rule rows) for fixtures from today onwards, with broadcaster, service, access type, delivery methods, confidence, source and watch_url plus fixture, league, teams, team countries and predicted goals. Excludes offers with uk_available=false. Fixtures with no rows are ''unknown'', not ''not on TV''. Over 1,000 rows, so readers must page (getWatchGuide does). Powers the TV Guide page.'
where node_key = 'object:upcoming_watch_guide';
