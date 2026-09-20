# Outstanding work

Running record of known gaps, deferred decisions and things that need a
human. Kept in the repo rather than in a chat history so it survives the
conversation it came from.

Ordered roughly by value, not by effort.

---

## Needs you

### FPL rollover: three tables still have single-column keys
fpl_teams, fpl_gameweeks and fpl_fixtures conflict on fpl_team_id /
fpl_event_id / fpl_fixture_id alone. At the 2027/28 rollover, FPL reuses
those ids, so refresh_fpl's upserts will DO UPDATE this season's rows IN
PLACE — the exact corruption already fixed for fpl_players.

Found while reading refresh_fpl in full for the consolidation job. Zero
impact today; catastrophic at pre-season. Needs composite
(id, season_id) keys, with the same backup-first, FK-aware approach used
for fpl_players. Must happen before August 2027.



### Drop the pre-key-change backups when ready
backup_fpl_players_20260919, backup_fpl_player_snapshots_20260919,
backup_fpl_player_gameweeks_20260919,
backup_player_availability_events_20260919 — 16MB total, RLS on, no
grants.

refresh_fpl() has run successfully against the new composite key, but
only manually. Worth leaving until the SCHEDULED runs have gone through
unattended for a few days, then drop.
 (blocked on a manual step)

### Netlify build hook — DONE
Verified end to end: an FPL pipeline run produced a Netlify deploy
titled "Deploy triggered by hook: Data pipeline refresh", on the same
commit (so a data rebuild, not a code change), regenerating exactly the
658 player pages and nothing else — match and team pages were untouched
because that pipeline doesn't affect them.

Prerendered pages now track the twice-daily FPL refresh and the 6am
daily-import, so the freshness timestamps they publish stay honest.

### Login — ROOT CAUSE FOUND AND FIXED
From the auth logs, not from guessing:

  "error finding user: sql: Scan error on column index 3, name
   confirmation_token: converting NULL to string is unsupported"

GoTrue's Go driver scans auth.users token columns into NON-NULLABLE
strings. Four of them were NULL, so EVERY user lookup 500'd before any
password was examined. That is why the account looked perfect in SQL,
why the password verified against the hash, and why last_sign_in_at
stayed NULL — sign-in never reached the credentials.

NULLs there are the signature of a user row created by direct INSERT
rather than through the auth API. Fixed by setting all eight token
columns to ''. Now covered by get_data_integrity_report() as "auth token
columns", so it can never hide silently again.

Two client bugs fixed alongside, both real and both independently
blocking: persistSession was false (a successful sign-in would not have
survived the next render) and detectSessionInUrl was off (magic-link
callbacks unreadable).

  /login · sharkey1982@hotmail.com · Shark-2026-Login!

Change it once in. Magic links additionally need SMTP — see below.

### (superseded) Login still not working
Account is confirmed, is_admin true, password set, but last_sign_in_at
remains NULL. Making the /login route findable (AdminGateNotice button)
did not fix it, so the problem is in the sign-in itself, not the route.

Blocks every admin feature: tactical roles, team-strength overrides, the
workflow triggers. Needs a real debugging session -- check the browser
console on submit, and whether signInWithPassword returns an error that
the page swallows.

### Change the admin password
The initial password was set directly in the database and shared in
plain text in chat. Treat it as compromised. There's a change-password
form on `/login` once signed in.

### Supabase email (SMTP)
Magic-link sign-in and password resets depend on outbound email, and
Supabase's default SMTP is heavily rate-limited (Hotmail also junks it).
Resend is already connected to the account; wiring it in as Supabase's
custom SMTP is the durable fix. Password sign-in works meanwhile.

---

## Known gaps

### Tactical Roles page — five refinements (GK noise already fixed) — DONE
DONE: goalkeepers no longer appear in the worklist. It listed everyone
whose role came from the positional fallback, which is a real gap for a
defender or midfielder but the CORRECT answer for a keeper — the
position IS the role. 410 rows became 362; 48 items of pure noise gone
from a list whose whole value is showing what needs attention.

1. DONE — save confirmation. Per-row "\u2713 saved" tick (self-clears
   after 4s) plus a page-level amber "Not live yet" banner counting
   unapplied edits, linking to Team Strength Admin to run the refresh.
   Was previously untested by hand only; now covered
   (TacticalRolesAdminPage.test.tsx). Worth knowing for future tests
   here: the tick only shows in "Everyone" scope, because saving flips
   source_name to 'manual', which removes the row from the default
   "Needs Review" list the instant it saves — hiding the very
   confirmation you're trying to observe.

2. DONE (same commit as #1) — the "Not live yet" banner names the job
   and links straight to it.

3. DONE — the by-team needs-review list is collapsible per team, plus a
   page-level Collapse all / Expand all. Defaults to expanded (matching
   prior behaviour, and so a row jumped to from the worklist is never
   hidden behind a closed team).

4. DONE, same feature as #3 — collapsing is per-team in that same list.

5. DONE — "Worth reviewing first" worklist now has its own team filter
   (separate from the by-team editor's existing team filter).

Shipped in commit 83d8bba. 209 -> 212 tests, tsc clean, build clean.

### Managers' Dugout — formation contribution matrix
Wanted: positions down the first column, the top 3-4 formations across
as columns, and filterable cells showing goals / assists / goals+assists
share for each position-formation pair. Colour-scaled so the highest
percentages read green at a glance.

The data exists: opta_slot_breakdown holds goals and assists by slot and
type, and formation_slot_geometry maps slots to formations. The pieces
are there; this is a presentation build.

Do it alongside the two other Dugout items already recorded (stale
caveat in "about this data", and slot labels that still read "Slot 9"
rather than a role name) -- naming the positions properly is a
prerequisite for this table making sense as rows.

### Remaining admin/job-button cleanup
Done: Admin menu hidden from non-admins, "Adjust Team Ratings" renamed
"Team Strength Admin", footer Data Health link removed, Team Strength
workflow buttons already moved behind the admin gate.

SWEEP DONE: grepped every page (refresh/trigger/run job/rebuild/recompute,
plus supabase.rpc/invoke calls) for backend-job-trigger buttons. The only
three that exist anywhere in the app are in TeamStrengthPage.tsx (refresh
FPL projections, re-run position sim, re-run bonus sim) — already
admin-gated from the prior session. Nothing else needs moving.

Still to do:
  - consider a single "Run jobs" admin page rather than the three buttons
    living inside TeamStrengthPage (which is otherwise a team-ratings
    page, not a jobs page). This is a genuine new feature/refactor, not
    a move — deliberately not started this session so it could be done
    and verified properly rather than half-finished. If built, also
    repoint the Tactical Roles "Not live yet" banner link from
    /admin/team-ratings to the new page.
  - Source Data reported missing. The route and the nav entry both exist
    (/source-data, in the Admin menu) — most likely it was invisible
    because the Admin menu showed for everyone and is now gated, or the
    page itself errors. Check while signed in before assuming it's gone.

### Managers' Dugout — stale caveat and unnamed slots
The "about this data" section carries a caveat that is now out of date.
Slots are also still labelled by NUMBER ("Slot 9"); they should read as
roles, in line with the tactical-roles vocabulary used elsewhere.

### Creating a function opens a door — check the grant every time
Bitten TWICE now by the same Postgres default: CREATE FUNCTION grants
EXECUTE to PUBLIC unless revoked.

The second time was worse. public.refresh_fpl, created as a wrapper
while fixing the pipeline outage, was SECURITY DEFINER owned by postgres
and anon-callable -- so any anonymous visitor could have triggered a full
FPL ingestion, hammering the FPL API and writing thousands of rows, as
often as they liked. refresh_fpl_projections_range was the same.

Both revoked. The rule: any new function that WRITES or is SECURITY
DEFINER needs an explicit revoke from public/anon in the SAME migration
that creates it.

Verified end state: the only SECURITY DEFINER functions anon can call
are get_data_integrity_report, get_public_read_audit and is_admin -- all
read-only by design.

### 1X2 not visible — needs revisiting
Added to the `projections` variant of GameweekBrowser, which renders at
/football/projections ONLY. The same component at /fixtures uses the
other variant and shows no model output at all, by design.

So if it isn't showing, check which of those two pages is being looked
at before assuming the code is wrong. If it IS missing on
/football/projections, the likely cause is `rhoFor` returning null for
those fixtures -- the markets only render when a rho is resolvable, and
they fall back to "xG est." when it isn't.

Also still missing entirely: 1X2 on the fixture LIST rows outside
projections mode, and anywhere in Football > Discover.

### Renames
  - "What's Changed" (/fpl/whats-changed) -> Newsroom
  - "The Trading Floor" (/fpl/price-risk) -> "Trading Floor", or
    "Bullpit"? Chris undecided. Worth noting the page is about price-rise
    RISK, so a name suggesting pressure/heat fits better than one
    suggesting trading activity.
Both are label-only changes in journey.ts plus routeMeta titles; the
routes themselves should NOT change, since /fpl/whats-changed is already
in the sitemap and prerendered.

### PlayerScoutPage still carries dead slug-handling code
/fpl/player-scout/:slug now renders PlayerRecordPage, so the slug branch
inside PlayerScoutPage (useParams, getPlayerBySlug, the `selected` state
and its career/breakdown rendering) is unreachable.

Harmless but untidy, and its tests exercise a path users can't take.
Strip it when next in that file -- attempted here and reverted rather
than risk a half-applied edit.

### Bullpit — FIXED (filters were inert by construction)
The band filter couldn't change anything. The tables show the top 15 by
pressure, and 31 risers / 36 fallers already sit in the high band — so
the top 15 were ALWAYS high whatever was selected. Correct logic,
useless outcome.

Replaced with a direction filter (Both / Rising / Falling), which does
narrow the view and matters most on a phone where two 15-row tables is a
lot of scrolling.

Colour: rise and fall now have tinted panels, coloured headings and
arrows, rather than the direction being carried by one number's text
colour.

### (superseded) Trading Floor — filters do nothing, and rise/fall colours unclear
Two separate problems on /fpl/price-risk:
  1. The filter controls have no effect on the table. Either they're not
     wired to the query/derived state at all, or they are and the
     predicate is wrong -- needs checking, not guessing.
  2. Rising and falling price risk aren't visually distinct enough. A
     price rise and a price fall are opposite events and should not be
     read from the number alone.

### Model accuracy — FIRST RESULTS, and they are not flattering
get_model_accuracy(), get_model_accuracy_summary() and
get_model_calibration() now score every fixture whose prediction was
frozen before kickoff. 166 fixtures, four divisions, 15 Aug - 18 Sep.

HEADLINE (verified twice, see below):
  hit rate            41.0%
  always pick home    41.6%   <- the model does NOT beat this
  Brier               0.6614
  uniform baseline    0.6667  <- barely better than 33/33/33
  mean prob. assigned to what actually happened: 35.6%

BUT argmax accuracy is the wrong lens. The model picks DRAW as most
likely only 10 times in 166, while draws occur 53 times -- not because
it thinks draws are rare, but because a draw is rarely the single
highest cell even at a well-judged 27%. Hit rate cannot see that.

CALIBRATION IS THE FAIR TEST, and it looks much better where the
forecasts actually live:
  20-30%  170 forecasts  predicted 25.4  actual 25.3  gap -0.1
  30-40%  173 forecasts  predicted 34.3  actual 33.5  gap -0.8
  40-50%   70 forecasts  predicted 44.2  actual 48.6  gap +4.4
343 of 498 forecasts sit in the two middle bands and are near-perfectly
calibrated. The tails are poor (60+%: says 67, happens 50) but rest on
14 forecasts, which is far too few to conclude anything.

SO THE HONEST SUMMARY: well calibrated in the range where most of its
forecasts fall; overconfident at the extremes on a sample too small to
judge; and it does not beat home-advantage as a pick-the-winner
heuristic. All of that should be stated plainly on the page rather than
led with a hit rate.

This is also the strongest argument yet for the walk-forward backtest:
166 fixtures over five weeks cannot settle any of it.

### TWO different accuracy questions — don't conflate them
Clarified by Chris, and worth keeping separate because one is cheap and
one is a real modelling job.

(a) LIVE ACCURACY — how the model has done on predictions it actually
    made. Uses stored lambda + rho on the 168 fixtures that have them.
    No refit. Cheap. Honest but a SMALL sample, and only covers the
    period since freeze-on-kickoff.

(b) WALK-FORWARD BACKTEST — what Chris actually asked for. Refit the
    model at each historical point using ONLY data available then,
    project the next period, score it, roll forward. Produces a large,
    genuinely out-of-sample accuracy record across seasons and
    divisions.
    This is a modelling exercise: it needs the Python fitter run
    repeatedly over historical windows, with strict care that no future
    result leaks into a fit. It is NOT derivable from stored rows.

(a) is a quick win and should ship first -- it makes the Predict section
honest immediately. (b) is the real answer and should follow, with its
own session. Neither replaces the other: (a) is "did our live
predictions work", (b) is "does the method work".

### Model accuracy + model-vs-odds — MUCH smaller than assumed
Investigated rather than estimated, because the assumption was that
adding 1X2/over-under to fixture projections needs a retrofit.

It doesn't need a model re-run at all. Nothing stores probabilities --
only expected goals (predicted_home_goals/away_goals) and
prediction_fit_run_id, which resolves to that fit's rho. 1X2, over/under
and BTTS are a pure FUNCTION of those three numbers, computed today
client-side by derivedMarkets(). The same maths runs in SQL over stored
rows.

Measured:
  346 played fixtures
  168 have lambda AND rho stored -- fully derivable, retroactively
  178 have no prediction at all (predate the freeze-on-kickoff work,
      genuinely unrecoverable without refitting)

And the odds join works: those 168 fixtures carry 3,362 bookmaker odds
rows, via fixtures -> matches (league, season, teams, date) -> match_odds.

So BOTH of these are achievable from data already held:
  - model accuracy (predicted 1X2 vs actual result) on 168 fixtures
  - model vs market (model probability vs implied probability, after
    removing overround) on the same set

No refit, no re-run, no new ingestion. The only real decision is whether
the derived markets are STORED on fixtures (fast, but needs
recomputation whenever a fit changes) or exposed as a FUNCTION over
lambda+rho (always consistent, slightly slower). Function is probably
right: it can never drift from the fit that produced it.

### Football Discover — win % and over/under goals never added
Discussed but never built. The model side has this: derivedMarkets() in
matchPageApi turns a Dixon-Coles score grid into over/under 2.5 and BTTS
probabilities, and Results Projections (Football > Predict) shows them.

Discover has no equivalent for what ACTUALLY happened. There's no
historical over-2.5 rate, BTTS rate or home/draw/away split anywhere —
by league, by season, by club, or head-to-head.

Worth having because it's the natural counterpart to the projections,
and the archive already holds ~31,000 matches across five divisions and
a decade, so the answers are a GROUP BY away. It would also give the
market-efficiency page something to sit beside: overround by division is
already there, and actual outcome rates would make it readable.

Scope to decide: which cuts matter (league/season certainly; club and
head-to-head probably), and whether it's a page of its own or folded
into League Insights.

### Set-and-Forget XI — ROLLING view DONE, model view BLOCKED
(1) Rolling 2026/27 XI: built. Best eleven on today's actuals at August
prices, solved on read since the answer moves every gameweek.

(2) Model view at start of season: NOT POSSIBLE for 2026/27. The
earliest stored projection is 2026-09-14, three weeks after gameweek 1.
Nothing was captured pre-season, so there is no August model view to
recover.

TO MAKE IT POSSIBLE FROM 2027/28: generate and freeze player projections
BEFORE gameweek 1, then store that XI. It's the same shape as the
existing stored season_best_xi rows. Worth a calendar note for
pre-season, because the window closes the moment the season starts.

### (superseded) Set-and-Forget XI — 2026/27 needs TWO views, not one
Currently only the hindsight XI exists, and only for completed seasons.
2026/27 should carry two distinct things, because they answer different
questions and must not be conflated:

  1. MODEL VIEW AT START OF SEASON — the XI the model would have picked
     in August from its own projections, with no knowledge of what
     followed. This is a real accuracy record: it can be scored against
     what actually happened, and it accumulates rather than needing a
     backfill.

  2. ROLLING 2026/27 TEAM — the best XI available on today's actuals,
     updated as the season runs. Hindsight, but live.

These are genuinely different techniques, not two renderings of one
thing. The existing page solves neither: it solves completed-season
hindsight at August prices. Note the model view needs projections that
existed BEFORE the season — check what's actually stored, since
pre-kickoff projections currently only go back to gameweek 5.

### Optimiser — forced picks BUILT; two cheap guards still worth adding
Working, with a self-check that reports whether the solver honoured the
constraints (the edge function's source isn't in this repo, so that was
otherwise unverifiable).

Not yet done, and low-risk either way:
  - cap forced-in at 15 (a squad can't hold more)
  - validate position and 3-per-club limits client-side, so an
    impossible request never reaches the solver
Forcing picks does NOT increase solve cost -- each forced player removes
a slot to search -- so this adds no new abuse surface. The pre-existing
one (unlimited anonymous solves, no rate limiting) is unchanged and is
still the thing to settle before the page goes public.

### (superseded) Optimiser — include/exclude: SPEC

FINDING THAT CHANGES THE JOB: this is mostly not a solver problem.
optimizeFplSquad() in fplOptimizerApi.ts ALREADY takes mustIncludeIds
and mustExcludeIds and forwards them to the fpl-optimize-squad edge
function as must_include_ids / must_exclude_ids. No UI has ever passed
them, so the capability exists and is unreachable.

STEP 0 — VERIFY THE EDGE FUNCTION HONOURS THEM. Its source is NOT in
this repo (deployed separately), so this is an assumption until tested.
Call optimizeFplSquad with a forced-in cheap player and confirm he
appears; call it with the top scorer excluded and confirm he doesn't.
If the edge function ignores the fields, everything below still holds
but the work moves there first. Do NOT build UI on an untested
contract.

STEP 1 — UI ON THE OPTIMISER PAGE
  - a player picker per list (include / exclude), searching the same
    candidate pool the solve uses, so a chosen player is guaranteed to
    be solvable
  - show forced players as chips with a remove control
  - live budget feedback: forced-in players consume budget and squad
    slots before optimisation, so the page should say how much is left
    and how many slots remain
  - validation the SOLVE can't do gracefully: more than 3 from one club
    forced in, more than 2 GK, a forced set that already exceeds budget.
    Catch these in the UI with a clear message rather than letting the
    solve fail.

STEP 2 — EDGE CASES worth deciding before building
  - forced-in player with zero projected minutes: allow (a user may know
    something the model doesn't) but warn
  - forced-in AND forced-out: UI should make this impossible
  - a forced set with no feasible completion: the solve must return a
    clear "no legal squad" rather than a partial one. Same failure mode
    as the rolling XI solver, which returns null rather than an illegal
    side.

STEP 3 — ADMIN SCENARIOS (the separate item below) builds on this:
once include/exclude works, a stored scenario is just a named
(include, exclude, range) triple plus its solved output.

RATE LIMITING: see the end-user-facing item below. Include/exclude makes
the page far more inviting to hammer, and each solve is real work. That
question should be answered BEFORE this ships publicly, not after.

### Optimiser — admin scenario runs, stored alongside the default
Rather than exposing include/exclude to everyone, let the ADMIN run
named scenarios ("without Haaland", "Salah forced in") and store each
output next to the default optimiser result.

This is the better first move for three reasons. It answers the
end-user question by deferring it — no anonymous visitor triggers a
solve. It makes scenarios comparable over time instead of vanishing
when the page reloads. And a stored scenario is publishable: the
interesting part isn't the optimiser, it's "here's what the model says
if you refuse to own the most-owned player in the game".

Needs: a table keyed on (season, gameweek range, scenario name) holding
the forced-in/out sets and the resulting squad, plus an admin UI to
define and run one. The solve itself already exists.

### Optimiser — Chief Scout as a stored rival to the model
The Chief Scout foundation already exists: fixtures carry
raw_predicted_* (model prediction WITHOUT overrides) alongside the
adjusted values, and get_scout_vs_model() scores both on played
fixtures. It has never had anything to score because raw predictions
only exist going forward.

Extend the same idea to squads: a Chief Scout account whose picks are
STORED as a rival to the optimiser, scored the same way. That gives the
human-versus-model comparison a second front, and unlike match
predictions it produces a weekly number people care about.

Depends on the scenario storage above — a Chief Scout squad is the same
shape as a stored scenario, just authored rather than solved.

### Optimiser — is it safe to make end-user facing?
Open question Chris raised, and worth answering BEFORE building
include/exclude, since that makes the page far more inviting to hammer.

What needs establishing:
  - how expensive is a solve, and is it done in Postgres or the client?
    (get_fpl_optimizer_* functions are anon-executable today)
  - does an unauthenticated user get unlimited solves? There is no rate
    limiting anywhere in this app.
  - does include/exclude widen the search space enough to change the
    cost profile?
  - if limits are needed, what form: per-session, per-IP, or gated
    behind the eventual account layer?

This is the first feature where a visitor can make the database do real
work on demand. Everything else is a read of precomputed data.

### Set-piece corners — RESOLVED (sides now derived from taker order)
The source never distinguished sides: it gave one ordered list of corner
takers per club and the importer wrote it to BOTH corner_left and
corner_right, so all 81 rows were duplicated.

Now dealt alternately — odd positions left, even right, rank =
ceil(position/2). So takers 1 and 2 are joint first choice (one a side),
3 and 4 second, and so on. Arsenal reads Rice (left #1) and Saka (right
#1) rather than both players listed twice.

81 rows preserved (46 left, 35 right), every club still has a first
choice on each side, zero duplication remains.

WHICH player takes WHICH side is an ASSUMPTION — the data can't say.
It's a better assumption than claiming both sides share an identical
pecking order, which is what the duplicates asserted. The page states
this plainly rather than implying the sides are observed.

### landingApi top-FPL-pick trivia — FIXED (was silently broken)
Confirmed live: the card was missing from the site.

`getTopFplPicks()` embedded fpl_players inside a select on
fpl_player_projections, but that table has ZERO foreign keys and
PostgREST requires a declared FK to embed. The query failed every time.

It failed SILENTLY because getLandingTrivia wraps each fact in
safely() — so one of five landing facts and one of three FPL facts had
never once rendered, with no error anywhere.

Fixed by splitting into three plain queries joined in JS (projections →
players → teams), matching how the rest of the codebase works. Chose
this over adding a foreign key because the join is COMPOSITE
(fpl_player_id, season_id) and a schema change wasn't needed to make it
work.

Verified against real data: returns Barry, Haaland, Wissa and
Calvert-Lewin for GW5 with correct team names. Regression-tested, with
one test asserting the select string never contains an `fpl_players(`
embed again.

NOTE FOR ELSEWHERE: any other PostgREST embed involving
fpl_player_projections has the same problem. Worth a grep if more
appear.

### FPL projection history — RESOLVED (freeze-on-kickoff)
Projections are no longer overwritten once a fixture is played, so the
stored row stays a genuine pre-kickoff forecast — mirroring
`backfill_fixture_predictions()`, which has always worked this way on
the football side.

Chosen over a history table deliberately: capturing every refresh would
mean ~7,200 rows x 3 runs a day (~7.9M/year) to keep intermediate values
nobody asked for. "What did we predict before kickoff, and what
happened?" needs exactly one frozen row per player-fixture.

Remaining caveat: the 838 projections that already existed for played
fixtures were written under the old behaviour, so some may already be
hindsight-tainted. They're frozen now, but the pre-existing ones can't
be certified as pre-kickoff. Accuracy reporting should either start from
now, or treat pre-existing rows as unverified.

### TeamExplorer has dead slug-handling code
`/football/teams/:slug` now renders the new TeamPage, so TeamExplorer's
own slug resolution is unreachable — nothing routes a slug to it any
more. Three tests still cover that behaviour and still pass, because
they render TeamExplorer directly rather than through the app's routes.

Harmless but misleading: tested code that can't run. Either remove the
slug handling and its tests, or give TeamExplorer a reason to accept one.

### Query-string URLs aren't canonical
`/fixtures?view=team&team=1&season=13` and
`/preview?league=1&home=1&away=48&season=13` key on numeric team IDs.
They're opaque to a reader, meaningless to a crawler, and fragile —
nothing guarantees `team=1` stays Arsenal across a reimport.

`/football/matches/{slug}` already exists and is prerendered. Nothing
redirects the old form to it, and Match Preview has no canonical route.

### Player slugs use full legal names
`bruno-guimaraes-rodriguez-moura`, `gabriel-dos-santos-magalhaes`.
Unambiguous, but nobody searches these. `web_name` is closer to search
intent but collides more and contains punctuation. Low priority —
revisit if search data shows it mattering.

### NULL season_id — FIXED (was bigger than recorded)
Recorded as one player (Mason Miley) being invisible on FPL pages. It
was actually systematic: refresh_fpl()'s inserts into fpl_players and
fpl_player_snapshots omit season_id entirely, so EVERY row added after
the initial load was NULL — 3,956 of 4,614 snapshots (86%), 663 gameweek
rows, and 4 players.

Those rows were invisible to every season-filtered query, which is most
of them.

Backfilled (zero NULLs across all six FPL tables) and prevented from
recurring by a BEFORE INSERT trigger that derives the season from the
date. A trigger rather than rewriting refresh_fpl: that's an 11KB
function the whole pipeline depends on, and reproducing its body from
fragments to add one column in two places is a much larger risk than
the bug.

Found while planning the fpl_players key change — a composite key needs
both columns non-null, so this was a prerequisite.

### fpl_players primary key — COMPLETE
  Phase 1 ✓ season_id reliable (zero NULLs, trigger prevents recurrence)
  Phase 2 ✓ fpl_code from source_payload, 662/662, trigger-maintained
  Phase 3 ✓ player_identity keyed on fpl_code, trigger-synced
  Phase 4 ✓ PK is (fpl_player_id, season_id), 3 FKs composite,
            refresh_fpl upsert repointed
  Phase 5 ✓ verified — live refresh_fpl run succeeded, row counts
            unchanged, two seasons proven to coexist for one element id

Season rollover is no longer a risk: 2027/28 players will be inserted
alongside 2026/27 rather than overwriting them.

BACKUPS: backup_fpl_players_20260919, backup_fpl_player_snapshots_20260919,
backup_fpl_player_gameweeks_20260919,
backup_player_availability_events_20260919. Keep until the pipeline has
run unattended for a few days, then drop.

ARCHITECTURAL NOTE: anything long-lived referencing a player (saved
comparisons, Beat the Shark entries, linked FPL teams) must reference
player_identity.fpl_code, NOT fpl_player_id.

### Historic FPL: 2025/26 IMPORTED
537 players (those with minutes) in fpl_player_season_totals, season 12,
from vaastav/Fantasy-Premier-League. 409 link to current-season
identities by fpl_code; the other 128 left the PL and now have their own
identity rows.

player_identity now spans both seasons: 790 people — 409 played both,
128 departed, 253 new this season.

Stores BOTH start_cost and end_cost. Start price is what a no-transfer
squad would actually have paid; end price is what the season made them
worth. They answer different questions.

Postgres fetches the CSV itself via the http extension rather than
routing it through a client. The same DO block works for any other
season by changing the URL and season_id.

WHAT'S NOT IMPORTED:
  - gameweek-by-gameweek (gws/merged_gw.csv, ~30k rows). Needed only if
    historic Team of the Week pages are wanted.
  - daily price/ownership snapshots. These don't exist for past seasons
    and can't — they're capture-as-you-go, so Transfer Window and
    Trading Floor stay current-season only.
  - the xP column, deliberately: the dataset's own docs warn it has
    lookahead bias (scraped after gameweeks end), so it must never feed
    a model.

DONE: /fpl/season-xi — the Set-and-Forget XI for 2025/26. 2,141 points
for £78.5m in a 3-4-3, at August prices.

Result is STORED rather than recomputed: it's a fixed historical answer
that can't change once a season ends, so solving a knapsack per page
load would be work for nothing. To add another season, solve it once and
insert into season_best_xi.

Notable: the optimum leaves £4.5m of the £83m unspent — the marginal
upgrade wasn't worth it.

### Main bundle absorbed the Supabase client
`AuthProvider` wraps the whole app, so Supabase moved from its own
201KB chunk into the eager bundle (246KB → 450KB). Not 200KB of new
download — both loaded on any data-fetching page before — but it's no
longer parallelised or skippable. Revisit if load time matters.

---

## Resolved this session

### refresh_fpl consolidation — DONE, and it found an outage
The job was to decide whether to fold three triggers into the function.
Reading the function in full for the first time found two things worse
than the triggers:

1. THERE WERE TWO FUNCTIONS. pg_cron runs private.refresh_fpl(). Every
   fix for two days — the composite-key ON CONFLICT, tonight's season_id
   work — went to public.refresh_fpl(), which NOTHING calls. My "verified
   by running it" tests ran the orphan. The real pipeline was down from
   2026-09-19 18:17 to 2026-09-20 00:51, two failed runs, zero trace in
   fpl_ingestion_runs (the handler's status write is rolled back by the
   re-raise). public.refresh_fpl() is now a one-line wrapper around the
   private body, so the divergence can't recur.

2. The slug NOT NULL constraint added to player_identity broke the
   sync_player_identity trigger's INSERT for every refresh after it. It
   now generates a slug using the same rule as the backfill.

Decision on the triggers: season_id moved INTO the function (it's the
function's job to say which season it ingests, and three tables had no
handling at all). fpl_code and player_identity STAY as triggers by
design — any insert path should maintain identity.

get_data_integrity_report() gained two checks that would have caught
this: refresh freshness (>9h = FAIL) and cron-logged failures in the
last 48h. It currently shows the outage red, correctly.

## Known, accepted

### Sandbox cannot reach Supabase — verify generation from the deploy log
Not a credentials problem: the sandbox proxy refuses supabase.co with
`x-deny-reason: host_not_allowed`. So generate-static.mjs can never be
run end to end from a session.

What CAN be verified locally, and was: the render path itself, by
calling renderStaticRouteHead and buildDocument directly with supplied
data. Confirmed correct titles under 70 chars, descriptions, canonicals,
BreadcrumbList JSON-LD, an intact #root so the SPA still boots, and
proper HTML escaping (quotes, ampersands and script tags all
neutralised — no injection via player names).

Slugs confirmed safe for filesystem paths: 1,279 of them, none with
characters outside [a-z0-9-], none containing / or .., longest 55 chars.

What to check on the deploy log:
  "Static: wrote head tags for N player scout page(s)"  (expect ~1,096)
  "Static: wrote head tags for N gameweek page(s)"      (expect 4)


### Team of the Week: a part-played gameweek can't be repaired
The club-limit repair loop gives up after 8 passes. For a gameweek where
almost every player is on zero points (fixtures not finished), the
ordering is arbitrary and excluding one player just promotes another
from the same club, so it can't converge.

Not reachable in practice: such gameweeks are no longer offered by
get_completed_gameweeks, aren't the default, and aren't in the sitemap.
Direct navigation to one would show an odd XI.



### Eager bundle is 450KB (130KB gzipped)
AuthProvider wraps the whole app in App.tsx, which pulls supabase-js
into the eager chunk. It was ~246KB before auth existed.

Fixable by lazy-loading the auth context, but that touches the admin
gate and carries real regression risk for a load-time gain most visitors
won't notice. Deliberately NOT attempted at the end of a long session.
Worth doing deliberately, with the admin pages checked afterwards.

### Duplicate season constant in the two build scripts
generate-sitemap.mjs has CURRENT_SEASON_ID and generate-static.mjs has
SEASON_ID, both 13, both used to pick completed gameweeks. They agree
today; they're two places to change at the season rollover.



### One upstream discrepancy in 2024/25
Ferguson (fpl_code 487117) has 28 season points but his gameweeks sum
to 27, and 385 minutes against 368. The SOURCE has 38 rows and 38 were
imported, so nothing was dropped — the gap is between vaastav's own
gameweek file and their season totals.

One player, one point, out of ~80,000 gameweek rows. Recorded rather
than chased. get_data_integrity_report() will keep showing it, which is
correct: the check should flag it even though the cause is upstream.

## Deferred by decision

### Player Scout — BUILT (v1)
/fpl/player-scout. Search any player by name, see their season-by-season
record: August price, points, points per £m, minutes, goals, assists,
and a "shape" sparkline splitting the season into thirds.

Works across all four seasons because player_identity links the same
human by fpl_code — FPL reassigns element ids annually, so name matching
would have been the only alternative and would have had to reconcile
"Bukayo Saka" with "Saka".

Departed players ARE searchable, which is the point — they're who the
historic data is most interesting about. They get no projection link,
and the page says why rather than linking to a 404.

v2 DONE: every player has a stable URL at /fpl/player-scout/<slug>.
1,279 identities slugged, all distinct, no collisions or fallbacks.
1,096 have real history and get a prerendered page plus a sitemap entry.

The slug lives on player_identity, not fpl_players, so it survives a
transfer, a name change and a season rollover — and departed players
have one at all, which a per-season slug can't give them.

STILL NOT DONE:
  - price journey within a season (the gameweek data has `value`)
  - value before/after a transfer, which the club column hints at
  - ownership history (`selected` per gameweek)

### Season filters: audited, mostly NOT needed
Season 13 is hardcoded in ~11 frontend modules, and that's CORRECT for
almost all of them. Injuries, price risk, transfer window, set pieces
and the digest are current-season questions — "injuries in 2023/24"
isn't something anyone wants, and adding filters there would be work
for nobody.

Only pages that genuinely compare across seasons need the dimension.
/fpl/season-xi now has it, driven by the data rather than a hardcoded
list, so adding a season is an insert.

If career-arc or transfer-comparison pages get built, they'd need it
too. Nothing else does.


### Historic FPL seasons — FOUR IMPORTED
2022/23 (554), 2023/24 (570), 2024/25 (562), 2025/26 (537) player rows
in fpl_player_season_totals. seasons 9-12.

import_fpl_season(season_id, folder) does it all: fetch, validate,
import, extend player_identity. service_role only.

Column COUNT varies wildly by season — 67 in 2021/22, 88 in 2022/23 and
2023/24, 103 in 2024/25, 105 in 2025/26 — which is why the importer
resolves columns by NAME. Anything positional would silently import
shifted data for most of them.

Malformed rows are skipped and REPORTED, but only up to 1% of the file;
beyond that it aborts, because one bad row is a quirk and fifty is a
format change. 2023/24 has exactly one (a news field containing a
comma).

2021/22 is available and not imported — 67 columns, worth checking the
required set exists before adding.

VERIFIED WORKING: career totals resolve across seasons by fpl_code —
Salah 917 points over four seasons, Haaland 909 — which is the whole
reason player_identity was built.

### Trend pages to build on this data
Now possible, in rough order of value:
  - career arc per player (points/value by season) on the player page
  - value at different clubs: a player's returns before and after a
    transfer, which fpl_code makes tractable
  - set-and-forget XI per season, showing whether the perfect squad's
    cost is stable (£78.5m in 2025/26; solve the others)
  - top scorer by season: 344 in 2024/25 against 239 in 2025/26 is a
    big swing worth explaining

PHASING NOW POSSIBLE: 2025/26 gameweek history imported — 19,375 rows
covering all 537 players with minutes, in
fpl_player_gameweek_history. import_fpl_gameweeks(season_id, folder)
loads any other season.

CORRECTION to an earlier note: I said price/ownership history was
unrecoverable for past seasons. That's true DAILY, but the gameweek file
carries `value` (price) and `selected` (ownership) per gameweek, so both
ARE recoverable at gameweek granularity.

Proven immediately: Haaland front-loaded 2025/26 (106 / 81 / 45 by
third) while Bruno Fernandes climbed (63 / 80 / 92) — near-identical
totals, opposite shapes.

The 10,104 "unmatched" rows the importer reports are the 304 zero-minute
players excluded from season totals, not a join failure. Verified.

### "Deadline Day" page — name reserved
Considered for the price-risk page and rejected: in FPL, "deadline"
means the GAMEWEEK deadline, when the team must be set. Price changes
happen overnight on their own schedule, so the name would point people
at the wrong clock.

Worth keeping for an actual pre-deadline page — your XI, captain choice,
flagged players, whether to play a chip. That's a real page and the name
belongs to it.


### Change summary — DATA DONE, posting still open
get_daily_digest() diffs the two most recent snapshots into typed
changes (price rises/falls, availability, ownership swings), surfaced at
/fpl/whats-changed. Derived rather than stored, so it can't drift from
the pages it summarises.

Verified live: 36 price changes, 3 availability changes and 12 ownership
swings in a single 24 hours, so there is genuinely something to say most
days.

notable() is the filter a post would use: ownership >= 5%, with
availability exempt because a newly injured player nobody owns yet is
exactly what's worth hearing early.

STILL NEEDS YOU: which platforms, and auto-post versus queue.
Recommendation stands — generate-and-queue. The model will sometimes be
wrong, and a wrong call published overnight is hard to walk back for an
account still building credibility.

### Gameweek Results page retired
Content merged into the per-gameweek Team of the Week pages. The old
/fpl/actual-matches route still exists; decide whether to redirect it to
/fpl/team-of-the-week or keep it as the match-level view.


### Fixtures & Results: head-to-head — DONE
Archive rows now carry the head-to-head record (W-D-L from the home
side's perspective, plus the last scoreline) and no longer show model
output — predictions live in Results Projections.

get_matchweek_head_to_head() fetches a whole league+season in one call
rather than per pairing: the browser groups a season into expandable
matchweeks, so a per-matchweek fetch would fire again on every expand.

### Team of the Week: pitch view — DONE
Laid out by FPL position (GKP/DEF/MID/FWD), which is all FPL records —
a real position would have been invented. The shape falls out of the XI
rather than being a formation.

Layout logic lives in src/lib/pitchLayout.ts, shared with any future XI
view. It carries the band-centring fix from the formation geometry bug
(single-player bands centred, two-man bands kept as a pair) and has its
own unit tests, so that bug can't reappear in a second place.

### Managers' Dugout: surface the cross-formation comparison better
Clicking a position already compares that role across every formation,
but it's hidden behind a click and labelled "Slot 9" rather than by
position. The question it answers — does this role produce more in one
shape than another — is the most interesting thing on the page and
should be visible without hunting for it.

Blocked on nothing; needs position names per formation (the geometry
table has coordinates but not labels, and a slot's role genuinely
differs by shape, so labels have to be per-formation rather than global).

### Bargain Basement: positional value — DONE (claim corrected)
IMPORTANT: the first version concluded "play five at the back" from the
value ratio. That was WRONG and is now corrected on the page.

Tested by solving both objectives over this season's data under a
realistic XI budget:
  - maximise POINTS: 356 pts, £77.8m, shape 3-5-2
  - maximise VALUE:  324 pts, £53.9m, shape 5-4-1

Chasing value costs 32 points and leaves ~£24m unspent — maximising a
ratio doesn't spend a budget. Cheap defenders really are the best value
per pound, but the saving has to be spent somewhere, and premium
midfielders convert it better than a fifth budget defender.

A test now asserts the page does NOT draw the five-defender conclusion.
Compares the five best-value players in each position rather than the
positional average, because that's who a squad is actually built from
and the two give different answers: averaged across everyone the four
positions look alike (medians 2.15-2.95), but restricted to the top five
they diverge sharply.

Current data: defenders 6.59 points per £m at £4.38 average, forwards
3.59 at £6.78 — nearly twice the value for £2.40 less. Since an XI must
field 3-5 defenders and 1-3 forwards, that argues for five at the back
and one up front.

The page states the counter-argument too: forwards carry the higher
weekly ceiling and captaincy is picked for upside, not efficiency.

### Transfer Window split — DONE
Price-change risk is now its own Predict page (/fpl/price-risk); the
Transfer Window stays in Discover as the record of what managers have
already done. Same numbers, different kind of claim.

Ranks by net transfers relative to OWNER BASE rather than raw count:
20,000 net transfers is decisive at 2% ownership and noise at 40%.

States plainly that FPL's threshold isn't published, so it ranks risk
rather than calling a change — pinned by a test, since that's the kind
of caveat that quietly disappears in a later edit.

### Physio Room: short absences — DONE
"Worth holding" panel surfaces players who have been scoring and are out
for only a fixture or two, sorted by points. Season points added to
get_injury_report() and shown as a table column.

Excludes two cases that would otherwise clutter it: players with no
return date (can't know the cost) and players on zero points (nobody
owns them). Both covered by test.

### Results Projections — DONE
Added to Football > Predict at /football/projections, as a VARIANT of
the fixtures browser rather than a new page. The browser already shows a
result where one exists and a prediction where it doesn't, so archive
and projections are the same data framed backward or forward. A separate
copy would have meant a third fixture list to keep in step.

### Gameweek Results: add a player-level table
Currently match-level only. The data is already there.

### Bargain Basement: sortable — DONE
Every column sorts, defaulting to points per £m. Numeric columns default
to descending, names ascending, and a second click reverses.

This deliberately replaces the proposed separate "Player Scout" actuals
table: three overlapping player-actuals views (value, gameweek results,
scout) would answer the same questions from the same numbers and drift
apart. One sortable table does it.

"Chief Scout" stays reserved for the adjusted-model version, where the
scouting metaphor means something.

### Richer generic player stats (Discover)
The Opta workbook carries ~214 columns, of which ~22 were extracted.
Untouched and potentially interesting for Discover: passing accuracy by
third, duels won/lost (aerial vs ground), dribbles, crosses by side,
tackles, interceptions, recoveries, clearances, blocks, touches by zone,
turnovers, and full goalkeeper detail (saves by area, catches, punches,
crosses not claimed, distribution).

Same caveat as the rest: 2011/12, so it's role-level insight rather than
anything about current players. Worth extracting only against a specific
question — importing 200 columns with no consumer is how the original
truncation problem started in reverse.

scripts/extract_opta_workbook.py is the place to add them.


### Opta set-piece breakdown — DONE
The full workbook was supplied and extracted. opta_slot_breakdown now
holds the type split that was previously reported as impossible:

  7.3% of goals from penalties, 12.8% from corners, 3.2% from direct
  free kicks; 13.4% of assists from corners, 7.0% from free kicks.

Aggregated to formation-slot level (121 rows), not per-player: this is
2011/12, so no player is current, and the ROLE is what carries forward.
scripts/extract_opta_workbook.py reproduces it from the source file.

Totals reconcile exactly with the pre-existing aggregates (916 goals,
635 open play), confirming the two agree.

REMAINING: the weighted set-piece index can now be built -- penalties
are worth ~7.3% of goals against corners' 12.8% spread across far more
takers, so takers can finally be weighted by type rather than treated
alike.

### Player position half-steps (e.g. 9.5)
When configuring team set-ups, a player may sit between two slots -- a
9.5 behind the striker. The current model has integer slots only.
Worth deciding whether that's a distinct slot, a pair of weights, or
just a label.


### Set-piece index — DONE
Weighted by duty type using the Opta breakdown, on the set-pieces page.
Penalties are worth far more per taker than corners (7.3% of all goals
from ~1 taker per club against 12.8% spread across more), goals count
double against assists, and rank decays so a second-choice penalty taker
scores far below the first.

Presented as a RANKING, not expected points — the weights describe the
Premier League in general, not these specific takers.

NOT yet fed into the optimiser. That would need the tactical-role data
to say which players actually occupy the roles, which is the 412-on-
fallback gap.

### Model accuracy must surface inside Predict
Validate was folded into Predict because it was QA language for an
audience that wants to know whether to trust a number, not to audit one.

That only works if accuracy actually appears ON the prediction pages —
"Arsenal 74% to win" next to "predictions at this confidence have come
in 71% of the time" is far more persuasive in context than the same fact
in a section nobody clicked. If it quietly vanishes instead, the
differentiator is lost. Currently NOT yet surfaced anywhere.

Still gated on walk-forward refitting for a meaningful sample (153
matches today).


### Historic season ingestion — BLOCKED, needs schema change first
`fpl_players`' primary key is `fpl_player_id` alone, not
`(fpl_player_id, season_id)`. FPL reassigns element IDs every season, so
ingesting 2025/26 would **collide with and overwrite** current players.

Needs: PK widened, every FK reviewed, and a canonical player identity to
link the same human across seasons (the FPL id can't, and names alone
won't — transfers, renames, collisions).

### Nav accordion — DONE
Browse → Discover, and both theme menus now group their links under the
four stages. Theme-first (Football → 4 stages) rather than stage-first,
mirroring the landing page and hubs.

The back-to-hub risk flagged here did materialise, but as a COMPILE
error rather than a silent one: splitting groups into `sections` left
`.items` undefined, and TypeScript refused it. A shared `groupItems()`
accessor now serves both shapes. Had the field been optional-with-
default instead, this would have silently evaluated to "no theme
matched" and removed the back link everywhere with nothing failing.

### Stage-level landing pages — DONE
Eight pages (/football/discover ... /fpl/start/configure), all rendered
by one StagePage component from src/lib/journey.ts. Adding a link to a
stage is a config edit, not a code change.

### Chief Scout: raw model vs adjusted — FOUNDATION DONE, accumulating
fixtures.raw_predicted_home_goals / _away_goals now store the model's
prediction WITHOUT manual overrides, alongside the adjusted one. So the
question "does the human adjustment beat the model it adjusts?" becomes
answerable.

Deliberately two columns, not the projection_scenarios table that
already exists: scenarios are built for N arbitrary owners, and a
multi-user league is explicitly unlikely. Two columns needed no new
table and no migration of the 22 files reading fixtures.predicted_*.
If scenarios ever become real, that table is still there.

Verified value-neutral on the adjusted side: 1,812 fixtures re-predicted,
zero changed. 96 currently diverge (where overrides bite) — that's the
comparison set, and it grows as ratings are tuned.

get_scout_vs_model() scores both on played fixtures, using mean absolute
goal error rather than a probabilistic score (what's stored is expected
goals; a Brier score would imply a probability model this comparison
doesn't have). It counts ONLY fixtures where the override changed
something — including the ~1,700 identical ones would drag both to the
same number and hide any real difference.

Currently 0 scored: raw_predicted only populates for scheduled fixtures,
and already-played ones were frozen before the column existed. It fills
from here. That data cannot be recreated retrospectively, which is the
argument for having started.

STILL TO DO: a public page showing the comparison, once there are enough
played fixtures for it to say anything. Scout profiles and blogging are
separate and can wait indefinitely.

### IndexNow
Deliberately skipped while there was no crawlable content. Worth
reconsidering now that pages are prerendered and rebuilds are automatic.

### GW15–38 backfill
Paused.

### Tactical role data gap — SCOPED, manual pass next week
412 players on fpl_position_fallback at 0.30 confidence. But the job is
far smaller than that number suggests:

  6 regular starters (270+ mins)
  51 rotation players (90-269 mins)
  355 fringe (under 90 mins all season)

A role assigned to someone who never plays changes no projection, so
the real work is ~57 players, not 412.

get_tactical_role_worklist() and a panel on the Tactical Roles admin
page list them ordered by minutes then ownership, so the pass can stop
at any point and whatever remains is the least consequential.

Highest-value single fix: Gakpo — 12.8% owned, 29 points, still on a
guessed role.

Once done, three things unblock: set-piece exposure, bonus projection,
and feeding the set-piece index into the optimiser.

### Optimizer: force include/exclude
Not started.

---

## Cleanup

- `admin_bootstrap_emails` still contains the owner's address. Harmless
  (it only applies at signup, and the account exists), but tidier
  removed.
- `buildMatchTrend()` in `api.ts` is now unused by any page — kept
  because it's small, pure and tested, and useful if a future view wants
  trend data. Delete if that never happens.
