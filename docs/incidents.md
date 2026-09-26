# Incidents and preventive measures

Every error found in the model, its data or the delivery process: what
happened, the impact, the cause, the fix, and what now stops it recurring.
Model-affecting changes are also in the database change log
(`model_change_log`, shown at `/admin/model`). Automated guards run daily in
`public.check_model_integrity()` (workflow `integrity-checks`); each is named
below.

Add an entry whenever something goes wrong -- including mistakes made while
fixing something else.

---

## 2026-09-23 · Early fits predicted ~25% too few goals
- **Impact:** 38 Premier League and 51 Championship 2026/27 predictions (and
  every bet/accuracy figure built on them) used fits #2 and #3, predicting
  ~2.0 goals a game against ~2.7-2.8 actual. Fit #6 (National League) had the
  same flaw but was unused.
- **Cause:** the June 2026 fits carried the overall scoring level differently;
  their defence ratings sit ~0.37 above what the prediction formula
  `exp(ha + att - def)` expects. Team ratings themselves were correct
  (correlation 1.00 with later fits).
- **Mistake while fixing:** first recorded as a defence *sign reversal*, from
  one summary statistic. Corrected after testing correlation with a later fit.
  *Lesson: confirm a diagnosis with an independent test before recording it.*
- **Fix:** fits retired; 89 predictions re-predicted point-in-time from
  retro-fits, old values in `prediction_corrections`.
- **Prevention:** fit version `dc_v1_1` rejects any fit whose stored ratings
  don't reproduce the window's weighted home/away goals within 5% (retro-check
  of all 711 fits: every accepted dc_v1 fit 0.984-1.014; the bad fits ~0.70).
  Daily guard `recent_fits_scoring_level`.

## 2026-09-23 · Played matches re-predicted with hindsight
- **Impact:** 5 PL/Championship fixtures (found first), then 83 more across
  E0-EC once their status was corrected, carried predictions from fits dated
  on/after kick-off.
- **Cause:** `backfill_fixture_predictions` protected fixtures by status
  only; fixtures still marked "scheduled" after kick-off were re-predicted
  daily.
- **Fix:** 81 re-predicted from the newest accepted fit dated before kick-off;
  7 with no such fit had the prediction removed rather than kept. All audited.
- **Prevention:** kick-off guard (fit date < kick-off date, the rule every
  historic and retro prediction uses). Daily guards
  `played_prediction_point_in_time`, `upcoming_prediction_from_accepted_fit`,
  `archive_predictions_point_in_time`.

## 2026-09-23 · Fixture feed silently stopped updating status  *(open)*
- **Impact:** 88 played fixtures stayed "scheduled" (some since 11 Sep):
  missing from Model Returns and exposed to hindsight re-prediction.
- **Cause (partial):** `refresh_fixture_feeds` reports success every day but
  sees 2,432 feed rows and updates only 894; some fixtures stopped matching
  around 10-11 Sep. The National League feed returns 12 rows and updates none.
  **Root cause not yet found** -- next step is to compare feed rows with the
  unmatched fixtures (team mapping or date).
- **Fix:** `sync_fixture_status_from_results()` marks a fixture played when
  the results archive has its final score (cron, 09:30 and 21:30 UTC),
  independent of any feed.
- **Prevention:** daily guard `stale_scheduled_fixtures` (warning). Still
  needed: the feed job should fail when it updates far fewer rows than it sees.

## 2026-09-23 · Netlify credits ran out; site suspended
- **Impact:** production deploys blocked twice; site suspended ~2.5 h; three
  $10 top-ups.
- **Cause:** 15 credits per production deploy. ~290 site-changing pushes
  straight to `main` in two weeks, 3 scheduled build-hook rebuilds a day,
  and builds for changes that never reach the site. Warnings went to email only.
- **Prevention:** daily `netlify-usage` estimate (warn 50%, fail 75%);
  rebuilds once a day; skip rule for migrations/workflows/scripts/tests/notes;
  work via PRs and batch merges.

## 2026-09-23 · PR merged without its checks having run
- **Impact:** PR #51 merged while Netlify was suspended; never built.
- **Cause:** merge step didn't require checks to exist, only that none failed.
- **Prevention:** merge only when Netlify's checks have appeared AND passed;
  confirm the production deploy's commit afterwards.

## 2026-09-23 · Tables the pipelines couldn't read (twice)
- **Impact:** a workflow's read of `match_predictions` returned 403; later
  `model_versions` and `model_change_log` were created with the same gap.
  26 public tables in all lacked a `service_role` SELECT grant.
- **Cause:** new tables were granted to `anon`/`authenticated` only.
- **Prevention:** `service_role` can read every public table, and default
  privileges give every new table that grant automatically (tested with a
  probe table). Daily guard `service_role_can_read_tables`.

## 2026-09-23 · Single-date test run filled a season from one fit
- **Impact:** 380 predictions briefly all from the pre-season fit.
- **Cause:** `backfill_match_predictions` only filled matches without a
  prediction, so later fits could never replace them.
- **Prevention:** it now converges -- each match takes the newest accepted
  fit before it that rates both teams, replacing anything else on rerun.

## 2026-09-23 · Market summaries treated as bookmakers
- **Impact:** "Median" price on Model Returns was the median of two or three
  books plus football-data's market maximum and market average rows.
- **Fix/prevention:** price basis is now the market-average row; `Max`/`Avg`
  are labelled as market summaries everywhere (`PRICE_SOURCES`); change log
  records before/after.

## 2026-09-23 · Accepted fit outside any version
- **Impact:** fit #38 (619-day window) was accepted and unused; it fails the
  scoring-level gate.
- **Prevention:** every fit records `model_version`; daily guard
  `new_fits_versioned`; settings changes need a new version and change-log
  entry in the same PR.

## Smaller process slips (same day)
- A text edit to the generated types duplicated a line -> caught by `tsc`.
  Anchored edits now assert each anchor matches exactly once.
- SQL typos in multi-statement corrections -> each correction runs as one
  atomic statement, so a failure changes nothing.
- A merged PR's deploy was assumed from PR checks -> Netlify doesn't report
  pushes to main; confirm the production deploy's commit via the Netlify API.

## 2026-09-23 · Long retro-fit run spanned a rules change
- **Impact:** none found. The lower-division run (526 fits) started ~45 min
  before the dc_v1_1 scoring-level gate was merged, so its fits were made
  under dc_v1 rules.
- **Check:** applied the gate retrospectively to all 526 -- every one passes
  (0.989-1.009).
- **Prevention:** a workflow run uses the code as it was when it started.
  Don't start long runs just before merging a rules change; if one spans a
  change, re-check its output against the new rules.

## 2026-09-23 · Function name collision broke a live page for ~3 minutes
- **Impact:** the Model Accuracy page's calibration section. Creating
  `get_model_calibration()` (for the scorecard) alongside the existing
  `get_model_calibration(bigint DEFAULT ...)` made the site's no-argument call
  ambiguous until the new one was dropped and renamed
  `get_model_scorecard_calibration()`.
- **Cause:** didn't check the name was free before creating it.
- **Prevention:** daily guard `unique_function_names` fails if any two of our
  public functions share a name (extension functions excluded); proven by
  creating a deliberate duplicate. Before creating a function, check the name.

## 2026-09-24 · Fixing one grant bug caused another
- **Impact:** none reached the public — caught by this session's own
  verification step (reading as `anon` immediately after any change).
- **What happened:** fixing the `converged` vs `accepted` bug in
  `team_strength_current` and `fpl_team_strength_current` (`CREATE OR
  REPLACE VIEW`) silently dropped both views' `anon`/`authenticated`
  SELECT grants. Same shape as the earlier `service_role` grant incident,
  this time for public-facing reads instead of the pipeline role.
- **Fix:** grants restored immediately, verified as `anon`.
- **Prevention:** new daily guard `public_views_readable_by_anon` — an
  explicit, extensible list of public-facing views that must stay
  readable by `anon`. Proven by a deliberate revoke/restore, same as the
  `unique_function_names` guard. **Lesson restated:** any `CREATE OR
  REPLACE VIEW` or `... FUNCTION` needs a same-turn check that every role
  that could read it before still can — this is now the second time.

---

## 2026-09-25 · Sitemap, team and finance pages missing from the live site
- **Impact:** live `/sitemap.xml`, `/finance` and `/football/teams/arsenal`
  returned 404 while `robots.txt` advertised the sitemap. Separately, every
  route without a generated file (`/tv-guide`, `/affiliate-disclosure`,
  `/login`, `/fpl/tactical-roles`, non-Premier League match pages) 404'd on a
  direct visit or refresh, and had done since those pages were added.
- **Cause:** three independent faults. (1) Both generators run a dozen
  Supabase requests serially under a watchdog; on a slow day the watchdog
  fires, and the sitemap script then exited *without writing anything*
  (reproduced against a delayed mock). (2) Sitemap queries asked for
  `limit=5000`/`20000`, but PostgREST silently caps at 1,000 rows, so match,
  scout and gameweek URLs were truncated even on good days (mock: 2 of 5
  gameweeks, 1,000 of 2,500 scouts, 1,000 of 1,880 matches). (3) No SPA
  fallback rule has ever existed in `netlify.toml`.
- **Fix:** sitemap written immediately with static routes, then enriched;
  watchdog writes what it has. All fetches in both generators run
  concurrently and are paginated. Non-forced `/* -> /app-shell.html 200`
  fallback, pointing at a pristine shell copy because `index.html` carries
  the homepage canonical; a noindex "Page not found" route handles the
  resulting soft 404s.
- **Prevention:** `scripts/verify-dist.mjs` reports each deploy's contents in
  the Netlify log; `.github/workflows/site-health.yml` checks the *live* site
  daily and fails (emailing) on a missing/small sitemap, a 404 on key pages,
  or an empty team page. *Lesson: "never exits non-zero" needs a separate
  check that the output exists, or failures become invisible.*

## 2026-09-25 · Failed projection run rebuilt the site anyway
- **Impact:** 2026-09-24 run 36000353679 failed in pass 1 (Supabase 522)
  after refreshing some GW6 fixtures, then triggered a rebuild, publishing
  a mix of model generations under a fresh timestamp.
- **Cause:** rebuild step ran `if: always()`, deliberately.
- **Fix:** rebuild now `if: success()`. Per-fixture refresh is idempotent, so
  the next run repairs the data.
- **Still open:** true staged publication (write a generation, flip it live
  only when complete) needs a schema change.

---

## 2026-09-25 · Cup results silently dropped; stale fixtures only warned
- **Impact:** 10 of 79 Carabao Cup rows skipped every day, including
  Coventry 1-3 Aston Villa and Man United 2-3 Brighton (16 Sept), whose
  fixtures stayed 'scheduled' for 9 days. No played FA Cup result had ever
  been ingested (e.g. Morecambe 2-0 Southport, 19 Sept). pg_cron recorded
  every run as "succeeded" throughout.
- **Cause:** (1) `ingest-cup-data` matched clubs only through a hard-coded
  name map; the source writes "Coventry City", "Brighton & Hove Albion" (map
  had "and"), "Cambridge United", etc. Unmatched rows were skipped and
  reported only in an HTTP response nothing stored. (2) Its row pattern
  accepted titles "Home v Away" (unplayed) but not "Home 2-0 Away" (played
  FA Cup rows). (3) `stale_scheduled_fixtures` existed and saw all three
  fixtures, but returned 'warning', which neither fails the integrity
  workflow nor emails. (4) Cron success only proves the HTTP call was queued.
- **Also found:** the 7 "stuck" `result_ingestion_runs` rows (11-17 Sept) were
  never a stuck feed: `ingest-football-results` is a stub that logs a
  'running' row per call and does nothing. Closed by migration
  `close_stub_ingestion_runs_2026_09_25`. The stub should be deleted.
- **Fix (applied to production 2026-09-25):** migration
  `footballwebpages_cup_team_aliases` (7 aliases); `ingest-cup-data` v6
  (source in `supabase/functions/ingest-cup-data/`) reads `team_aliases`,
  parses played rows, records every run with a status. Verified: run 10 --
  Carabao Cup 79/79 stored, 0 mapping gaps; FA Cup rows read 440 -> 699;
  all three fixtures now 'played' with correct scores;
  `check_model_integrity()` all ok, point-in-time checks included.
- **Prevention:** migration `integrity_stale_scheduled_fixtures_fails` -- a
  fixture 'scheduled' 3+ days after kick-off now FAILS (postponed stays a
  warning, as `stale_postponed_fixtures`). Migration
  `integrity_cup_ingestion_current` adds `cup_ingestion_current`: the
  latest cup run must be a full 'success' within 30h, so a missing alias
  ('partial') or a dead feed fails the daily workflow.
  *Lesson: a warning nobody is notified of is not a guard.*

## 2026-09-26 · Bookmaker odds stopped at the one-off raw backfill
- **Impact:** no bookmaker odds for any English match after 5-10 Sep 2026
  (Premier League: last odds 6 Sep, so matchweeks 4-5 had none; 129
  matches across E0-EC). Model Returns, market efficiency and the
  scorecard silently ran on fewer matches.
- **Cause:** `match_odds` is filled only by `backfill_match_odds()`, which
  reads raw rows in `source_match_rows`. Those were loaded once, on 11 Sep,
  by the `backfill-football-raw` edge function. The daily import
  (`scripts/import-daily.ts`) downloads the same CSVs but only upserts
  `matches`; nothing wrote raw rows or called `backfill_match_odds()`.
  Scheduling the function alone would not have helped: it had no new rows
  to read. A full pass also took 47s, too slow for an API call (8s limit).
- **Fix:** migration `20260926190000_backfill_match_odds_incremental`
  makes `backfill_match_odds()` skip matches that already have odds (~1s).
  `import-daily.ts` now, for E0-EC (`IMPORT_ARCHIVE_ODDS=1` in
  daily-import.yml), archives each file's new or changed raw rows and then
  calls `backfill_match_odds()`; a failure fails that division's step.
  Gap backfilled: `backfill-football-raw` re-run for 2026/27 (raw files
  191-195, row counts equal to `matches`), then `backfill_match_odds()`:
  619,023 -> 621,861 rows (+2,838, 22 per match), 0 duplicates on the
  natural key, every 2026/27 E0-EC match now has odds.
- **Prevention:** the odds step runs inside the import it depends on, and
  its outcome is written to `match_import_runs.error_message` on every run.

## 2026-09-26 · Saturday 3pm matches shown as "not yet confirmed"
- **Impact:** English league matches in the Saturday 3pm blackout (e.g.
  four Premier League matchweek-6 games on 10 Oct) showed "Broadcast
  details not yet confirmed" on the TV guide and match pages instead of
  "Not televised live in the UK".
- **Cause:** `fixture_broadcasts` is filled from Airtable listings, and
  nobody lists matches that are not shown. No row means "unknown" by
  design.
- **Fix:** migration `20260926190100_uk_3pm_blackout_rule` adds
  `apply_uk_3pm_blackout()`: one generated not-televised row (source
  `rule:3pm_blackout`) per scheduled E0-EC fixture kicking off Saturday
  14:45-17:15, only where the fixture has no other row. It runs at the end
  of every Airtable sync and daily at 04:25. Any real listing removes the
  rule row; an Airtable "Confirmed not televised" record adopts it; a
  fixture moved out of the window loses it. 1,216 rule rows after the
  first runs (E0 203, E1 249, E2 205, E3 321, EC 238), none alongside
  another row for the same fixture.
- **Mistake caught while fixing:** the extra rows took the TV guide view
  past the API's 1,000-row limit, which would have silently cut off later
  fixtures (including real broadcasts). `getWatchGuide` now reads in pages.
- **Prevention:** tests for the rule row's display (`TvGuidePage.test.tsx`);
  the view's catalogue entry notes it must be paged. The rule follows
  `fixtures.kickoff_time`, so wrong kick-off times give wrong rows.
- **Open (found while fixing):** most League One (E2) fixtures in BST are
  stored an hour early, i.e. in UTC (e.g. all 11 on 26 Sep at 14:00, the
  Sky 12:30 games at 11:30); Premier League, Championship and League Two
  times are UK time. Those E2 3pm games get no rule row, and the site shows
  the wrong kick-off, until the E2 fixture times are corrected. The rule
  picks them up on its next run once they are. Recorded in OUTSTANDING.md.
