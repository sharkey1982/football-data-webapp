-- Run the Football League scores refresh once now (backfills Saturday 24 Oct,
-- whose Championship, League One and League Two scores were missing), rather
-- than waiting for the 17:20 UTC run. Safe to re-run: it only fills empty
-- scores or its own. Outcome in fixture_refresh_runs (competitions E1/E2/E3).
select public.refresh_efl_reported_scores();
