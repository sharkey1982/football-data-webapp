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

## 2026-10-06 · FPL projections pipeline: runs hung with nothing running
- **Reported:** found while checking the pecking-order change (#240).
- **Impact:** three pipeline runs on 6 Oct didn't finish: one failed in the bonus simulation on a single API read (non-JSON gateway error, twice), and two hung in the projection step for 25+ minutes with no query running in the database. Projections from the first pass were written, so the site kept current numbers, but bonus pass 2 and the final-table simulation didn't run.
- **Cause:** the database was under heavy load that morning (API 500/520/521s and statement timeouts across unrelated pages from 07:35 UTC). The bonus simulation read through the API (8-second limit, no retry). The direct connections had no client-side timeout, so a connection the pooler dropped mid-query left the script waiting forever.
- **Fix:** the bonus simulation reads over the direct connection with retries (#244). Direct connections use TCP keepalives and a 60-second TCP user timeout, so a dropped connection becomes an error that the existing retries handle. The projection script reconnects after the pecking-order write, and each long pipeline step has its own time limit (30/20/30 minutes).
- **Prevention:** a hang now fails within the step limit and shows in pipeline_runs (the next run closes it). *Lesson: every network call needs a timeout on the client side, not only a statement limit on the server.*

---

## 2026-10-06 · FPL start chance: the pecking order was never used
- **Reported:** Chris -- with Saliba back, Konsa and Mosquera kept their minutes: "The line up pecking order is supposed to deal with this."
- **Impact:** a returning first choice took no starts from the players below him. Saliba's start chance rose as he came back but Konsa and Mosquera stayed where they were, so Arsenal's centre-backs added up to well over two starters in later gameweeks; the same at every club for every returner. Minutes and expected points for backups were too high, and for first choices with modest start records (e.g. a manually ranked first-choice right-back) too low.
- **Cause:** each player's start chance was his own availability x his own start rate. The ranks set on Starting Lineups (`team_player_tactical_defaults.depth_rank`) were read by no projection; the club-level scaling only trims when a club's total passes 10 starters, and Arsenal's never did.
- **Fix:** `scripts/fpl_depth_chart.py`, run in the projections pipeline after the availability refresh, fills each club's places down the pecking order per fixture: one place per first choice by role (the formation adds missing places up to 10); a first choice starts at least 85% of the time when fit (or the admin "first choice when fit" figure); a backup takes an open place 90% of the time; open places pass down the order, then to the rest of the line (DEF/MID-only players, then spare backups). Migration `20261006140000_fpl_depth_chart`: `fpl_depth_start_store`, read first by `fpl_fallback_start_probability_v6`. Goalkeepers and players not ranked keep the previous model. model_change_log entry.
- **Prevention:** tests in `scripts/test_fpl_depth_chart.py` (backups drop when the first choice is fit, take over when he is out, tied ranks share) run in the pipeline before it writes. The 85% and 90% figures are judgement, not fitted: check them against starts as gameweeks are played. *Lesson: an input people maintain by hand must be traced to the output it is meant to drive.*

---

## 2026-10-06 · Main failed to build after two PRs merged within minutes
- **Reported:** found by this session while rebasing the next change.
- **Impact:** for about 30 minutes main did not type-check, so any production build in that window would have failed (no bad deploy went out; the previous one stayed live).
- **Cause:** #238 (squad watch) added two required fields to `IntlTeamData` while #239 (pre-rendered nation pages) was open; #239 built a value of that type and was merged on a preview built from before #238. Each PR passed on its own.
- **Fix:** #241 supplies the new fields (empty; the browser loads squad history).
- **Prevention:** rebase on main and re-run `tsc` immediately before merging when another session has merged in the meantime.

---

## 2026-10-06 · Fixture feed: 47 team names never mapped (postponements, kick-off times, provisional scores)
- **Reported:** 6 Oct audit, following stale_scheduled_fixtures (red since 1 Oct).
- **Impact:** every current-season fixture involving 47 clubs was skipped by the daily FixtureDownload refresh: 16 League One, 16 League Two and 15 Championship clubs, plus Tottenham ("Spurs"). Eight League One games postponed on 26 Sep (and Port Vale v Northampton) still showed as due that day with no result coming; 230 League One kick-offs were an hour early (UTC, never corrected); no provisional scores for those clubs. The League One table itself was right: football-data.co.uk has no results for the postponed games either.
- **Cause:** the feed uses full names ("Huddersfield Town", "Queens Park Rangers"); the matcher only knows team_aliases rows with source FixtureDownload and exact canonical names, and these 47 had neither. The original season load used a different matcher, so the fixtures existed and nothing looked missing.
- **Fix:** migration `20261006110000_fixture_feed_team_names`: the 47 aliases; League One times corrected quietly (not logged as changes); one refresh run so the postponements are applied and logged.
- **Prevention:** `check_fixture_feed_names()` in the daily integrity run fails when any current-season E0-E3 fixture hasn't been refreshed for 3 days (each matched fixture is rewritten every run). *Lesson: a matcher that skips what it can't map must say how much it skipped.*

---

## 2026-10-06 · NFL game pages: every sitemap URL redirected
- **Reported:** site-health (5 Oct, a sampled game page answered 301) and the 6 Oct audit.
- **Impact:** since game pages launched (4 Oct, #170) all ~272 NFL game URLs in the sitemap, and every internal link to a game, answered 301 to a lower-case address whose page declared the upper-case address canonical: a redirect/canonical loop, so Google would index none of them.
- **Cause:** game ids are upper case (2026_11_MIA_BUF) and were used as-is in URLs; Netlify serves files under lower-cased paths and redirects any mixed-case request to the lower-case form.
- **Fix:** `nflGamePath` and `nflMatchProjectionPath` lower-case the id; the two pages turn the URL segment back with `nflGameIdFromParam`. Canonicals, sitemap entries, static directories and links are now all lower case; old upper-case URLs still 301 to them.
- **Prevention:** site-health always samples an NFL game page and prints the redirect target of any non-200 URL. *Lesson: anything that becomes a URL path must be lower case on Netlify.*

---

## 2026-10-06 · ClubElo: no club rated since the squads launched, reported as success
- **Reported:** site audit, 6 Oct.
- **Impact:** since the international squads went live (5 Oct), no squad player had a club rating: the "Club Elo" column was blank, average club ratings showed "–" and the ClubElo top 50 was hidden. Every intl_squads run was logged as success ("0 rated by ClubElo (0 clubs)").
- **Cause:** api.clubelo.com answers HTTP 502 (IIS) for every date and club request, from GitHub Actions and with or without a browser User-Agent (probe run 37419411598). Its fixtures endpoint now says "Fixtures API deactivated", and clubelo.com is a new site whose pages embed the ratings but offer no data endpoint. The job treated ratings as a bonus: it logged a warning annotation, which nobody reads, and recorded success.
- **Fix:** `intl_squads.py` keeps the last stored ClubElo table on the squads when the API fails (none exists yet, so clubs stay unrated) and records the run as `warning` with the reason. Migration `20261006070000_intl_squads_club_elo_checks` adds `intl_squads_fresh` and `intl_club_elo_fresh` to `check_intl_integrity()`.
- **Prevention:** a source that returns nothing is a warning in pipeline_runs and in the daily checks, not a success. *Open:* whether to read the ratings from clubelo.com's pages instead (needs the site owner's agreement) or retire the ClubElo columns.

---

## 2026-10-05 · FPL start chance: weeks out injured counted like weeks dropped
- **Reported:** Chris -- the model needs to work as required (follow-up to return dates: returning regulars stayed near zero once fit).
- **Impact:** outfield start chances came from fixed tiers on this season's appearances. A regular back from injury was rated on the few appearances around his injury (Caicedo 0.03 once fit; Saliba at most 0.15; Amad, Minteh, Mitoma similar), while players who had started while others were injured were rated 0.96 whatever their record.
- **Cause:** the tiers counted appearances, not the matches a player was available for, and ignored last season; the team scaling then took the excess mostly from mid-range players, i.e. the returners.
- **Fix:** migration `20261005240000_fpl_start_record`: `fpl_player_start_record` (starts, matches available for -- from daily snapshots, and before 13 Sep from the first snapshot's injury and its news date -- and last season's start rate), refreshed each projection run. Outfield start rate = (starts + last-season rate) / (available matches + 1), max 0.97, times fixture availability; goalkeepers unchanged.
- **Evidence:** backtest predicting GW3-5 outfield starters from earlier gameweeks only (1,765 player-matches): current Brier 0.0992 / log-loss 0.333; chosen 0.0944 / 0.313. Prior weighted as 3 matches was worse (0.1011); scaling defenders and the rest separately gave no gain and was not adopted. Of six fit regulars returning from absence in the window, one started straight away -- so a returner's chance rises as he is picked rather than jumping back at once.
- **Prevention:** model changes to start probability are now judged by this backtest, not by inspecting individual players; rerun it as more gameweeks arrive (the window is three gameweeks).

---

## 2026-10-05 · FPL projections: this week's injury status applied to every future gameweek; GW9+ ten days stale
- **Reported:** Chris -- return dates should feed long-term projections, and a doubt should only matter for the next gameweek.
- **Impact:** every future fixture used this week's FPL status. Players "Expected back 10 Oct" (Pau, Bizot, Mateta, Mitoma ...) were projected 0 for the rest of the season; 75%/50% doubts were 75%/50% in every gameweek; 49 players with an unknown return date were 0 forever. Players injured since August (Saliba, Amad, Minteh, Joelinton ...) were rated as unknown squad players (18% start) even once fit. Separately, the pipeline only refreshed the next 3 gameweeks, so GW9-16 were last generated on 26 Sep, although Squad Check offers a 10-gameweek horizon.
- **Cause:** three views (lineup consensus, minutes fallback, v6 start-probability fallback) each turned `chance_of_playing_next_round`/status into one availability per player and joined it to every fixture; the return date in the news text was parsed only for the injuries page. The pipeline window was set to 3 gameweeks when only near-term projections were read.
- **Fix:** migration `20261005230000_fpl_fixture_availability`: view `fpl_player_fixture_availability` gives availability per fixture (suspension end date; return-date ramp 75%/90%/fit; doubt = FPL's chance for the next gameweek, then the remaining doubt halves each gameweek; unknown return 0 for two gameweeks then +15% a gameweek to 60%), and all three views read it. Flagged non-goalkeepers with no appearances this season use last season's starts (20+ first choice, 10-19 rotation). Pipeline window 3 -> 10 gameweeks. model_change_log entry.
- **Prevention:** the rule applied is stored per row (`rule` column), so any projection can be traced to it. The ramps and the 60% cap are assumptions from three weeks of snapshots (13 Sep - 5 Oct); re-check them against outcomes once more gameweeks are logged. *Lesson: a "next round" figure is about one gameweek -- anything copied across a horizon needs a rule for how it changes.*

---

## 2026-10-05 · FPL team pitch: players drawn in positions they don't play
- **Impact:** on the fixture pitch, players appeared in slots far from their role -- e.g. Arsenal GW6 (4-2-3-1) showed Mosquera, a right-centre-back, in the left-wing slot, and a second RCB (Konsa) in the back four, while the projected left winger (Tzolis) was missing. Across GW6, 17 of 20 team pitches had at least one such placement (a DEF at CF for Coventry and Sunderland, a DEF at LW for Man City, a DEF in the pivot for Liverpool). Display only; projections were unaffected.
- **Cause:** the pitch took the ten outfielders with most expected minutes, then forced them into the formation's slots. When those ten didn't fit the shape (two RCBs, no LW), the fallback put the leftover player in whatever slot was free, however far from his role. Players with no confirmed role were treated the same way.
- **Fix:** players are now chosen per slot: every player-slot pair is scored start probability × fit (exact role 1; nearby roles less; wrong side halved; more than two lines away never), and pairs are taken best first. A slot nobody fits is left empty rather than filled wrongly. Unconfirmed-role players stay in their FPL line. LW/LF and RW/RF now count as the same job.
- **Prevention:** regression tests with the real Arsenal GW6 data (fail on the old code), and a check that a centre-back is never drawn in an attacking slot. Checked against all 20 GW6 team pitches: no player outside his line.

---

## 2026-10-05 · FanTeam: fix list unusable on a phone; two players set to "Not in FPL" by mistake; safety-net value too low
- **Impact:** on a phone, the unmatched-players list saved on every change of a dropdown, so Savinho (Tottenham) and Gabriel Slonina (Chelsea) were set to "Not in FPL" by accident, and there was no way to undo it from the page. Separately, a player with no cheaper same-club team-mate was valued lower with the safety net than without it (Haaland 5.59 vs 5.94 in the test data), which would have under-rated such players in safety-net contests.
- **Cause:** the fix list was designed for a desktop (fixed widths, save-on-change, "Not in FPL" as the first option); it was never checked at phone size. The safety-net formula dropped a non-starter's own bench points when no replacement was available, though FanTeam keeps the original player then.
- **Fix:** fix cards with a full-width list, nothing saved until "Save match", "Not in FPL" behind a confirm tap, a Saved fixes list with Undo; non-starters FanTeam doesn't expect to play folded away. Safety-net value now includes the original's bench points when no replacement starts. Migration `20261005190000_fanteam_fix_accidental_maps` sets Savinho to FPL's Sávio and removes the Slonina setting (writes from Claude's session are cancelled before approval, so it is applied by the GitHub workflow).
- **Prevention:** browser check at 390×844 (phone) covering cancel, choose-without-saving, save, undo and confirm, plus a no-sideways-scroll check; unit tests for the no-replacement safety net.

---

## 2026-10-05 · FanTeam: price-paste parser bugs caught before release; migration timestamp clash
- **Impact:** none shipped. Found while building `/admin/fanteam`: (1) a club name inside a player's name ("Test ArsenalGK0", "Arsenal Tierney") was taken as the club, or the club text was cut out of the name, so players went unmatched; (2) names containing a digit were dropped; (3) a player deliberately marked "Not in FPL" still counted as unmatched and blocked the optimiser; (4) the first migration file reused timestamp `20261004230000`, already taken by a tennis migration on main.
- **Cause:** (1) club lookup accepted any containment and token removal replaced the first substring match; (2) an over-strict "no digits" name filter; (3) the status check didn't distinguish a decision from a gap; (4) the branch was cut from a stale shallow clone.
- **Fix:** club lookup is exact, alias, or a whole-word short form of the full name; tokens are removed only as a whole field or whole word; the name filter skips only pure numbers; manual "Not in FPL" is excluded from the unmatched count; migration renamed `20261005140000_fanteam_private.sql` and the branch rebuilt on current main.
- **Prevention:** unit tests for each case in `src/__tests__/fanteamScoring.test.ts`; a browser check against the production build with mocked Supabase covering paste → fixes → Fresh → lineup.

---

## 2026-10-05 · Tennis: 48 more players split under two spellings
- **Impact:** 48 people (23 ATP, 25 WTA) appeared as two players each, splitting their records (e.g. "Del Potro J." and "Del Potro J.M.", "Gavrilova D." and "Saville D." after marriage, "Bogomolov Jr.A." and "Bogomolov A."). Titles, win-loss and player pages for them were understated. Found when matching players to Wikidata for phase 3: two of our players claimed the same person.
- **Cause:** the 4 Oct alias list caught punctuation and case only; the source also drops or adds initials, uses married or shortened surnames, and the alias lookup used the exact source text, so three spacing variants of listed names slipped through.
- **Fix:** migration `20261005090000_tennis_phase3_data` merges each pair (matches and aliases move to one player, keys rebuilt); `ALIASES` gains the same pairs and the lookup is now by `name_key`. Every pair was checked to never share a draw. The migration checks, before committing, that per-season match and game totals are unchanged and that the rebuilt keys equal the importer's file hash for every complete season.
- **Prevention:** `scripts/tennis_people.py` (monthly) reports any Wikidata person matched by two players ("taken"); unit tests in `scripts/test_tennis_people.py`.

---

## 2026-10-04 · Database unresponsive overnight; a production build ran during it
- **Impact:** Supabase returned 522s from about 21:53 UTC on 4 Oct until the owner restarted it at 05:29 UTC on 5 Oct. Pages fell back to their error states; the scheduled production build in that window wrote few static pages.
- **Cause:** not pinned down. The heaviest queries at the time were the fixture, broadcast-sync and model jobs on the micro instance; the tennis loads had finished hours before.
- **Fix:** restart by the owner; the next build regenerated the pages.
- **Prevention (open):** a build should stop rather than publish when the database is unreachable; to be added to `scripts/generate-static.mjs` with the next site change.

---

## 2026-10-04 · Tennis first load: two near-misses caught before writing, and a slow view
- **Impact:** none reached the site. Found while profiling all 47 tennis files (ATP 2000-2026, WTA 2007-2026) before the first backfill: (1) two finals with a blank date (WTA 2010 Guangzhou, WTA 2012 Cincinnati) would have failed both tour-years; one final dated a year early (ATP 2006 Paris, 2005-11-05); (2) about 90 player-name variants (punctuation, case, accents, short forms such as "Querry S.", "Bautista R.") would each have become a separate player. During phase 2 the new `tennis_players` view timed out as anon (3 s limit) on its first version.
- **Cause:** (1) `pd.NaT` passes `isinstance(v, datetime)`, so a blank date became the text "NaT"; (2) the source has no player ids; the writer makes a player per new spelling; (3) a correlated sub-query ("tour's latest year") re-ran per row.
- **Fix:** importer repairs blank and wrong-year dates and prints each repair; maps every source name to one display name (`ALIASES` + `name_key`) across the run and the database (PR #175). View rewritten with a join (0.4 s per tour).
- **Prevention:** `scripts/test_tennis_import.py`; every tour-year reconciles on count, games and key hash (all 47 matched after the backfill, also checked independently); every new tennis view timed as anon before a page uses it.
- **Process mistakes on the way (owner's time):** the first PC run used a stale importer: the PC's git checkout had not been used for site work for months and `git pull` had stopped on untracked files; a command was given with PowerShell redirection (`*>`) to a Command Prompt. Now: Claude copies importer updates straight into the PC folder (no git on the PC) and gives Command Prompt syntax.

---

## 2026-09-28 · Fixture-change banners: repeated, flip-flopping and undismissable
- **Impact:** the Fixtures and gameweek pages carried a banner of Premier League kick-off changes that returned on every page visit (dismissal lasted only for that page view). 42 changes were logged for Premier League fixtures in three days, but only 4 were real net moves: the fixture feed had reverted 17 TV-pick kick-offs to their Saturday 15:00 placeholders on 25 Sep and restored them on 27 Sep, and each hop showed as a change. Reported by the owner.
- **Cause:** the banner listed every logged change, not the net change; dismissals were held in component state.
- **Fix:** `fixture_changes_net` (per fixture: kick-off before its first change in 30 days against its kick-off now; moved-and-back fixtures left out); a dedicated page `/fixtures/changes`; the banner replaced by a one-line notice whose dismissal is kept in the browser until a newer change appears. The raw `fixture_changes` log is unchanged.
- **Prevention:** notifications read the net view only; tests cover dismissal across visits and flip-flops.

---

## 2026-09-27 · Played matches vanished from club pages until the result arrived
- **Impact:** between kick-off and football-data's update (hours for the
  Premier League, up to three days for the National League) a played match
  appeared in neither "upcoming" nor "results" on club pages; match pages
  showed no result or pending state, and the Fixtures page showed the
  pre-match prediction where the score goes. Found by the owner: Southend v
  Barrow (26 Sep) missing on 27 Sep. 15 fixtures affected at the time.
- **Cause:** the fixture feeds mark a fixture `played` (they carry its final
  score), but the score was discarded; pages only showed a score from
  `matches`, and treated "played" as "not upcoming".
- **Fix:** `fixtures.reported_*` keeps the feed's score (footballwebpages for
  the National League, fixturedownload for the Premier League to League Two);
  pages show it marked "reported", or "Result to follow"; the league table
  lists reported results beneath it without counting them. Tables, the model
  and history still read only `matches`.
- **Prevention:** `check_model_integrity` 'reported_vs_confirmed' warns when
  a reported score and football-data's disagree (0 of 120+ at creation);
  'played_without_result' still catches a result missing after 3 days.

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

## 2026-09-26 · Europa League results never loaded
- **Impact:** all 18 Europa League matchday 1 results (16-17 Sept, e.g.
  Crystal Palace 4-0 Lech Poznan, Real Sociedad 1-2 Bournemouth) were
  missing from `matches` for 9 days, while their fixtures showed 'played'.
  Every check passed. The Conference League (no matches played yet) would
  have gone the same way from 15 Oct.
- **Cause:** no pipeline wrote UEFA results. `refresh_fixture_feeds()` reads
  the FixtureDownload feeds for UCL/UEL/UECL, but only for dates and status,
  and sets 'played' because kick-off has passed, not because a result
  exists. `ingest-cup-data` covers only the Carabao Cup and FA Cup, and
  `data_source_competitions` has no UEFA rows. The 18 Champions League
  results were a one-off manual backfill (source `verified_web`, 11 Sept),
  which made the Champions League look covered. No team mapping was
  involved: all 18 Europa League rows map. `stale_scheduled_fixtures` could
  not see this, because the fixtures weren't 'scheduled'.
- **Also found:** the feed's "Man Utd" had no FixtureDownload alias, so Man
  United's Premier League and Champions League fixtures were not being
  refreshed (six Premier League kick-off changes, e.g. Man United v Aston
  Villa moved 8 to 7 Nov, were applied once the alias was added).
  The same check across the eight main feeds found 47 more unmapped names,
  all English: "Spurs" (E0) and 46 full club names in E1-E3 (e.g.
  "Birmingham City", "MK Dons", "Accrington Stanley"). This is the likely
  root cause of the open 2026-09-23 "Fixture feed silently stopped updating
  status" incident; not fixed here.
- **Fix (applied to production 2026-09-26):** migration
  `uefa_results_from_fixture_feed`. `refresh_fixture_feeds()` now upserts
  results for UCL, UEL and UECL from the feed's scores (league phase only;
  never overwrites another source's row), plus the "Man Utd" alias. The
  feed's scores were checked against the independent Champions League
  backfill first: all 18 agree. Backfilled by running
  `select public.refresh_fixture_feeds();` (the cron command): 18 Europa
  League results stored, 0 duplicates, Champions League rows unchanged.
- **Prevention:** new daily check `played_without_result`: a fixture
  'played' 3+ days after kick-off with no `matches` row FAILS, in any
  competition (before the fix these 18 were the only ones). Knockout-round
  results (extra time, penalties) are deliberately not written yet and will
  trip this check when they arrive, so they get a decision, not a guess.
  *Lesson: a status that is set by the clock says nothing about whether the
  result exists. Check the thing itself.*

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

## 2026-09-26 · National League fixture list only ever held a week
- **Impact:** `fixtures` held 36 National League (EC) 2026/27 fixtures
  against 108 results: nothing before 15 Sept and nothing after the coming
  weekend. EC fixture pages, predictions and anything counting remaining
  fixtures saw a fraction of the season.
- **Cause:** EC fixtures came only from `scripts/sync-fixtures.ts`, which
  reads football-data.co.uk `fixtures.csv`. That file is a rolling window of
  the next few days (on 26 Sept: 25-28 Sept, 12 EC rows), so it can never
  supply a season. The script first ran on 17 Sept; every EC run in
  `fixture_refresh_runs` saw exactly 12 rows. This is also the "National
  League feed returns 12 rows and updates none" noted under the open
  2026-09-23 feed incident: 0 updated is normal for that script (it counts
  only inserts and kick-off changes), not the unmatched-rows fault.
- **Fix:** migration `national_league_full_fixture_list`: 14 FootballWebPages
  aliases for EC clubs, and `refresh_national_league_fixtures()`, which reads
  footballwebpages.co.uk's monthly National League pages (already the cup
  source). Checked before loading: 552 fixtures, 552 distinct pairings, 23
  home games per club, and all 108 played rows equal to our results (teams,
  date, score). Loaded 516; the 36 existing rows already agreed. EC now 552
  (108 played, 443 scheduled, 1 postponed); every EC result has its played
  fixture. Daily pg_cron job `refresh-national-league-fixtures-daily`
  (04:35 UTC). The `sync-fixtures.ts` step is removed from the daily
  workflow so two sources cannot overwrite each other's kick-off times.
- **Still open:** 107 upcoming EC fixtures have no prediction because the
  latest accepted EC fit has no rating for Hornchurch, Kidderminster or
  Worthing. The 91 newly loaded played fixtures carry no prediction (no
  hindsight predictions were made).
- **Prevention:** matching is on league, season, home and away (unique in a
  league season), so a moved fixture updates its row. A run that parses
  nothing, finds an unmapped club or a pairing listed twice is recorded as
  failed in `fixture_refresh_runs` (recorded, not raised, so the record
  survives).
  *Lesson: check what a feed can contain (a week, a season) before relying
  on it to fill a table.*

## 2026-09-26 · Carabao Cup round-4 ties stored two and three times
- **Impact:** seven round-4 ties appeared on both 27 and 28 Oct, and
  Everton v Newcastle three times (27, 28, 29 Oct): 8 surplus fixtures on
  the fixture list and calendar. No broadcast, prediction or other row
  referenced them.
- **Cause:** `ingest-cup-data` upserted on the fixtures natural key, which
  includes `kickoff_date`. Each date footballwebpages.co.uk showed for a tie
  became another row and nothing removed the old one. On 18 Sept the source's
  round-of-16 page listed seven ties twice (27 Oct with no time, 28 Oct
  7.45pm), stored in one run 0.4 s apart; on 19 Sept Everton v Newcastle
  moved to 29 Oct. The source now splits round 4 across "fourth-round" and
  "round-of-16" pages, and the round number (dropdown position) gave the
  same round 4 on one page and 5 on the other.
- **Fix:** migration `carabao_cup_round4_duplicates` deleted fixtures 3237,
  3242, 3243, 3244, 3245, 3246, 3247, 3248 (references re-pointed first;
  there were none), keeping the date the source gives today: Bradford v
  Peterborough and Fleetwood v Arsenal 27 Oct, Everton v Newcastle 29 Oct.
  Bournemouth v Aston Villa, Fulham v Crystal Palace, Liverpool v Chelsea
  and Sunderland v Brentford are no longer listed on the source at all; one
  row each is kept (27 Oct, time unset) until the source lists them again.
  LC fixtures 92 -> 84. `ingest-cup-data` v8 finds a tie by competition,
  season, teams and round within 60 days, updates it in place and logs
  date/time changes to `fixture_changes`; round numbers come from a fixed
  slug map. Verified by moving fixture 3236 to a wrong date and re-running
  the ingest: the row moved back, one change logged, no new row.
- **Prevention:** unique index `fixtures_cup_tie_unique` on league, season,
  home, away and round for LC and FA Cup (checked first: no such duplicate
  exists; replays and two-legged ties reverse home and away). Not applied
  to UEFA competitions, where a league-phase pairing can recur the same way
  round in the knockouts. An unknown round slug now marks the cup run
  'partial', which fails `cup_ingestion_current`. The round filter also
  now keeps quarter-final, semi-final and final pages, which it would have
  skipped.
  *Lesson: never key an upsert on a value the source is allowed to change.*

## 2026-09-27 · Season order assumed from season_id (found before the historic load)
- **Impact:** none yet -- found and fixed before any pre-2014 data existed.
  Once 1992/93-2013/14 rows (season_id 14-35) held data, "current season"
  (`fpl_current_season_id`, `check_model_integrity`, `league_standings`
  is_current, `model_scorecard_matches`, AI Lab `ai_current_season`) would
  have become 2013/14, "last season" and every newest-first list
  (player career, search, Team History, Season XI, raw files, Countries
  Compared, overround trend) would have been out of order, `team_season_movement`
  would have compared each season with the wrong one, and 1998/99 would have
  displayed as "2098/99" (`'20' + label` in four places, and the CSV
  importer's `parseSeasonLabel`).
- **Cause:** season_id happened to be chronological (1 = 2014/15 ... 13 =
  2026/27), so max/min/`<`/`- 1`/ORDER BY on it, and sorting labels as text,
  all worked by luck.
- **Fix:** `seasons.start_year` made unique and used everywhere
  (helpers `season_start_year`, `previous_season_id`, `earlier_season`,
  `later_season`); 16 functions, 2 views and the scorecard matview rewritten
  by anchored replacement; every output fingerprinted before and after
  (identical today), then re-proved with a rolled-back fake 1992/93 result
  and FPL gameweek. Site code sorts by `season_start_year` / label year.
- **Mistake while fixing:** rolled-back dry runs of the seasons insert still
  consumed identity values (sequences are not transactional), so the real
  insert would have started at 58, not 14. Caught from the dry-run output;
  the migration resets the sequence to `max(season_id)` first.
- **Prevention:** `supabase/tests/season_order_contract.sql` (helpers,
  current season by year, division names at every boundary, anon read).
  *Lesson: an id that "happens to" be in date order is not an order key.*

## 2026-09-27 · History load pushed the daily odds backfill towards its timeout
- **Impact:** none reached production. Loading 1993/94-2013/14 archived
  ~42,700 more raw football-data.co.uk rows; `backfill_match_odds()` went
  from ~3s to ~6.5s per call, against the API's 8s statement timeout.
  `import-daily.ts` calls it once per English division every morning, so the
  next daily import would likely have failed its odds step. The history
  importer's own final call did time out (results were already in; odds
  were then filled in SQL by migration 20260927120200).
- **Cause:** the function re-reads every archived row whose match has no
  odds yet. ~13,800 of the new rows (before 2000/01) have no prices at all,
  so they were unpivoted on every call for nothing.
- **Mistake while fixing:** the staging table's first load failed with
  "permission denied" -- the default privileges give `service_role` SELECT
  only on new tables, not INSERT/DELETE. Granted in the same migration.
- **Fix:** `backfill_match_odds()` now also requires a raw row to carry at
  least one of the price keys it reads (anchored replacement, migration
  20260927120400). Proved equivalent by deleting the odds of 200 random
  matches (2001/02-2026/27) in a rolled-back transaction: all 2,236 rows
  re-created identically. Call time now ~2.5s.
- **Prevention:** docs/history-backfill.md records the timeout and how to
  rerun. *Lesson: a bulk load into a table that a scheduled function scans
  in full changes that function's run time -- time it before and after.*

## 2026-09-27 · European history load pushed the Country filter over the API timeout
- **Impact:** after ~46,000 European matches and 154 teams were loaded,
  `get_countries_by_relevance()` (the site's Country filter, called by anon)
  took 13.6s against the API's 8-second statement timeout, so the filter's
  country list would have failed to load. Found by timing every anon
  function that reads `matches` after the load, about 30 minutes after it.
- **Cause:** the function counted each team's matches with a correlated
  `EXISTS (... home_team_id = t.team_id or away_team_id = t.team_id)`, which
  no index serves, so it scanned `matches` once per team. On the pre-load
  rows the same query took ~2.3s; more rows and more teams multiplied it.
- **Fix:** one pass over `matches` (distinct team ids joined to teams);
  output proved identical (md5 of every row), 0.1s (migration
  20260927140400).
- **Prevention:** docs/history-backfill.md lists the functions timed before
  and after the load. *Lesson: time every anon function that reads the
  loaded table, not only the scheduled ones.*

## 2026-09-27 · Country Insights showed 0 cards for seasons without match stats
- **Impact:** for about an hour after the European history load, Country
  Insights 2016/17 showed 0.00 yellow and 0.000 red cards per game for
  Belgium, Greece, the Netherlands, Portugal and Turkey (their 2016/17
  football-data.co.uk files carry no match stats). A few single rows without
  stats (e.g. Turkey 2022/23's 29 matches awarded after two clubs withdrew)
  also pulled other seasons' averages down slightly (Turkey 2022/23 showed
  4.11 yellows a game instead of 4.50).
- **Cause:** cards are NOT NULL, so a row without stats stores 0.
  `get_country_league_summary()` skipped only the all-seasons ("/new/")
  files, not per-season files without stats.
- **Fix:** card averages now use only rows with match stats
  (`home_shots is not null`); a season without stats returns null, shown as a
  dash (migration 20260927140600).
- **Prevention:** docs/history-backfill.md records which seasons have no
  stats. *Lesson: a NOT NULL default of 0 is not "none happened" -- every
  average over such a column needs the has-data filter.*

## 2026-09-27 · European split-format tables ranked on total points
- **Impact:** since the European history load, `league_standings` (team
  history panels, AI Lab get_league_table) ranked every split-format season
  (Scotland, Switzerland, Austria, Belgium, Denmark, Greece, Poland, Romania,
  Finland; 61 seasons) on total points over every game in the file: groups
  not locked after the split, no halving, and 100 European and relegation
  play-off games counted. Wrong champions in Belgium 2023/24, Austria 2023/24
  and Finland 2023; Scotland 2019/20 ranked on points instead of points per
  game. Deductions and awarded results in those seasons were not researched.
- **Cause:** the view had one rule (total points, curtailed seasons on
  points per game) and no per-league-season format; the gap was documented
  but left as a design decision.
- **Mistakes while fixing:** (1) groups were first inferred from who met
  whom after the split; that failed where a postponed game or a play-off tie
  linked the groups (Finland 2024, Denmark 2017/18 and 2018/19) and was
  replaced by group sizes plus each club's post-split opponents. (2) The first
  working version took 5.5 s (nested loops over CTEs, which have no planner
  statistics); rewritten on single composite keys, 0.79 s against 0.74 s
  before. (3) Poland and Romania were first given head-to-head over the whole
  season as the tie-break, which the official tables contradict; they use
  regular-season points. *Lesson: check a grouping or tie-break rule against
  every season before generalising from two.*
- **Fix:** `league_season_formats` (one row per league-season with format,
  group sizes, halving and tie-break) and a rewritten `league_standings` that
  follows it; new columns `split_group` and `split_adjustment` at the end.
  19 deductions and awarded-result adjustments and 3 missing results added.
  All 61 seasons checked against Wikipedia (814 rows): every points total
  matches but one; three pairs level on points in the other order
  (docs/history-backfill.md). Every league-season without a split row gives
  exactly the rows it gave before (md5 per league-season). Migrations
  20260927170000-20260927170600.
- **Prevention:** daily guard `split_formats_configured` (warning) fires when
  a split-format league passes its split in a season without a row. Still
  open: the League Table page computes its own table from `matches` and does
  not use the view (OUTSTANDING.md).

## 2026-09-27 · The 2027/28 rollover would have left the site on 2026/27 (found before it happened)
- **Impact:** none yet. From 1 July 2027: the fixture feeds, National League
  and cup ingestion, daily results imports, 21 function defaults, 4 build and
  pipeline scripts and ~20 site modules would have kept reading or writing
  2026/27 (season 13 / label '2627' / feed URLs ending -2026); new fixtures for
  E0-E3, D1 and the UEFA competitions would never have been inserted; and once
  FPL's 2027/28 data loaded, 12 FPL functions and views plus the two
  team-strength views would have paired each player or team with last
  season's holder of the same FPL id (duplicate rows, wrong names and prices).
  The live-event refresh would have kept fetching GW38. Separately,
  `private.refresh_fpl()` would overwrite 2026/27's FPL rows with the new game
  in July (its season changes on 1 August).
- **Cause:** "this season" was written as a constant in each place, and FPL
  joins relied on only one season being loaded.
- **Fix:** `current_season_id()` / `season_id_for_date()` (1 July boundary)
  and `fpl_current_season_id()` used everywhere (migrations
  20260927180000-20260927180600, `ingest-cup-data` v9, scripts, workflows,
  `src/lib/currentSeason.ts`); FPL joins scoped to one season, results proved
  identical before and after; feeds insert a new season's list and tolerate
  not-yet-published feeds. `private.refresh_fpl()` not changed: its July window
  is a manual step in docs/season-rollover.md.
- **Prevention:** daily check `season_rollover_ready` (missing next-season row
  from 1 March, FPL overwrite detected, reminder 15 June - 31 July);
  `supabase/tests/season_rollover_contract.sql` fails if any public function
  hard-codes a season again. *Lesson: "current season" is a query, never a
  constant.*

## 2026-09-27 · League Insights averaged zero cards and missing half-time scores into all-time figures
- **Impact:** after the English history load, League Insights
  (`/football/leagues-compared`) pooled 1992/93-2025/26 and showed 2.46
  yellow cards a game for the Premier League (3.27 over the seasons with card
  data), and tiers 2-4 were 0.7-0.8 too low as well. "Half-time
  lead lost" was also too low (e.g. 20.5% against 26.9% for the Second
  Division/League One): seasons without half-time scores counted as 0%. The
  same load made the landing page's "this season" goals question use 1999/00:
  it took the latest season as the last label in text order ('9900' after
  '2627').
- **Cause:** cards are NOT NULL and stored as 0 when the source has none
  (England before 2000/01, National League 2004/05), and
  `get_cross_league_summary()` averaged them anyway; the page turned a null
  half-time share into 0 before weighting. The landing question sorted
  season labels as text.
- **Fix:** `get_cross_league_summary()` returns null cards for a
  division-season without a single card (migration 20260927160000;
  `home_shots` could not be the marker, as the National League has cards but
  no shots from 2016/17); the page leaves null seasons out of each measure and
  says how many seasons each figure covers. The landing question orders by
  start year (`compareSeasonLabels`).
- **Prevention:** tests for the null-skipping pooling and the 1990s label.
  *Lesson (again): a has-data filter for every average over a NOT NULL 0
  column -- and check what each marker actually marks per league.*

## 2026-09-27 · Asian handicap odds stored in the wrong columns (found by the modelling audit)
- **Impact:** all 146,816 Asian handicap rows in `match_odds` had the
  handicap line in `price_home`, the home and away prices in
  `price_over`/`price_under`, and `line` empty. Nothing read AH yet, so no
  page or backtest was wrong; any market-implied goals model would have been.
  4,142 further rows carried a line but no price (2026/27 `P` rows: Pinnacle's
  AH columns no longer exist in the files).
- **Cause:** the AH branch of `backfill_match_odds()` listed its values in a
  different column order from the other two markets' branches of the same
  UNION; the insert took them by position.
- **Fix:** migration `20260927200000`: rows re-mapped in place, priceless
  rows deleted, function corrected. `20260927200100` filled the line for
  2003-05 rows, whose files give each bookmaker's own line column (`B365AH`).
  54 rows still have no line (the file has none).
- **Also found:** Pinnacle 1X2 odds stop on 8 Jan 2026 (the files dropped
  Pinnacle); Betfair exchange columns (from 2024/25) were never read. BFE is
  now loaded as the sharp benchmark and kept out of Model Returns' "best
  price" (before commission). Every Model Returns, market-efficiency and
  overround result was fingerprinted before and after: identical.
- **Prevention:** a UNION feeding one INSERT must list the same columns in
  the same order in every branch; the corrected function names every column
  in the same order with a comment per market.

## 2026-09-27 · Match xG supplied but only partly imported
- **Impact:** football-data.co.uk has carried HxG/AxG for E0-E3 since
  2026/27; only 219 of 312 English 2026/27 matches had xG (the ones loaded
  before 12 Sep by an earlier path).
- **Cause:** `import-daily.ts` never mapped the columns.
- **Fix:** importer maps them (NULL where absent, never 0); gaps backfilled
  from the archived raw rows (migration `20260927200200`). The 219 existing
  values were checked against the raw rows first: all equal.

## 2026-09-27 · EXPLAIN ANALYZE ran a DELETE (mistake while building the history layer)
- **Impact:** while timing `refresh_team_match_snapshot`, an
  `EXPLAIN ANALYZE DELETE` on the new `team_match_snapshot` table deleted
  Premier League 2025/26's 760 rows. The table was new and not yet read by
  anything; the next rebuild restored them (and the rebuild detects a row-count
  mismatch on its own).
- **Lesson:** EXPLAIN ANALYZE executes the statement. Profile DML only inside
  `begin; ... rollback;`, or profile the SELECT that feeds it.

## 2026-09-28 · Every sitemap URL 301'd; health check was watching the old host
- **Impact:** found in the pre-promotion crawl audit. Every sitemap and
  canonical URL except `/` (e.g. `/fixtures`, `/fpl/line-ups`,
  `/football/teams/arsenal`) answered **301 → the trailing-slash form**, and
  that page declared the no-slash URL canonical: a canonical/redirect loop
  across ~6,800 URLs, since the pages were first generated. Separately,
  ~4,260 non-Premier League match URLs in the sitemap served the bare SPA
  shell (generic title, no canonical, empty body). The daily health check
  had been testing `footballdatashark.netlify.app` since the domain move,
  which 301s everything, and its own host check would fail on the new
  sitemap.
- **Cause:** static generation writes `<path>/index.html` only; Netlify's
  Pretty URLs (default) redirect `/path` to `/path/` for folder-only pages.
  The health check used `urllib`, which follows redirects silently, so a
  301 on every sampled URL looked like 200.
- **Fix:** `scripts/write-flat-html.mjs` writes `<path>.html` beside every
  `<path>/index.html` (Netlify then serves `/path` 200 and 301s `/path/` →
  `/path`). Sitemap match URLs limited to the Premier League, the only
  league with generated match pages. Health check moved to
  `https://fixtureshark.com`, no longer follows redirects, and checks
  canonicals, noindex and the slash redirect direction.
- **Prevention:** `verify-dist.mjs` checks flat files exist; the health check
  now fails on any redirecting sitemap URL. *Lesson: a checker that follows
  redirects can't tell whether a URL is canonical, and one pointed at an old
  host checks nothing.*

## 2026-09-28 · FPL pipeline run failed during a database load spike (my dry runs)

- **What happened:** a manual FPL projections run (09:21 UTC, just after
  PR #146) failed at "Simulate fixture bonus": statement timeouts and
  gateway errors on the per-fixture BPS query, and the script died before
  recording its outcome (pipeline_runs row left "running"; marked failed by
  hand). Re-run at 09:35 passed every step.
- **Cause:** load, not the change. Minutes earlier I had sent two dry-run
  queries that each evaluated the heaviest FPL views
  (`fpl_projection_leaguewide_points` etc.) several times; both were cut off
  by the SQL tool's gateway (502) but kept running server-side. At the time
  `fpl_projection_leaguewide_points` took 48s to count; afterwards, 4.9s.
  The BPS query per fixture: 0.4s once the spike passed.
- **Fix:** none needed in code. The market-goals view patch was applied
  without a dry run instead: with the new columns empty, COALESCE(market,
  model) returns the model's value exactly, and every text replacement was
  asserted to match an exact number of times.
- **Prevention:** *Lesson: don't dry-run through the SQL tool anything that
  evaluates the FPL projection views more than once; a cut-off call keeps
  running and loads the database for everything else. Time one evaluation
  first.*

## 2026-09-28 · FPL minutes: starters counted as subs; two-week-old injury flags still applied

- **Reported:** gameweek 6 minutes looked wrong (Chris).
- **What happened:** (1) `fpl_player_substitution_usage` counted a "start"
  as any match of 60+ minutes, so starters taken off before 60 were logged
  as substitute appearances. Ndoye (started 5 of 5) got a 0.46 start
  probability; N. Angulo, Stroud, Kayode, Cherki alike, with inflated
  "substitute minutes". (2) `fpl_player_squad_state` was loaded once from the
  FPL API on 14 Sep and never refreshed; its injured/doubtful/suspended rows
  kept overriding live availability. 16 players FPL lists as fully available
  were still forced down (Reinildo held at 0 by "suspended until 10 Oct";
  Doku, Baleba, Sarr, Henderson, Tonali, Gomez, Cash, Shaw ...).
- **Fix:** starts from FPL's own per-fixture `starts` stat (60+ minutes only
  where missing); stale rows closed (history kept) -- live FPL status and
  chance of playing already drive availability. Projections regenerated.
- **Prevention:** integrity check `fpl_squad_state_not_stale`. *Lesson: a
  proxy ("60+ minutes = started") silently diverges from the fact it stands
  for -- use the recorded fact when the source has it; and a one-off import
  that overrides a live feed needs an expiry.*
