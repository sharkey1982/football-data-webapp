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
