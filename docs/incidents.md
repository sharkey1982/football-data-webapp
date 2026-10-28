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

## 2026-10-23 · GW8 captaincy and team-news posts never went out
- **Found:** Chris, after the GW8 deadline (Fri 23 Oct, 18:30 UK): no captaincy post and no late preview post on @FixtureSharkHQ. (The GW8 preview thread did post, Thu 22 Oct 08:10.)
- **Impact:** No GW8 captaincy post. The Friday team-news update thread was not sent. Nothing wrong was posted.
- **Cause:** (1) Captaincy: the ranking queued at 05:05 Thu (to post 24h before the deadline) failed its re-check at 18:30 Thu because one projected value had moved by 0.1. The detector only made a new candidate when the top three players changed, which did not happen until 16:50 Fri, by when the detector's window (closing 3h before the deadline) had shut. So nothing replaced it. The stale candidate was then re-checked and audited every 10 minutes until the deadline (about 140 audit rows). (2) Team news: the thread was made at 17:25 Fri with a 60-minute hold, so it was due at 18:25, but the worker runs every 10 minutes and the post expired at 18:30, just before the next run.
- **Fix:** `20261023210000_social_missed_deadline_posts.sql`: the captaincy candidate key covers every number in the post, so a stale ranking is replaced on the next hourly run; a replacement posts 15 minutes after it is made; the window runs to 90 minutes before the deadline; captaincy stops once posted for the gameweek; every hold ends at least 20 minutes before expiry; a stale queued candidate is retired instead of re-checked.
- **Prevention:** *Lesson: a re-check that can fail must have a path that produces the replacement, and a schedule must be checked against the worker's tick, not just the clock time.*

---

## 2026-10-23 · Smoke check passed PRs on runs that tested nothing (my merges of #423 and #425)
- **Found:** checking `smoke_runs` after merging #425: no run was recorded for its last commit, yet its `smoke/preview` status said success.
- **Impact:** #423 was merged on a "success" from a migration-only commit; the real run on its site code (run 191) had failed on /fixtures and /tv-guide. #425's rebased commit likewise. Both failures were HTTP 400s from columns the PR's own migration had not yet created; the pages fell back to plain links, and production was clean once the migrations ran (run 194: 88 pages, 0 failures). So no visitor-facing harm, but the check gave no evidence for either merge.
- **Cause:** when Netlify skips a build (only ignored paths changed), `weekly-smoke.yml` posted `success` with "No site changes" without testing. I read the status, not the run.
- **Fix:** a skipped build now smoke-tests the PR's existing deploy preview (same site code), and the status says so; it passes on nothing only when there is no PR. A frontend that reads a new column now waits for its migration, merged first in its own PR (as CLAUDE.md says).
- **Prevention:** the workflow change. *Lesson: a green check is evidence only if it ran; read the run, not the badge.*

---

## 2026-10-23 · Premier Sports games filed under Prime Video in the football TV guide
- **Found:** Chris, on /tv-guide with the Prime Video service filter.
- **Impact:** Premier Sports' LaLiga games (9 upcoming) appeared under "Prime Video" and read "Requires Prime Video subscription". They need a Premier Sports subscription; Prime Video Channels is only one place to buy it, as an add-on.
- **Cause:** the provider regex matched "Prime Video Channels" in `streaming_service`; the requirement line took the first provider in list order (Prime Video before Premier Sports), not the broadcaster.
- **Fix:** `watchGuide.ts`: "Prime Video Channels" no longer counts as Prime Video; the requirement names the broadcaster's own subscription first.
- **Prevention:** `src/__tests__/watchGuideProviders.test.ts`. *Lesson: "available via X" is not "is X".*

---

## 2026-10-23 · NFL TV guide said DAZN Game Pass shows every game live
- **Found:** checking DAZN's UK Game Pass help page before switching on the DAZN affiliate link (PR #423).
- **Impact:** since the NFL TV guide launched (4 Oct), every regular-season game listed DAZN as live. Game Pass blacks out one 18:00 and one 21:25 UK Sunday game each week (on demand 24 hours later), so two games a week were wrong. About to get worse: the affiliate link would have sat on those games too.
- **Cause:** `nflWatch` was written from the rights summary ("every game") without the blackout clause in DAZN's own help article.
- **Fix:** Sunday-window regular-season games now carry a DAZN entry with the blackout note and no watch link; the guide intro says so; rights re-checked 23 Oct.
- **Prevention:** `src/__tests__/affiliateSections.test.ts` (window games have no DAZN link; Thursday, Sunday night, London, play-off and Super Bowl games keep it). Not done: naming the actual blacked-out games each week (DAZN lists them by Wednesday). *Lesson: read the provider's own small print before saying "every".*

---

## 2026-10-23 · Affiliate partners matched by domain alone, site-wide
- **Found:** before activating DAZN for the NFL section (PR #423).
- **Impact:** none (no partner was ever active). Switching DAZN on would have put affiliate links on the 16 football broadcasts that link to dazn.com, on Club pages.
- **Cause:** `getActivePartners` filtered by category and market only.
- **Fix:** `affiliate_partners.sections` (empty = nowhere); every caller passes its section. DAZN is `{nfl}`.
- **Prevention:** `src/__tests__/affiliateSections.test.ts` checks the section filter is sent. *Lesson: an on-switch needs a scope.*

---

## 2026-10-22 · Public pages could show raw database error text
- **Found:** site audit of 22 Oct (S-19). Latent: no smoke run recorded one.
- **Impact:** on a failed request, about 20 public pages (Team Strength, Player Projections, Optimal Squad, Compare, Scoring Rules, Model Scorecard, the TV guide and others) would have shown PostgREST text such as "permission denied for table ..." or "canceling statement due to statement timeout".
- **Cause:** `getErrorMessage` passes the raw message through by design (useful on admin pages), and public pages used it too.
- **Fix:** `friendlyError(e, what)`: database, API and network errors become "<what>. Please try again in a moment." with the raw error in the console; messages our own code writes for the visitor still show. Admin pages keep `getErrorMessage`.
- **Prevention:** `src/__tests__/friendlyError.test.ts`. *Lesson: a message written for the developer is not a message for the visitor.*

---

## 2026-10-22 · Secondary text, amber text and focus ring under WCAG contrast; unlabelled filters; mouse-only rows
- **Found:** site audit of 22 Oct (S-11, S-12).
- **Impact:** `text-ink-500` (about 1,400 uses) was 4.4:1 on the page background and 3.9:1 on chalk-200 (AA needs 4.5:1); amber-600 text 2.9:1; the amber focus ring 2.1:1 on light surfaces (needs 3:1). Filters on /table, /fixtures, /football/projections and /preview had labels not tied to their selects, so screen readers announced them unnamed. Fixture, player and gameweek rows opened only on a mouse click.
- **Cause:** colours chosen by eye; labels written as siblings without `htmlFor`; rows given `onClick` only.
- **Fix:** ink-500 #6b7075 to #5a5f64 (5.7:1 / 5.1:1); new amber-700 #7d5c19 for amber text (5.4:1); focus ring pitch-800 on light surfaces, amber kept on dark panels; `htmlFor`/`id` on 14 filters; `rowKeys()` (tab stop, Enter/Space) on eight clickable row types, with `aria-expanded` where a row expands.
- **Prevention:** label and row assertions in the LeagueTable and GameweekBrowser tests, `src/__tests__/rowKeys.test.tsx`. *Lesson: check a colour against the backgrounds it sits on, not on its own.*

---

## 2026-10-22 · NFL Snap Outlook failing (HTTP 500); 47 menu pages never smoke-tested
- **Found:** site audit of 22 Oct (S-09); the snap-outlook failure by the first smoke run over every menu page (run 187, against production).
- **Impact:** /nfl/snap-outlook's snap request returned HTTP 500, so the page showed no outlook. Unknown since when: 47 of the 71 header-menu pages, this one included, were in no smoke run. /fpl was recorded as "fpl-hub" though it is Match Projections; the NFL entry tested a 301 (/nfl/standings); fpl-fixture reported "no URL in the sitemap" every run.
- **Cause:** `public.nfl_player_snaps` computes the team's snaps with a window partitioned by game and team, which stops the page's season and team filters reaching the table: every request sorted all 333,000 rows (1.8 s warm). The smoke list was hand-written.
- **Fix:** `20261022130000_nfl_player_snaps_window_pushdown.sql` adds season and game type to the partition (identical values, checked row for row; 1.8 s to 0.14 s). The smoke test reads `scripts/smoke/menu-pages.json` (hubs and every menu page from journey.ts); /fpl is "fpl-match-projections", NFL is /nfl/table, fpl-fixture dropped.
- **Prevention:** `src/__tests__/smokeMenuPages.test.ts` fails when the menu and the smoke list differ. Not done: previews still run main's smoke script (checking out the PR head would hand a fork's code the service key). *Lesson: a window function in a view hides the filters on top of it.*

---

## 2026-10-22 · TV guide downloaded its first three weeks twice; /fpl jumped while loading
- **Found:** site audit of 22 Oct (S-08), production smoke runs 80-135.
- **Impact:** /tv-guide fetched 2.4 MB per visit: the next three weeks (412 KB), then the whole season again from the start (1,958 KB). /fpl had CLS 0.21-0.25 in every production run (budget 0.1). /fpl/player-points could fetch its 415 KB projections twice when the gameweek in play arrived after the default gameweek.
- **Cause:** the TV guide's second pass had no lower date bound and selected `*`; on /fpl the gameweek bar and the fixture-moved notice appeared above or between content already painted; the range filter applied its preset before knowing the in-play week, then again after.
- **Fix:** second pass reads only `kickoff_date > until` and appends; named columns; /fpl shows its heading and a fixed-height placeholder for the gameweek bar while loading, and the notice sits below the bar; the range filter waits for the in-play answer (`inPlayLoading`) on the four pages that pass it. The twin `nfl_projections` and `tennis_players` reads in the smoke report are two pages of one paged read (1,000-row cap), not duplicates.
- **Prevention:** `src/__tests__/auditPerf.test.tsx`, TvGuidePage test of the two passes; smoke CLS and payload budgets. *Lesson: a "load the rest" pass must start where the first one stopped.*

---

## 2026-10-22 · Stale titles and canonicals after navigation; indexable "not found" pages
- **Found:** site audit of 22 Oct (S-05, S-10, S-17).
- **Impact:** eleven pages (e.g. /fpl/player-points, /fpl, /team-strength) set no head, so after client-side navigation the tab title and `<link rel=canonical>` still named the previous page (e.g. Arsenal). "No such section/match/team" states under the hubs, international matches and teams, club finances and team-of-the-week rendered as normal 200 pages without noindex (soft 404s). llms.txt sent "Player projections" to /fpl, which is Match Projections.
- **Cause:** the head was opt-in per page; not-found states were written page by page.
- **Fix:** AppLayout applies the routeMeta head (or the site defaults, with no canonical) after each navigation when no mounted page manages the head (`activeDocumentHeads()`); every not-found branch renders `NotFoundPage` (noindex, with a link back to its list); llms.txt corrected.
- **Prevention:** `src/__tests__/auditHeads.test.tsx`. *Lesson: a default that each page must remember to override is a default that some page forgets.*

---

## 2026-10-22 · Home and hub pages empty without JavaScript; cookie banner held back LCP
- **Found:** site audit of 22 Oct (S-04, S-07, S-12).
- **Impact:** the raw HTML of /, /football, /fpl/start, /nfl, /tennis and /international had a head but no body, and the header menus rendered their links only when opened, so crawlers and link previews saw almost no internal links (Google has seen about 6.6% of the sitemap). On a third of pages the cookie banner, rendered by React after the bundle loaded, was the LCP element (prerendered pages: FCP ~700 ms, LCP ~2,100 ms). No skip link; menus did not close on Escape.
- **Cause:** static routes were written head-only; menus mounted their list on open; the banner was a React element shown from an effect.
- **Fix:** home and the five hubs are prerendered with their first render; menu lists are always in the DOM (`hidden` until opened, `aria-controls`, Escape and tabbing away close them, focus returns to the button); the footer links the five hubs; the banner is in index.html, shown by an inline script when no choice is stored, and wired by CookieConsent (consent behaviour unchanged: nothing loads until Accept). Skip link to `#main-content`.
- **Prevention:** `src/__tests__/auditSiteShell.test.tsx` (hub bodies contain the menu links, banner keys match analytics.ts, Escape and skip link). *Lesson: whatever the first paint needs should not wait for the bundle.*

---

## 2026-10-22 · Impossible values in old projections, match shots and tennis statuses
- **Found:** data-quality audit, 22 Oct (DQ-15, DQ-16, DQ-17).
- **Impact:** 61 GW4 projection rows (fixture 36, leaguewide_v4/v6 and prototype_v3) said a player could not appear yet gave him up to 1.4 expected minutes; 9 v6 totals were slightly negative. 16 historic matches (2000/01 to 2024/25, football-data.co.uk) had more shots on target than shots on one side (20 sides), skewing shot stats. Two tennis matches stored the source typos "Rrtired" and "Walkoer". Four European teams matched the FixtureDownload feed only through the canonical-name fallback.
- **Cause:** a GW4 lineup input that set minutes without the matching probabilities; source errors in the CSVs and the tennis Comment column, stored as read.
- **Fix:** `20261022163700_data_cleanups_dq15_17.sql`. The 61 rows are set to 0 throughout, which is what their own probabilities say. The bad shots pairs are nulled, because no other source in the database has them. The tennis statuses are corrected, and the four FixtureDownload aliases added.
- **Prevention:** the trigger `matches_null_inconsistent_shots` nulls such a pair on any future write, so a re-import can't bring the pairs back. `tennis_import.py` normalises the two typos, with a test.

---

## 2026-10-22 · Duplicate BBC listing; a live listing on a postponed game
- **Found:** data-quality audit, 22 Oct (DQ-17).
- **Impact:** Dortmund v Bremen (9 Oct) showed BBC twice in Where to watch. Scunthorpe v Forest Green (3 Oct) is postponed in the fixtures feed but carries a "shown live on DAZN" listing, so one of the two is wrong.
- **Cause:** two Airtable records for the same broadcast, and nothing checked broadcast rows against fixture status.
- **Fix:** `20261022104000_broadcast_duplicates_postponed.sql` deletes the duplicate (row 160). The Scunthorpe row is left until a source settles it.
- **Prevention:** integrity checks `broadcast_duplicate_rows` and `broadcast_on_postponed` (warnings).

---

## 2026-10-22 · Public edge functions could write with the service role
- **Found:** security audit, 22 Oct (SEC-01, SEC-02, SEC-15).
- **Impact:** no outside calls seen in the logs. `backfill-cup-raw` and `backfill-football-raw` (verify_jwt off, service role, no caller) let anyone write unlimited raw rows; anyone could trigger `ingest-cup-data`'s full scrape and write; `fpl-optimize-squad` ran a 15 s search per request with no limit, returned database error details, and its source was not in the repo; `supabase/config.toml` disagreed with the deployed settings.
- **Cause:** functions deployed by hand with verify_jwt off and no check of their own; config.toml not kept in step.
- **Fix:** the two backfills are 410 stubs requiring a JWT; `ingest-cup-data` requires `x-ingest-token` (Vault secret `ingest_cup_token`, sent by pg_cron through `private.call_ingest_cup_data()`); `fpl-optimize-squad` source committed, a request problem returns 400 and anything else a generic 500, live searches capped (`fpl_optimizer_rate_ok`: 4 a minute per client, 30 overall); config.toml lists every deployed function with its real setting. Migration `20261022124000_edge_function_guards.sql`.
- **Prevention:** config.toml is the record of every deployed function. *Lesson: a function that trusts its URL to stay secret is a public function.*

---

## 2026-10-22 · Seven scheduled workflows could fail or stop unseen; intl reloads on every migration
- **Found:** pipelines audit, 22 Oct (P-07, P-11).
- **Impact:** apply-migrations, export-db-definitions, hindsight-optimal, schema-snapshot, sf-round and site-health wrote no run log (`job_health` "not_logged"), and gameweek-report had no `job_registry` row at all, so a dropped run (two sf-round runs in 14 days) was invisible. intl-import and intl-squads reloaded in full after every migration push: 63 `intl_import` rows in 14 days against 14 needed.
- **Cause:** the registry trusted `github_scheduled_runs_ok`, which only sees the latest run's conclusion; the intl workflows' `workflow_run` trigger had no filter on what the migration changed.
- **Fix:** each of the seven workflows ends with a "Log run" step writing a `pipeline_runs` row (always, never failing the job); `20261022123000_job_registry_run_logs.sql` points their registry rows at it with an expected interval and registers gameweek-report. The intl workflows' new `changes` job reloads after a migration push only when an added migration mentions `intl.` or `intlw.`.
- **Prevention:** `jobs_stale` / `jobs_failed` now cover these jobs. *Lesson: a job that leaves no trace cannot be missed.*

---

## 2026-10-22 · Integrity alarm red for 25 days on known failures
- **Found:** pipelines audit, 22 Oct (P-02, P-09).
- **Impact:** `model_integrity_checks` failed every day since 28 Sep, so the daily-import E0 failure and the Airtable outage arrived unnoticed inside an alarm that was already red.
- **Cause:** accepted failures (tennis import PC-only since 5 Oct) had no way to be set aside, and `unique_function_names` failed on the deliberate 5-argument `social_finish_publish` wrapper.
- **Fix:** `public.integrity_acknowledgements` (check, optional item, reason, date), read by `scripts/run_integrity_checks.py`: an acknowledged failure is a warning with its reason until the date, then fails again; a list check such as `jobs_stale` still fails while any other item in it is unacknowledged. Tennis acknowledged until 5 Nov. The 5-argument overload dropped. Each area's runtime is logged and warns above 60 s. Migration `20261022121000`. New area `deadlines` (`check_deadline_runs()`, migration `20261022121100`, audit P-06): the last FPL projections and FFS runs before each deadline must finish within 6 h of it, and no pg_cron dispatch slot may fail every attempt.
- **Prevention:** `integrity_acknowledgements` line in every run lists what is set aside and until when; `scripts/test_run_integrity_checks.py` runs before the checks. *Lesson: an alarm that is always red is an alarm that is off.*

---

## 2026-10-22 · Database grants wider than needed (security audit)
- **Found:** security audit, 22 Oct (SEC-07, SEC-09, SEC-18, Supabase advisors).
- **Impact:** no misuse seen. anon and authenticated held TRUNCATE (which ignores RLS), TRIGGER, REFERENCES and MAINTAIN on every public table; anonymous visitors could read `sf.fantasy_managers.user_id` (the admin's auth UUID); five September backup tables (one with RLS off) and a staging table sat in public; 19 functions had no fixed search_path; two policies re-evaluated `auth.uid()` per row; one duplicate index.
- **Cause:** Supabase's default privileges for tables postgres creates in public include those rights for the API roles; one-off tables were never cleaned up.
- **Fix:** `20261022122000_security_hardening.sql`: revoke the four rights (existing tables and the default for new ones); column-level SELECT for anon on `sf.fantasy_managers` without `user_id`; drop the six tables; pin search_path (except five SQL functions inlined into views); `(select auth.uid())` in the two policies; drop the duplicate index.
- **Prevention:** the Supabase security and performance advisors after each schema change. Not fixable by migration: anon EXECUTE on `extensions.http_*`, `net.*` and `cron.*` (granted by supabase_admin). *Lesson: a default grant is a decision nobody made.*

---

## 2026-10-22 · Ligue 1 had Rennes v PSG twice; the Veikkausliiga table dropped the top six's latest game
- **Found:** data-quality audit, 22 Oct (DQ-05, DQ-06).
- **Impact:** fixture 5302 (6 Mar 2027) was Rennes v PSG, a repeat of the 23 Aug game, so its page, prediction and home advantage were wrong and PSG v Rennes was missing. In the Veikkausliiga table every championship-group team was one game short (HJK and KuPS 3 points short).
- **Cause:** FixtureDownload's Ligue 1 feed lists Rennes v PSG for rounds 1 and 23, and `refresh_feed_nearest_date()` inserted the second listing because it only looked for the pairing within 60 days. The 2026 Veikkausliiga format row said each group plays 5 games; the championship group plays 10 (as in 2025).
- **Fix:** `20261022103000_fixture_pairing_guard_fin_format.sql`: 5302 becomes PSG v Rennes (slug too; prediction recomputed); the feed matcher never inserts a pairing a double-round-robin league already has (SC0 excepted); partial unique index on the pairing for E0-E3, SP1, D1, I1, F1; FIN 2026 `group_games` [10,5] and the standings cache rebuilt.
- **Prevention:** integrity checks `league_pairing_repeated` and `standings_played_matches`. *Lesson: a feed is a source, not the truth; check its shape against the competition's format.*

---

## 2026-10-22 · Deadline-critical workflows started hours late (GitHub cron)
- **Found:** pipelines audit, 22 Oct (P-01).
- **Impact:** over 14 days GitHub started daily-import, the FPL pipeline and FFS team news 2 to 9.5 h after their cron times (median about 5 h). On 17 Oct (GW7, deadline 10:00 UTC) the morning projections and team news landed at 11:10 and 11:37, after the deadline; the new Friday post-press-conference update for GW8 (deadline Fri 23 Oct 17:30 UTC) was likely to land near or after it.
- **Cause:** GitHub's scheduled events are best-effort and queue behind everyone else's; moving off the hour (25 Sep) did not help.
- **Fix:** pg_cron dispatches the slots on time (`private.workflow_dispatch_slots`, `private.dispatch_due_workflows()` every minute) through `netlify/functions/trigger-workflow` with a machine token generated in Vault. Slots: the old daily cron times, the team-news update by the `team_news_thread` rule, and the FPL pipeline 2 h / FFS 2.5 h before every deadline. The GitHub crons stay as a fallback: a late run asks `workflow_slot_covered()` and skips itself if the slot already ran. Migrations `20261022120000`, `20261022120100`.
- **Prevention:** every request and response is logged in `private.workflow_dispatches`; job `workflow-dispatcher` in `job_registry`. *Lesson: a scheduler with no service level is not a deadline.*

---

## 2026-10-22 · Tactical-roles minutes averages read half the season; "today" was the UTC date
- **Found:** audit of 22 Oct (CODE-04, CODE-13).
- **Impact:** /fpl/tactical-roles (admin) computed "average minutes per game" from the first 1,000 of 2,158 gameweek rows, so about half the players' games were missing. The daily import's `team_aliases` read (679 rows) would have dropped mappings silently past 1,000. Eleven pages and helpers took "today" as the UTC date, which between 00:00 and 01:00 BST is yesterday in the UK. Some team page reads ignored errors, so a failed read showed a club with no division or strength, or its played games as unplayed.
- **Cause:** unpaged PostgREST selects (the server caps a response at 1,000 rows without an error), tests that mock responses and so never see the cap, `toISOString().slice(0, 10)` used as the UK date, and `{ data }` destructured without `error`.
- **Fix:** `src/lib/pagedSelect.ts` (`selectAllPages`) for both reads. A test fake (`src/__tests__/helpers/postgrestFake.ts`) caps responses at 1,000 like the server. `src/lib/ukDate.ts` (`ukToday`, `addIsoDays`) is used at the 11 sites. Errors are thrown in `teamPageApi`, `tacticalRoleAdminApi` and `nflTrivia`.
- **Prevention:** use `selectAllPages` for any read that can pass a few hundred rows, and the fake in tests. *Lesson: a mocked response can't show you a server limit.*

---

## 2026-10-22 · UK TV guide frozen since 18 Oct: Airtable API cap exhausted
- **Found:** the 22 Oct audit (P-03 / DQ-04). `check_job_health` had flagged `jobs_stale` for `sync-airtable-broadcasts-3-hourly`, inside an alarm that was already red.
- **Impact:** every sync from 18 Oct 18:40 failed with HTTP 429. Nothing added in Airtable after 18 Oct 15:40 reached `/tv-guide` or the match pages. For the next 7 days, only 8 of 24 National League, 2 of 12 Scottish Premiership and 4 of 9 Bundesliga fixtures had a listing.
- **Cause:** the free Airtable plan allows about 1,000 API calls a month. The sync made about 60 a day (8 runs × 7-8 pages, plus tick and prune writes), so it ran out in under three weeks. The failed runs rolled back their own log row, so `job_health` still showed `last_status = success`.
- **Fix:** Airtable removed (Chris's decision). `20261022150000_broadcasts_claude_research.sql` unschedules the cron job, drops `sync_airtable_broadcasts_from_api` and `sync_airtable_broadcasts`, and deletes the `airtable_token` secret. Their matching logic is now `match_broadcast_fixture()`, used by the new `ingest_broadcasts(rows, label)`. A scheduled Claude task researches official sources and submits rows through a migration (`docs/broadcast-research.md`). The Airtable data could not be exported first, because the connector uses the same capped API. The site already held everything up to 18 Oct; the first research run covers the gap.
- **Prevention:** no API quota left to run out. `job_registry` job `broadcast-research` and the integrity area `broadcasts`: `broadcast_research_fresh` (warns after 5 days, fails after 9), `broadcast_decisions_next_10d` (PL/EFL/Carabao Cup fixtures without a GB decision) and `broadcast_unmatched_upcoming`. *Lesson: a free tier is a quota; work out the monthly call count before scheduling against it.*

---

## 2026-10-22 · Daily Premier League import failed three days running; its odds arrived only by luck
- **Found:** pipelines audit, 22 Oct (P-04).
- **Impact:** the daily-import workflow was red on 19, 20 and 21 Oct ("Import failed for E0"), which hid other failures. Premier League odds still arrived only because the Championship step's global odds pass happened to cover them; an E0-only run would have left them out. `match_import_runs` said `success`, so `job_health` disagreed with GitHub.
- **Cause:** `scripts/import-daily.ts` called the global `backfill_match_odds()`, which scans every archived football-data.co.uk row (80k rows against 812k odds rows) and outgrew the API role's 8 s statement timeout. The odds failure was logged with status `success`.
- **Fix:** `20261022102000_backfill_match_odds_scoped.sql` adds `backfill_match_odds_for(competition_code, season_label)` (one division-season's files, about 60 ms); the importer calls it for the league and season it just imported, and logs `failed` when the odds step fails.
- **Prevention:** the run log now reports an odds failure as a failure. *Lesson: a step that does work for everyone should not be run by each caller.*

---

## 2026-10-22 · FPL reviews scored the model on projections rewritten after kick-off
- **Found:** production audit, 22 Oct (DQ-07).
- **Impact:** Team of the Week vs model, Model XI (players and history) and the start-accuracy comparison read the live `fpl_player_projections` for past gameweeks, rows that were regenerated for hours after kick-off. Scored from the deadline snapshots instead, the model XI's actual points drop from 72 to 58 for GW7 and from 60 to 46 for GW6, so the pages flattered the model. Model XI history also said "not generated before the deadline" for every week.
- **Cause:** the deadline snapshots (`fpl_projection_snapshots`, from GW6) were only read by the gameweek report; the other consumers predate them. anon also had no SELECT grant on the snapshot table despite its public-read policy.
- **Fix:** migration `20261022111000_fpl_reviews_read_deadline_snapshots.sql`: view `fpl_review_projections_v6` (pre_deadline, else late, snapshot per gameweek; live rows only for gameweeks without one, GW1-5), read by `get_totw_vs_model`, `get_model_xi_players`, `get_model_xi_history` and `fpl_prediction_actual_start_comparison`. Projections are also frozen at kick-off from migration `20261022110000`.
- **Prevention:** `src/__tests__/fplReviewSnapshots.test.ts`. *Lesson: anything that compares a forecast with the outcome reads the frozen forecast, never the live table.*

---

## 2026-10-22 · FPL projections: short team sheets, stale injury news, rewritten after kick-off
- **Found:** production audit, 22 Oct (DQ-08, S-13, DQ-07), 40 hours before the GW8 deadline.
- **Impact:** (1) Chelsea's only fit keeper (Penders) had start 0.25 for GW8-12, so Chelsea's clean-sheet and save points all but vanished and the optimiser would never pick a Chelsea keeper; 18 of 200 GW8-17 team-fixtures were more than 0.5 from 11 expected starters (Spurs GW8 9.63, Coventry ~10.3 every week). (2) Saka, 50% doubtful from 21 Oct 20:30, was projected at start 0.94 and shown #2 on the FPL hub; Timber (75%) likewise. (3) 4,591 of 4,662 v6 rows on played fixtures had been regenerated after kick-off, so stored history was not what users saw before the match.
- **Cause:** (1) `fixture_player_expected_minutes_resolved_v3` only scaled a team DOWN to 10 outfield + 1 keeper, never up (a documented limitation). Goalkeepers are outside the depth chart, so a backup keeper kept his history rate. (2) The 21 Oct run started at 22:06 but `fpl_players` had last been refreshed at 18:17 (6-hourly pg_cron). The depth-chart start chance (`fpl_depth_start_store`) is also used as-is, with no cap at availability: it is right only if the Python depth step ran on current availability, and that step just warns if it fails. (3) `refresh_fpl_projection_fixture_v6` skipped only `status = 'played'`, which is set hours after the match.
- **Fix:** migration `20261022110000_fpl_team_sheets_and_kickoff_freeze.sql`: start chance cut back to availability where it is above it, then scale-up to 11/1 within availability (bug fix within leaguewide_v6, `model_change_log`); the refresh skips fixtures whose kick-off has passed. `scripts/refresh_fpl_projections.py` calls `refresh_fpl()` before refreshing availability. Projections re-run by dispatching `fpl-projections-pipeline.yml` after the merge.
- **Prevention:** checks `fpl_projection_team_starters` (failed if an upcoming team-fixture is outside 11 +/- 0.5 starters or 1 +/- 0.2 keepers) and `fpl_projection_respects_chance_of_playing` (warning if a player's next-gameweek start chance is above FPL's chance of playing); regression tests in the migration; `src/__tests__/fplProjectionGuards.test.ts`. *Lesson: a normaliser that only trims hides shortfalls; check the totals a team must have, not just the ceiling.*

---

## 2026-10-22 · Games with no result were shown as "played", then quietly relabelled "postponed"
- **Found:** data-quality audit, 22 Oct (DQ-02, DQ-03).
- **Impact:** 33 games from Tue 20 Oct (EFL and Champions League) were `played` with no score; results pages showed played games without a result. Worse, `reconcile_unreported_played_fixtures()` had relabelled 10 games whose results never arrived (8 League One, 1 League Two, 1 La Liga) as `postponed`, so tables, form, model fits and Last Man Standing left them out, the site called them postponed, and they were re-predicted as future games.
- **Cause:** `status` was time-based (`played` once kick-off passed, with or without a result), and the reconcile step inferred a postponement from a missing result, which no source had reported.
- **Fix:** `20261022101000_fixture_awaiting_result_status.sql`: new status `awaiting_result` (kicked off, no result or reported score). A trigger on `fixtures` keeps `played` for games with a result or reported score, and a trigger on `matches` moves a game to `played` the moment its result lands. `postponed` now comes only from a source. The 10 inferred postponements became `awaiting_result`. The site treats `awaiting_result` as kicked off (never upcoming) and shows "Result to follow" (`src/lib/fixtureStatus.ts`).
- **Prevention:** integrity check `results_missing_48h` (warning) lists games awaiting a result more than 48 hours after kick-off. *Lesson: a status should say what a source told us, not what the clock implies.*

---

## 2026-10-22 · Premier League games moved for TV kept their old date and were labelled "not televised"
- **Found:** data-quality audit, 22 Oct (DQ-01).
- **Impact:** 29 Premier League fixtures (GW13-16) showed FixtureDownload's old date or time; 19 of them still sat in the Saturday 15:00 slot and carried a "not shown live in the UK" row from the 3pm-blackout rule. Examples: Tottenham v Arsenal (really Sun 6 Dec 16:30), Chelsea v Aston Villa (Mon 21 Dec 20:00). Kick-off dates also feed predictions, Last Man Standing and "next fixture".
- **Cause:** `refresh_fixture_feeds()` took dates only from FixtureDownload, which lags TV picks; FPL's official feed (`fpl_fixtures.kickoff_time`) had the right ones but nothing copied them across. `apply_uk_3pm_blackout()` then trusted the stale slot.
- **Fix:** `20261022100000_pl_kickoffs_follow_fpl.sql`: `sync_pl_kickoffs_from_fpl()` makes FPL's kick-off win for every FPL-mapped fixture (logged in `fixture_changes`; slugs unchanged), run by a trigger on `fpl_fixtures` (so each `refresh_fpl` applies moves at once) and by `refresh_fixture_feeds`, which no longer moves those fixtures back. The blackout rule also checks FPL's kick-off and drops rule rows for postponed fixtures.
- **Prevention:** integrity check `pl_kickoff_matches_fpl`. *Lesson: when two feeds carry the same fact, decide which one wins and check that they agree.*

---

## 2026-10-22 · EFL and National League team pages served as bare app shells
- **Found:** site audit of 22 Oct (S-03, S-10).
- **Impact:** /football/teams/:slug for the 96 clubs outside the Premier League (Championship to National League) had the generic "FixtureShark" title, no canonical, the home page description and an empty body, while tables, fixtures and Local Clubs linked to them. Google ranked them at 50-70 (afc-wimbledon 51 impressions at 71). /fpl/fixture/:id was an indexable app shell with impressions.
- **Cause:** generate-static and the sitemap built team pages only for clubs in this season's Premier League fixtures (written when only the Premier League had a team page body).
- **Fix:** generate-static writes full team pages for every club in this season's five English leagues (two extra paged reads; odds requested in chunks of 200 ids) and the sitemap lists them. /fpl/fixture/:id sends `X-Robots-Tag: noindex` (netlify.toml), sets its own head and noindex, and an id with no data renders the not-found page.
- **Prevention:** the team list in the sitemap and in generate-static come from the same league set. *Lesson: when a page type gains a body for one league, check which other URLs of that type are linked.*

---

## 2026-10-22 · Prediction ledger stopped on 23 Sep; two retired-version fits still served League One and Two
- **Found:** audit of 22 Oct (DQ-09, DQ-10).
- **Impact:** (1) `match_predictions`, the archive behind Model Returns and the scorecard for past seasons, had no rows after 23 Sep and none for League One, League Two or the National League in 2026/27 (E0 50/70, E1 95/131, E2/E3/EC 0). Pages read the fixtures for the current season, so nothing showed yet, but at the 2027/28 rollover the 2026/27 track record would have lost most of its matches. (2) 80 played 2026/27 fixtures (E2 36, E3 44) showed predictions from fits #4 and #5 (`legacy_pre_v1`, retired 23 Sep), written after kick-off (11-23 Sep). No look-ahead (both fits date from June) and their scoring level is sound, but they were never what the site showed before those games.
- **Cause:** (1) the ledger's only writer was `scripts/retrofit_verify_and_predict.py`, run by hand for the retro-fits. (2) The 23 Sep retirement rejected only the fits with the scoring-level offset (#2, #3, #6).
- **Fix:** `20261022140000` re-predicts those 80 fixtures point-in-time with dc_baseline_v1 (old values in `prediction_corrections`), rejects #4 and #5, and adds a `model_change_log` row. `20261022140500` adds `record_match_predictions(season)`, which copies each played match's frozen fixture prediction into the ledger (accepted fit dated before the match, never overwrites). It runs from pg_cron at 09:45 and 21:45 (`record-match-predictions`, in `job_registry`). The file also backfills 2026/27.
- **Prevention:** the cron job and its `job_registry` row (`jobs_stale` / `jobs_failed` flag it if it stops). *Lesson: a record that only a manual script writes stops being kept.*

---

## 2026-10-20 · Preview smoke test failed on a PR with no site changes
- **Found:** PR #386 (a migration and an Edge Function only).
- **Impact:** `smoke/preview` reported failure. No site code was involved, so it was a false alarm that would block the merge rule.
- **Cause:** Netlify skips the build when only ignored paths change. Its status then links to the deploy log on app.netlify.com, which the smoke test browsed as if it were the preview: every page showed ERR_BLOCKED_BY_CLIENT.
- **Fix:** `weekly-smoke.yml` recognises an app.netlify.com target and reports success, "No site changes: Netlify skipped the build", without browsing. PR #386 was merged on the Netlify checks; the fix applies from the next PR, because status-event workflows run from main.
- **Also found:** the smoke run was often cancelled before it reported. Workflow-level concurrency let the skipped runs started by every other commit status cancel the real one. Concurrency moved to the job (PR #387).
- **Prevention:** the fix itself. *Lesson: a check that can't tell "nothing to test" from "broken" teaches people to ignore it.*

---

## 2026-10-18 · Fixtures head-to-head and FPL line-ups failing for every visitor (timeouts)
- **Found:** the first browser smoke run (scripts/smoke/weekly_smoke.mjs), 18 Oct.
- **Impact:** on /fixtures the head-to-head column's request returned HTTP 500 (it took 7.2 s for a season; public requests stop at 3 s). On /fpl/line-ups the "Worth reviewing" filter came back empty (1.9 s warm, failing under load); the page swallowed the error. The Football hub's model accuracy took 0.9-2.8 s. League tables took ~1.1 s on every call. Unknown since when: nothing tested the pages as a visitor sees them.
- **Cause:** (1) matches had no index on the two teams and the head-to-head join used `(a,b) or (b,a)`. (2) The worklist read every player's ownership history to keep ~320 rows; the page also passed season 13 literally. (3) Dixon-Coles market probabilities recomputed for every played fixture on each call. (4) league_standings computed all 7,309 team-seasons and filtered afterwards.
- **Fix:** `20261018092000_slow_public_queries.sql` (index + UNION ALL, per-player lookups, memoised immutable markets; each compared row for row with the old definition), `20261018090000_league_standings_cache.sql` (cached tables refreshed within 5 minutes of a change, compared with the live computation), the line-ups page uses the current season.
- **Prevention:** weekly browser smoke and Core Web Vitals test of the live site, and a smoke test of every deploy preview (`smoke/preview` status on the PR); results in `smoke_runs`, checked daily (`smoke_tests_passed`, `smoke_performance_trend`); `league_standings_cache_current`. *Lesson: a page that catches its own error and shows less is a failure nobody reports; test pages in a browser, and fail on any failed request.*

---

## 2026-10-16 · Data-health sweep: tennis stalled, integrity checks blind for 18 days
- **Found:** production health review on 16 Oct. `model_integrity_checks` had not succeeded since 28 Sep.
- **Impact:** (1) No tennis results after 29 Sep (ATP) / 27 Sep (WTA); no `tennis_import` run at all after 5 Oct. (2) On 14 and 15 Oct the football area of the integrity run reported a single line, `check_model_integrity_runs`, which hid two real failures inside it. (3) Ten fixtures (nine League One/Two of 26 Sep and 3 Oct, La Liga Rayo v Athletic of 10 Oct) were PLAYED with no result. (4) Postponed fixture 6186 kept a prediction from fit 966 after fit 1031 was accepted. (5) `fpl_projection_fixture_readiness` reported 320 fixtures missing projections that existed. (6) Two `simulate_fixture_bonus` rows of 6 Oct stayed `running`. (7) 47 UK Watch Guide records unmatched with no explanation.
- **Cause:** (1) tennis-data.co.uk returns 403 to GitHub Actions and Supabase Edge (re-tested 16 Oct), so the import runs only from the PC task, and the importer wrote its run row after downloading, so a task that stopped or failed early left no trace. The 5 Oct 57014 was the old importer calling `tennis_refresh` through the API (8 s limit); already moved to pg_cron that day. (2) The API's 8 s `statement_timeout` (authenticator role) cut off `check_model_integrity` (about 3 s warm, more under load). (3) `refresh_fixture_feeds` set `played` as soon as the kick-off time passed; FixtureDownload keeps a postponed game at its old date. (4) The kick-off guard compared every fit with the original kick-off date of a fixture that had not been played. (5) The view hard-coded the retired `prototype_v3`. (6) The job died while the database was restarting (6 Oct) and could not write its failure. (7) Most are competitions the site has no fixtures for; one was mislabelled.
- **Fix:** migrations `20261016090000`-`20261016095000`: reviewed tennis source errors (`tennis.source_anomalies`, 67 rows kept as published) and data-based freshness `tennis_source_coverage_*`; `production_models` + `fpl_production_model_version()` and a rebuilt readiness view with horizon, partial and stale detection; `reconcile_unreported_played_fixtures()` (postponed only on evidence) and `prediction_fit_eligible()` for postponed fixtures; `job_registry` / `job_health` / `check_job_health()` and per-job stuck thresholds; Watch Guide coverage list, exact-date cross-competition match and `broadcast_unmatched_classified`. `run_integrity_checks.py` runs over the direct connection and keeps error text; `tennis_import.py` writes its run row first and records every exit; NFL projections report practice and game-status rows separately.
- **Prevention:** checks `jobs_failed`, `jobs_stale`, `jobs_stuck`, `jobs_recent_failures`, `jobs_registry_gaps`, `github_workflows_registered`, `github_scheduled_runs_ok`, `fpl_projection_readiness`, `upcoming_predictions_current`, `tennis_source_coverage_atp/wta`, `nfl_injury_feed`, `nfl_results_lag`; regression tests inside the migrations (rolled back) and `src/__tests__/fplModelVersion.test.ts`. *Lessons: a job must log that it started before it touches its source; a check that cannot finish must not stand in for the checks inside it; "kicked off" is not "played".*

---

## 2026-10-12 · X connection could not be saved (safeupdate)
- **Found:** Chris's first Connect @FixtureSharkHQ on /admin/social ended at `?x=save_failed`. The edge logs show the token exchange and the account lookup worked; `rpc/social_x_store_tokens` returned 400.
- **Impact:** The account could not be connected. The settings toggles (kill switch, live publishing), token refresh and disconnect would have failed the same way. Nothing was posted or stored; the callback revoked the tokens it had been given.
- **Cause:** Supabase loads `safeupdate` for API connections (role `authenticator`), which rejects any UPDATE without a WHERE clause. The one-row tables `social_settings` and `social_x_connection` were updated without one. Local tests ran on plain Postgres, without safeupdate, so they passed.
- **Fix:** `20261012230000_social_safeupdate_fix.sql`: the same five functions with `where id` on each update.
- **Prevention:** *Lesson: every UPDATE/DELETE in a function the API calls needs a WHERE, even on a one-row table. Before shipping such functions, check with a script that each UPDATE/DELETE statement has one; the local test database does not enforce it.*

---

## 2026-10-12 · Start chances understated for clubs yet to play; 10th gameweek ahead left stale
- **Found:** researching the João Pedro captaincy reply on 11 Oct: Haaland was 0.78 to start (5 starts of 6) though he had started every match, and GW16's projections were dated 26 Sep.
- **Impact:** (1) From each deadline until a club played, its regulars were counted as fit and not picked for that gameweek, so their start chances, minutes and points were too low and their backups' too high, for up to three days a gameweek (45 regulars at 8 clubs on 11 Oct; 71 players in the 12 Oct match). The unplayed row also took the top weight in the recency weighting. (2) While a gameweek was in play, the projection pipeline's 10-week window started at that gameweek, so the 10th gameweek after the next deadline (the end of Squad Check's horizon) kept rows from an older run until the gameweek finished. On 11 Oct that was GW16, 15 days old.
- **Cause:** (1) FPL creates every player's gameweek row, with 0 minutes, once the deadline passes; `refresh_fpl_start_record` counted every row. The backtests only ever used matches before kick-off, so production and the tested rule differed. (2) `scripts/get_next_matchweek_range.py` took "the first unplayed gameweek + 9".
- **Fix:** `20261012080000_fpl_start_record_played_only.sql`: the start record counts a gameweek only once its fixture has started; model_change_log entry. The pipeline window runs one gameweek further while a gameweek is under way.
- **Prevention:** new integrity check `fpl_projection_horizon_fresh` (warning if any of the 10 gameweeks after the next deadline has no projections from within 36 hours of the newest run). *Lesson: data that exists before an event (FPL's pre-created rows) is not evidence about the event; filter on whether it has happened, as the backtests did.*

---

## 2026-10-12 · AI tools answered "next gameweek" for the gameweek in play; credit balance couldn't be saved
- **Found:** Chris on his phone. (1) Ask FixtureShark run 36, "Best pair of midfielders for £15m next gameweek?", answered for GW6 and said the totals were "summed over the next 6 gameweeks". (2) Saving the Console balance on the new AI credit panel failed with "permission denied for table ai_credit_checks".
- **Impact:** (1) Any "next gameweek" question during a live gameweek was answered for the locked, in-play gameweek (GW6 deadline 10 Oct; GW7 is next), and this answer misdescribed its own figures. The players were right for GW6, but GW6 was the wrong gameweek. (2) The credit estimate couldn't be started.
- **Cause:** (1) The four tools that default a gameweek (`get_fpl_projections`, `compare_fixture_runs`, `best_fpl_combination`, `compare_fpl_players`) used the first gameweek *not finished*, which stays on the in-play gameweek until its last match ends. They also labelled one gameweek as `"gameweeks": "6"`, which reads as a count. I copied both from the 26 Sep tool when writing the ranking tools on 11 Oct. My first fix also failed in the workflow (nothing applied): I tested it locally with function-body checks off, which hid a missing FROM entry. (2) New tables in this project get no privileges for the API roles. `20261012050000` added RLS but no grants, and the page test mocked the API, so nothing exercised the real permissions.
- **Fix:** `20261012060000_ai_credit_grants_next_gameweek.sql`: grants on the two credit tables, plus `ai_next_fpl_gameweek()`, which returns the first gameweek whose deadline is still to come. The four tools now use it, and their labels read `GW7` or `GW7-GW9`.
- **Prevention:** any new table the browser writes to gets explicit grants in the same migration, and I check them with a read of `information_schema.role_table_grants` after it applies. Gameweek defaults use the shared function instead of each tool having its own rule. *Lesson: "next gameweek" means the next deadline, not the next unfinished gameweek. Test during a live gameweek, which is when users ask.*

---

## 2026-10-11 · Double-gameweek players skipped by the 6-hourly FPL live import
- **Found:** scoping FPL Live: `private.refresh_fpl_live_event` only wrote `fpl_player_gameweeks` rows for players with exactly one fixture in the gameweek (`having count(*) = 1`).
- **Impact:** none yet: no 2026/27 gameweek has had a double fixture so far. From the first double gameweek, those players' rows from this job would have been missing, the same class of loss as the September primary-key bug.
- **Cause:** the live feed's aggregate stats can't be split by fixture, so players with two fixtures were left out instead of being split with the per-fixture `explain` breakdown.
- **Fix:** `20261011120000_fpl_live_gameweek.sql`: the job now reads the stored feed (`fpl_live_elements`) and writes one row per fixture for double-gameweek players from `explain` (points, minutes, goals, assists, clean sheets, cards, saves, bonus; BPS, ICT and expected stats are only published per gameweek, so null on those rows). Checked on a local Postgres with a two-fixture player.
- **Prevention:** `check_fpl_history_integrity` still reconciles gameweek rows against season totals. *Lesson: a "one per gameweek" assumption in an import is a bug waiting for the first double gameweek; check the importer before the fixtures arrive.*

---

## 2026-10-11 · AI Lab submit check rejected good answers; grader failed correct composite facts
- **Found:** the check batch for toolset `ai_tools_v2` (batch 2, runs 23-31).
- **Impact:** 32 good submissions rejected (3-5 retries a run), so the batch cost $0.68 instead of about $0.20, and F27 ran out of rounds with no answer. Separately, `facts_grounded` failed 7 of 8 answered runs although every figure was right. AI Lab only.
- **Cause:** (1) my submit check (same day, PR #339) rejected any closing tag in the answer. With the answer now the last field, the model ends it with a harmless `</answer></invoke>` while every field is present; all 32 rejections were exactly that. I had tested the check against the old failure shapes but not against how the reordered tool call would actually come back. (2) `checks_v1` required each fact to appear word for word in the tool results, so composite facts ("Dortmund 4W 0D 0L 12pts") and "Munchen" for "München" failed.
- **Fix:** trailing closing tags are stripped and the answer accepted; markup inside the text or a missing field is still sent back. Grader `checks_v2`: a fact is grounded if verbatim, or if every number in it is a number in the tool results (exact as a number; a percentage matches its fraction) and every capitalised name appears (accents ignored). Tested on tonight's shapes and on fabricated, rounded and unknown-name facts, which still fail.
- **Prevention:** a change to how a model's output is checked gets a 2-3 question live trial before a full batch (the rule adopted for the FPL eval earlier today, which I didn't apply here). *Lesson: test a check against what the new version produces, not only against what the old one got wrong.*

---

## 2026-10-11 · AI Lab: 7 of 22 answers saved without their answer type or facts
- **Found:** reviewing the AI Lab before Ask FixtureShark work. On 26 Sep, 7 of 22 runs were recorded as "ended without submit_answer".
- **Impact:** those 7 runs failed their automatic checks although the answers themselves were written; the 26 Sep pass rate (8/22) understated the model. AI Lab only; nothing public.
- **Cause:** the model did call `submit_answer`, but put tool-call markup inside the long `answer` text (`...</answer><parameter name="answer_type">answered`), so `answer_type` and `facts_used` were swallowed into the answer. The function accepted any submission, so the broken one was saved as final. (I first guessed the 2,000-token cap; the step logs showed otherwise.)
- **Fix:** toolset `ai_tools_v2` in `supabase/functions/ai-lab-run`: `submit_answer` lists `answer_type` and `facts_used` before `answer`; a submission with missing fields or markup in the answer is returned to the model with the reason and it resubmits; `max_tokens` 8,000, and hitting it is recorded as an error.
- **Prevention:** the submission check is tested on the shapes of all 7 failures (`submitProblems`). *Lesson: check a tool's output is well formed before saving it as the answer; a diagnosis from totals ("probably the length cap") needs the step logs before it is acted on.*

---

## 2026-10-11 · FPL eval prompt v2: ambiguous output instructions
- **Found:** reading the v2 trial (`evals/fpl/results/runs/2026-10-11-1234-live-v2`): 4/20, against 15/20 on the checks v1 was held to.
- **Impact:** $0.75 spent on a run whose headline score mostly measured my instructions, not the model. Nothing outside the eval was affected.
- **Cause:** I wrote two new output rules without testing how a model would read them: "over lists every option the claim covers" (read as "the options the winner beat") and "#n = the n-th entry in facts" (read as "the n-th calculation"). The offline reference answers followed my reading, so the self-test couldn't reveal it.
- **Fix:** none applied yet; results and the proposed v3 (no superlatives contract, named fact ids, constants allowed) are in `evals/fpl/results/BASELINE.md` for Chris to approve.
- **Prevention:** before a full live run of a new output contract, run 2-3 cases once (about $0.10) and read the raw JSON. *Lesson: the reference answers prove the checks; only a live answer proves the instructions.*

---

## 2026-10-11 · FPL eval baseline: answer length cap too low, and one check too strict
- **Found:** reading the first live run of the FPL eval pilot (`evals/fpl`, GitHub run 38133579090): 3/10 passed.
- **Impact:** the result understated the model. Six of seven failures were answers cut off at the 1,500-token cap (`finishReason: length`); two of those spent the whole cap thinking and returned nothing. The seventh (T07) was a good answer failed by a check that required one particular source. The quality judge also hit its own 800-token cap on one case and scored "No output" as 0. Cost of the run: $0.18; nothing outside the eval was affected.
- **Cause:** I set `max_tokens` without allowing for the model's thinking, which counts against the same cap, and never tested the cap against the live model before the baseline; the offline reference answers can't be truncated. T07's check named `I.xp.gw8` when the GW8 drop can equally be shown by `I.start.gw8`.
- **Fix:** `max_tokens` 8000 for answers and 4000 for the judge (only tokens used are billed); T07 accepts either GW8 figure (`must_cite_any`); the report now lists truncated answers as their own category ("harness setting, not a model error") and marks them in the case table.
- **Prevention:** truncation can no longer be read as model failure in a report. *Lesson: a length cap on a thinking model caps the thinking too; check `finishReason` before reading a failure as the model's.*

---

## 2026-10-11 · Fixture-list tests failed between midnight and 01:00 UK time
- **Found:** running the test suite at 00:45 BST before a push: 9 tests in three `GameweekBrowser` test files failed; at 19:00 the same day all passed.
- **Impact:** tests only; the site was unaffected. Any push checked between midnight and 01:00 UK summer time would have seen a red suite unrelated to its change.
- **Cause:** the tests built "today" with `toISOString().slice(0, 10)`, which is the UTC date, while the page's `todayIsoDate()` uses the local calendar date. Between midnight and 01:00 BST they are different days, so the "today" fixtures were dated yesterday.
- **Fix:** the three test files now use the local calendar date, the same way the page does.
- **Prevention:** checked under both `TZ=Europe/London` (during the failing hour) and `TZ=UTC`. *Lesson: in tests, build dates the same way the code under test does; `toISOString()` is a UTC date, not today.*

---

## 2026-10-10 · Shark Fantasy: fixture keys unique across all leagues, not within one
- **Found by:** the new test-league check in `scripts/sf/db-check.ts` (a second league in the same database), before any live league played a round.
- **Impact:** none yet. A second league whose round-robin produced a key already used by another league (`s1|r1|c7-c8`) could not have been created, and `sf_commit_round` matched fixtures by key alone, so a round could have been written against another league's fixture (it would have failed on the duplicate result rather than corrupt anything). The `proto` league (created today) happened to share no key with `test`.
- **Cause:** `sf.fixtures.fixture_key` was declared `unique` on its own; the engine's key is only unique within a season.
- **Fix:** migration `20261010210000_shark_fantasy_test_leagues`: unique (season_id, fixture_key), and `sf_commit_round` matches fixtures within its season.
- **Prevention:** the end-to-end check now runs two leagues in one database. *Lesson: a key made by the engine is unique only within the thing the engine was asked to make.*

---

## 2026-10-10 · Tactical roles from Fantasy Football Scout: left and right swapped
- **Reported:** Chris -- "Their images show the goal keeper at the top and left and right the other way around to our images."
- **Impact:** since the 14 Sep seed, all 88 left/right roles still sourced from FFS were mirrored (Gvardiol, Shaw, Robertson and Mykolenko at right-back; Dalot at left-back; Rashford on the right). Pitches drew them on the wrong side, and the depth chart had them competing for the wrong place (a left-back's backup covering the right).
- **Cause:** FFS line-up graphics have the keeper at the top, so screen-left is the team's right; the seed assumed our orientation (keeper at the bottom).
- **Fix:** migration `20261010150000_ffs_roles_mirror_fix` flips L/R on FFS-sourced roles; admin-set roles untouched. The new FFS fetch (`scripts/ffs_team_news.py`) reads starters only, not positions, and says why in its header.
- **Prevention:** any future read of positions from another site's graphic must check its orientation against two known players first (e.g. a known left-back). *Lesson: "left" in a picture is the viewer's left.*

---

## 2026-10-10 · FPL start chance: a backup's run in the side outweighed the first choice's return
- **Reported:** Chris -- Timber (1st choice at right-back, back in the side) projected below Ben White.
- **Impact:** Timber 44% to start v White 53% for GW7. The same pattern applies at every club where a backup started while the first choice was missing and the first choice has since won his place back.
- **Cause:** Timber played no minutes in GW1-3. FPL's data (snapshots from 13 Sep) has him fit then, so those games counted in full as "fit and not picked" and wore his first-choice floor down; his half-time return in GW4 and start in GW5 (White unused) counted no more than August.
- **Fix:** migration `20261010090000_fpl_start_record_recency`: the depth chart's start record weights each earlier match 0.5^(matches since / 3). Registered backtest (`scripts/backtest_depth_recency.py`, GW3-5): Brier 0.07830 -> 0.07624, log loss 0.27018 -> 0.26363.
- **Prevention:** model changes to start chances are judged by a backtest registered before scoring. *Open:* availability before 13 Sep is inferred from one snapshot, so a summer injury that cleared before then is invisible; recency weighting limits how long that matters.

---

## 2026-10-10 · Pitches: players drawn where they don't play; tied backups shown as starters
- **Reported:** Chris -- Starting Lineups showed Zubimendi at centre-back; Match Projections showed Zubimendi starting beside Rice although Lewis-Skelly is far likelier to. "Inaccurate information here damages the site."
- **Impact:** both pitches drew exactly one player per slot. On Starting Lineups' 2nd-choice view Arsenal had more midfielders than midfield slots, so the extra one was put in an empty defensive slot. On Match Projections the second DM slot went to whichever of three tied 2nd-choice midfielders came first, each at 43%, with nothing showing that the place was shared.
- **Cause:** (1) the pitch had no way to show competition for a place, so a fit-scoring rule placed surplus players in the nearest empty slot, two tactical groups away if need be; (2) the depth chart split a tied rank equally whatever each player's record.
- **Fix:** both pitches now show the likeliest starter in each slot with everyone competing for that place stacked under him, start chance on each. A player only covers a slot that is his job or an agreed cover (a third centre-back at right-back; never a holding midfielder at full-back); anyone else is listed under the pitch. Starting Lineups opens on the next gameweek's projections, with the 1st/2nd/3rd views kept. Tied ranks now share places by start rate (registered backtest, GW3-5: better on Brier and log loss; Lewis-Skelly ~63%, Zubimendi ~14%).
- **Prevention:** tests in `src/__tests__/FormationPitch.stacked.test.ts` (no midfielder in the back line; ties stack; unconfirmed roles listed, not placed) and `scripts/test_fpl_depth_chart.py`. *Lesson: a display that must show one answer will make one up; show the uncertainty the model actually has.*

---

## 2026-10-09 · FPL Fixture Heat Map used a different goals model from the player projections
- **Reported:** an outside analysis summed `leaguewide_v6` player xG for GW6–10 and found Spurs 3rd of mid-table attacks (7.59), while the Fixture Heat Map ranked Spurs last.
- **Impact:** the heat map (and its home-page trivia question) showed Dixon-Coles team goals while every other FPL page used market-rated goals. Over GW6–10 the two differed by up to 2.9 goals per team (Arsenal 7.66 v 10.57; Spurs 5.31 v 7.59, 20th v 6th over GW6–15); Dixon-Coles also ran about 4% lower overall. The Player Projections team panel showed Dixon-Coles too, beside players whose numbers came from the market. The heat map's "Simple FDR" was FixtureShark's own quintile of Dixon-Coles ratings, not FPL's FDR. No figure was wrong for its model; the pages disagreed about which model they showed.
- **Cause:** PR #146 moved the FPL projections to `COALESCE(market, model)` goals and the FPL fixture header followed, but `getFantasyFixtureDifficulty()` and `getTeamFixtureGoals()` still read `predicted_*_goals` directly.
- **Fix:** both read market goals when the fixture is priced, else Dixon-Coles, and keep Dixon-Coles beside them. The heat map offers Expected goals (default), Dixon-Coles and FPL FDR (FPL's own ratings), marks with * any fixture where the two models differ by more than 20%, and says which model it is showing. Every read of `fpl_player_projections` that lacked it now filters `scenario_key = 'baseline'` as well as `model_version` (harmless today, only baseline rows exist; would have double-counted a second scenario).
- **Prevention:** tests pin the market-else-model rule, the Dixon-Coles view, the disagreement marker and the scenario filter. Checked live: summed player xG equals market team goals for all 20 teams. *Lesson: when a model input changes, search for every page that reads the old column, not just the views that feed the model.*

---

## 2026-10-09 · FPL start chance: seeded first choices held at 85% with no evidence
- **Reported:** found while validating projections for the captaincy article (8 Oct).
- **Impact:** 20 outfield players with under 200 minutes this season had start chances of 0.68-0.90, mostly a flat 0.85: Doku (15 minutes), Bard (18), Sakamoto (31, 0 starts from 5 available), Flemming (60, 0 from 3), Šeško (76, 0 from 5). Their expected minutes and points were too high, and the players actually starting in their place (Ndiaye, Emersonn) too low. The chances were labelled `nailed_history`, which they were not. It did not change any squad in the captaincy article (checked by re-solving without them).
- **Cause:** the pecking orders were seeded on 14 Sep from Fantasy Football Scout's pre-season line-ups and are mostly not maintained. `fpl_depth_chart.py` gave every first choice max(start rate, 0.85), so a seeded rank outweighed any number of matches fit and not picked. `fpl_fallback_start_probability_v6` labelled any pecking-order chance of 0.80+ `nailed_history`. The 6 Oct entry flagged the 85% as judgement to be checked against starts; it had not been.
- **Fix:** a first choice's chance is max(start rate, (starts + 0.85 x 3) / (available matches + 3)), capped at 0.97: the seeded rank counts as three matches of evidence, and a regular back from injury (no available matches) keeps the full floor. Rule fixed before scoring; point-in-time backtest on GW3-5 (`scripts/backtest_depth_floor.py`, 1,761 player-matches): Brier 0.0841 -> 0.0784, log loss 0.2853 -> 0.2705, better in every gameweek. Labels now `depth_chart_firm` / `likely` / `backup` with the same line-up confidence. Migration `20261009030000_fpl_depth_evidence`; model_change_log entry.
- **Prevention:** tests in `scripts/test_fpl_depth_chart.py` (returning regular keeps the floor; fit-and-unpicked wears down; regular starter unchanged). The backtest can be re-run from the Model Lab workflow (`backtest_depth_floor`) as more gameweeks are played. *Lesson: a hand-seeded input needs a route for evidence to overrule it, and a label must say where a number came from, not what we hope it means.*

---

## 2026-10-07 · Indexing audit: canonical conflicts, noindexed champions, orphaned player pages
- **Reported:** Chris's Search Console review (1.22k indexed, 6.3k not indexed); found by a full crawl of the live site (every sitemap URL and link target, 24,695 URLs) plus a rendered sample.
- **Impact:** (1) /fpl was in the sitemap with a self-canonical, but in the browser it redirected to /fpl/gameweek/N, so the rendered page named a weekly-moving URL canonical. (2) Federer, Nadal, Murray, Serena Williams, Sharapova and ~800 other champions or long-career players were noindex, because the rule was "50+ matches in the last three seasons". (3) 238 ATP/WTA Grand Slam edition pages shared titles (and ~330 pages H1s) with their other-tour twin. (4) The 667 FPL player pages and 1,431 Player Scout pages had no link in any server HTML: the career link waited for a browser fetch. (5) Client-rendered pages answered 200 to trailing-slash and upper-case spellings. (6) 46 player pages linked tennis pairs in reverse order; ~680 links from static pages pointed at filter views whose canonical is a different-content page.
- **Cause:** each rule was right for the page it was written for and never checked against the whole URL set: the /fpl redirect predates the sitemap; the tennis threshold was chosen for active players; titles were written per edition without the tour; the app-shell fallback says 200 to any path.
- **Fix:** /fpl shows the current gameweek in place with /fpl as canonical; `isIndexedPlayer` (active, any title, or 200+ matches) drives the page, static build and sitemap; edition titles and H1s carry the tour; FPL player pages link career and club in server HTML and club pages list their FPL players; `CanonicalPathRedirect` normalises client-rendered paths; pair links use `tennisH2HCanonicalPath`; filter-view links are rel="nofollow".
- **Prevention:** `scripts/check-indexability.mjs` checks every sitemap URL on every build (canonical, noindex, robots, URL shape, duplicate titles; /build-report.txt); `src/__tests__/indexability.test.tsx` pins the rules, robots blocks and link forms; `site-health.yml` now checks sampled canonicals, host/case/slash variants and robots blocks on the live site. *Lesson: an SEO rule has to be checked against every URL family, rendered as Google renders it, not only the page it was written for.*

---

## 2026-10-06 · FPL projections pipeline: runs hung with nothing running
- **Reported:** found while checking the pecking-order change (#240).
- **Impact:** three pipeline runs on 6 Oct didn't finish: one failed in the bonus simulation on a single API read (non-JSON gateway error, twice), and two hung in the projection step for 25+ minutes with no query running in the database. Projections from the first pass were written, so the site kept current numbers, but bonus pass 2 and the final-table simulation didn't run.
- **Cause:** the database was under heavy load that morning (API 500/520/521s and statement timeouts across unrelated pages from 07:35 UTC). The bonus simulation read through the API (8-second limit, no retry). The direct connections had no client-side timeout, so a connection the pooler dropped mid-query left the script waiting forever.
- **Fix:** the bonus simulation reads over the direct connection with retries (#244). The database restarted five times between 5 Oct 17:07 and 6 Oct 08:46 ("database system was interrupted" in its log); a query in flight then never answers while the pooler stays up, so TCP keepalives (#245) were not enough. `scripts/db_direct.py` gives every direct query a 3-minute client-side limit and reconnects for the retry. The projection script reconnects after the pecking-order write, and each long pipeline step has its own time limit (30/20/30 minutes).
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
- **Prevention:** a source that returns nothing is a warning in pipeline_runs and in the daily checks, not a success.
- **Follow-up (6 Oct, evening):** the ratings are now read from clubelo.com/Ranking, whose page carries the full world ranking (1,698 clubs, 91 countries) as table data; one request a day, credited on the pages. Dry run: 5,478 of 10,062 squad players' clubs rated. The old API stays as a fallback. League level is stored empty (the page doesn't give it reliably; nothing displays it).

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

## 2026-10-26 · PR #478 merged with the "checks" unit-test job red

- **What happened:** Claude's merge script waited for the Netlify previews,
  smoke test and the `checks` job, but on timing out it fell through to the
  merge call instead of stopping. The `checks` job had failed (Unit tests),
  so #478 (Real Madrid private fill, impairment labels) merged with a red check.
- **Impact:** none found. The same commit's job passed on re-run (flaky), the
  full suite (1,364 tests) passes locally on main, and the migration only
  added private (unpublished) rows.
- **Fix:** re-ran the failed job: green on attempt 2.
- **Prevention:** merge only inside the success branch of the wait; a
  timeout or any failed check (status or check-run) exits without merging.
  *Lesson: "wait then act" scripts must make the action conditional on the
  wait's result, not on the wait finishing.*

## 2026-10-28 · Intermittent "Unit tests" failures in PR checks (#478, #483)

- **What happened:** the same test failed twice in CI and passed on re-run
  and locally: `OptimalSquadPage` "Next 10 GWs preset requests a 10-week
  range". Found via the check-run annotations (Vitest's GitHub reporter),
  since job logs are not readable from work sessions.
- **Cause:** a race in the test, not the page. The range filter applies a
  preset only once the default and in-play gameweeks have both loaded; the
  test clicked "Next 10 GWs" and then "Build" as soon as the buttons
  rendered, so on a slow runner Build sent the initial 5-5 range. Mock call
  history also accumulated across tests, which made the failure misleading
  (and could let a broken assertion pass on an earlier test's call).
- **Fix:** wait until "To GW" reads 14 before clicking Build; clear mock
  calls before each test in the file.
- **Prevention:** when a CI-only failure appears, read the annotations
  (`gh api repos/.../check-runs/<job id>/annotations`) before re-running.
