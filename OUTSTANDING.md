# Outstanding work

Running record of known gaps, deferred decisions and things that need a
human. Kept in the repo rather than in a chat history so it survives the
conversation it came from.

Ordered roughly by value, not by effort.

---

## Needs you

### UK TV/streaming info: schema and display built, no data source picked yet
Investigated before building anything (see the fixture_broadcasts migration
for the full write-up): no free, terms-compliant, automated per-fixture
feed of UK broadcast selections exists. Commercial APIs (e.g. Sportmonks'
tvStations, linked directly to fixtures) exist but cost money on an
ongoing basis. The well-known free listings sites explicitly forbid
scraping and republishing their data, which is also what the brief asked
not to do.

Built the safe parts, which don't depend on that decision:
- fixture_broadcasts table: normalized (a fixture can have zero, one or
  many rows), market-aware (not hard-coded to GB), three cleanly
  distinguished states (no row = not yet determined; a
  confirmed_not_televised row; one or more confirmed_broadcast rows).
  Constraints proven by trying to insert invalid rows and watching them
  get rejected. Written by an admin (is_admin(), same RLS pattern as
  team_strength_manual_override) -- no pipeline behind it.
- Compact badge + All/On TV/Free-to-air filter on the fixture list
  (GameweekBrowser, projections view only), a "Where to watch" section on
  the individual match page (MatchPage), included in that page's search
  metadata once real data exists.
- Everything reads independently of the existing fixture list/prediction
  load, so a broadcast-data problem can't take down either.

Not built: an admin UI for entering rows (today that means writing them
by hand via SQL/Supabase) -- a natural next step once there's an actual
supply of data to enter, i.e. once you've decided whether to pay for a
feed or maintain Premier League picks by hand every ~5-6 weeks when
they're announced. Table is live and empty; nothing shows on the site
until rows exist, by design.


### Nav: move Team Strength under Results Projections
Football > Predict currently lists Team Strength last (src/lib/journey.ts,
~line 93), after Results Projections, Head to Heads, Model Accuracy,
Model Returns and Model Scorecard. Chris wants it moved to sit directly
under Results Projections -- second in the list, not last.

### Managers' Dugout: needs a general tidy-up, plus position-contribution variance
src/pages/fpl/FormationsPage.tsx (/fpl/formations). Two asks:
1. General tidy-up -- not yet scoped in detail.
2. It currently shows only the MEAN open-play goal contribution by
   playing position, across clubs. Chris wants the spread shown too --
   range and standard-deviation-type metrics, not just the average --
   and is thinking this may need players in each position bucketed by
   ability (top end / mid range / low end) rather than one blended mean
   per position.

### Tactical Roles: flag shared/contested positions with rotation risk
src/pages/fpl/TacticalRolesAdminPage.tsx, which is also what renders at
/fpl/line-ups (Starting Lineups) -- Chris links this to the Dugout work
above. Currently a player is presumably just "1st choice" or not; needs
to distinguish a nailed-on starter from a 1st choice who's actually
sharing or fighting for the position with someone else, and so carries a
higher rotation risk, rather than treating both the same way.

### Starting Lineups: clarify it's long-term, not next-game-only
/fpl/line-ups (TacticalRolesAdminPage.tsx). The page should say plainly
that it reflects the club's likely lineup over the medium/long term, not
a next-match-only pick -- readers may otherwise take a long-term XI as a
single-gameweek prediction and get confused when it doesn't match team
news for the very next game.


### Half-life/shrinkage grid: does NOT survive proper significance testing -- don't re-run this
scripts/model_experiment.py ran a 10-variant grid (half-life 180/270/365,
shrinkage 0-3) across all 4 divisions, tuned on 2023/24-2024/25, held back
2025/26. Picking each division's lowest-gap variant looked promising at
first read (e.g. League Two: shrink 3, gap 0.0188 tune / 0.0183 holdout).

Re-checked with a proper paired test (per-match log-loss vs the
unshrunk baseline, same matches, t-statistic) rather than comparing raw
means: none of the three candidate winners hold up on the held-back
season. League Two, the strongest candidate, is t=-3.26 on the tuning
seasons but only t=-0.76 on 2025/26 -- classic overfitting to the tuning
data, not a real effect. Premier League and League One are weaker still.
Championship never had a consistent winner across both splits in the
first place.

CONCLUSION: no version change from this. Don't re-run the same grid
expecting a different answer -- the issue is that comparing 10 variants
and picking the best one is close to guaranteed to find an apparent
winner even under pure noise; a proper significance check is required
before reading any future grid this way, not an optional extra step.

### Premier League "estimated ratings" gap -- traced to one team, not a systematic flaw
The scorecard's team-type breakdown showed a large PL log-loss gap for
matches using an estimated (not-yet-directly-fit) rating: 1.0325 vs the
market's 0.9007 over 55 matches. Read at face value last time as
evidence the promoted-team estimation method needs work.

Traced to the individual teams: the gap is overwhelmingly ONE case --
Sunderland's first 10 PL games in 2025/26 (log-loss 1.65 vs market 1.23,
gap 0.42 on its own). Sunderland finished 4th in the Championship the
year before (76 points, well behind the automatically-promoted sides on
100 and 90) but then won half their first 10 Premier League matches --
a genuine surprise the betting market also underpriced (just less
badly than the model did). Every other promoted/estimated case in the
sample (Luton, Sheffield United, Coventry, Leeds, Burnley, Ipswich) is
reasonably calibrated, gap small.

CONCLUSION: not solid evidence of a systematic promoted-team estimation
bug -- redesigning the estimation method (e.g. scaling the divisional
gap by how strongly the team finished below) on the strength of one
team's surprise start would likely be overfitting to it. Worth watching
whether more seasons of data turn up a real pattern, not worth engineering
against yet.


### Possible new section: casino/card-game skill tools (blackjack, poker)
Chris is considering blackjack basic-strategy and card-counting trainers,
and poker EV/equity tools, alongside the existing football analytics and
the Beat the Shark fantasy game. Not started -- discussed, not scoped.

**The case for it:** the existing games section (Beat the Shark) already
uses play to teach probability concepts. Chris's view is that a blackjack
or poker EV trainer sits on the same side of that line -- teaching how
probability and expected value work through a game, not promoting
gambling. On that reading it's a natural extension of what the site
already does, not a new category of content.

**My (Claude's) concerns, for balance:**
- No staking, so nothing here is gambling under UK law, and card counting
  itself is legal. The open question is framing and audience, not
  legality.
- Chris coaches children professionally; if this site is ever linked to
  that identity, casino-themed tools are a different reputational
  register from football stats and a fantasy points game, whatever the
  educational framing. Worth deciding deliberately rather than by default.
- If it ever grows into anything that names real bookmakers, links to
  them, or frames bets as "value" (see the Model Returns / odds-feed
  discussion elsewhere in this file), that's a different, heavier set of
  rules (ASA gambling advertising rules, affiliate terms) that a "teaching
  probability" framing wouldn't cover.

**If it goes ahead**, suggested first step is small and self-contained: a
blackjack basic-strategy trainer (deal a hand, check the decision against
the standard chart) and a Hi-Lo counting drill. Poker equity/EV
calculators (Monte Carlo, hand or range vs range) are a similarly
contained second piece. Full GTO solving is a much bigger undertaking and
not recommended from scratch -- a trainer built on precomputed published
ranges/solves is the realistic version of that.

**Access, if it goes ahead:** today there is no page that's actually
hidden from a non-admin -- the existing "admin" pages (Team Strength
Admin, Tactical Roles Admin) are publicly viewable; `isAdmin` only gates
edit controls and writes, not viewing. Anyone can create an account at
/login, but that grants nothing -- admin is a manual promotion in the
database. Genuinely hiding a page (redirecting anyone not signed in as an
admin, rather than rendering it read-only) is a new pattern, not a reuse
of the existing one, and would need building if these tools are kept
private.

### Free odds source vs a paid feed (Betfair, etc.)
Chris would rather not pay for an odds feed. football-data.co.uk already
publishes a free weekly fixtures.csv with 1X2, O/U and Asian handicap
odds from several bookmakers for the next round -- covers a market-based
value-bet view and possibly better fantasy inputs, but only the next
round, updated a couple of times a week, not live.
Betfair Exchange API: delayed key is free (1-60s lag, no trading); a live
key is currently a GBP 499 one-off activation fee per Betfair's support
pages (some third-party pages still say GBP 299 -- may have risen), and
explicitly does not permit read-only/display-only use -- it's issued for
personal betting, requires a funded KYC-verified account, and any public
or commercial use needs separate vendor approval. Live bookmaker prices
beyond football-data.co.uk have no free source; scraping is against
bookmaker terms and risks UK database-right issues -- not recommended.
Compliance note: odds/probabilities shown factually are not themselves a
licensed activity, but affiliate links, "value bet" tips, or paid tips
bring in ASA gambling-ad rules and consumer-protection obligations --
not legal advice, Chris should get proper advice before anything public.
Suggested if this goes ahead: keep any betting tools (odds-vs-Pinnacle
view, matched-betting calculator) behind an admin-only gate (see above --
would need building), no affiliate links, no public "value bet" framing.


### Strength views picked the latest CONVERGED fit, not ACCEPTED -- FIXED 2026-09-24
team_strength_current and fpl_team_strength_current selected
`converged = true` ordered by fitted_at, so a fit that converges but fails
a quality gate (status 'rejected') could become the live team ratings on
every page that reads them. Confirmed live before fixing: 5 rejected fits
(#2, #3, #6, #7, #38) had converged = true, including the two retired for
the scoring-level bug. No live fit currently differed between the two
rules, so this changed nothing today -- closed the door for next time.
Fixing it also surfaced a second bug: CREATE OR REPLACE VIEW silently
dropped both views' anon/authenticated grants -- caught immediately by
verifying as anon, restored, and now covered by a new daily guard
(public_views_readable_by_anon), proven with a deliberate revoke/restore.

### Retro-fit: Premier League 2025/26 -- SUPERSEDED, now DONE and much wider
Overtaken by later work: the retrofit-season workflow now takes several
leagues and seasons in one run (scripts/retrofit_plan.py derives the
dates per season) and fits the division above as well as below, so
relegated teams get estimates too. All four English divisions are
retro-fitted for 2023/24-2025/26 (5,208 matches), with model versioning
(model_versions, model_change_log), an in-memory experiment harness that
can never become a live fit, and a public scorecard
(/football/model-scorecard) comparing the model to the closing market by
division, season, team type and phase. Odds for 2025/26 E0 remain 1X2
from FIVE bookmakers (O/U from four), not eight -- true of every season,
not a gap.

### Test run reports unhandled errors outside any test (still present, now 4)
Rechecked 2026-09-24: all 406 tests pass (up from 382), but vitest still
catches unhandled errors from TacticalRolesAdminPage.test.tsx (a `<Link>`
rendered outside a Router) and TeamOfTheWeekPage (setState after
teardown, `window is not defined`) -- 4 now, was 3. Pre-existing, not
touched by any of this session's work. Vitest warns these can mask false
positives; worth a look next time either of those two files is open.


### FPL rollover keys -- FIXED 2026-09-24
fpl_teams, fpl_gameweeks and fpl_fixtures conflicted on fpl_team_id /
fpl_event_id / fpl_fixture_id alone -- fixed to composite (id, season_id)
keys, backup-first, FK-aware, same pattern as fpl_players. Also included
fpl_player_gameweeks, not in the original note: its own PK depended on
fpl_fixture_id alone and it FKs to all three, so it had the identical
exposure -- found while making the other three composite.

private.refresh_fpl() and private.refresh_fpl_live_event() both updated
to match (the latter also gained the same season-resolution logic
refresh_fpl() uses, and its fixture join is now scoped to the current
season, to avoid matching a stale season's fixture once fpl_fixtures
holds more than one).

Verified before changing: all four tables held only the current season
(20/38/380/3216 rows), so nothing to reconcile. Verified after: both
functions ran clean against live FPL data; proved the actual rollover
scenario directly -- the same fpl_team_id inserted under a different
season_id succeeded without conflict, inside a transaction rolled back
before it could persist.



### Pre-key-change backups -- DROPPED 2026-09-24
backup_fpl_players_20260919 and the other three dropped once verified:
refresh_fpl()'s ON CONFLICT (fpl_player_id, season_id) matches the
table's actual primary key; the 6-hourly refresh cron failed twice right
at the change (both the same ON CONFLICT mismatch, mid-migration) then
ran clean 15 times straight over the following 4 days; every live table
was at or above its backup's row count, so nothing was lost.

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

### Change the admin password — DONE
Confirmed changed by Chris (2026-09-20), after login started working.
The password quoted in the login section above is stale; ignore it.

### Supabase email (SMTP)
Magic-link sign-in and password resets depend on outbound email, and
Supabase's default SMTP is heavily rate-limited (Hotmail also junks it).
Resend is already connected to the account; wiring it in as Supabase's
custom SMTP is the durable fix. Password sign-in works meanwhile.

---

## Known gaps

### Predicted Line-ups — DONE: the public page already existed, now moved to Fantasy
Resolved 2026-09-21 by relocating an EXISTING page, not building a new one.

The spec below describes a page that had already been built: the public,
read-only "Starting Lineups" view at /football/lineups (commit ef12af1).
It is the Tactical Roles component mounted WITHOUT adminMode, and it meets
the spec point for point -- club selector and pitch; formation stated, not
editable; depth switchable for 1st/2nd choice; set-piece duty; the "role
not yet confirmed" marker; and no review filters, no mark-reviewed, no
editing (all pinned by TacticalRolesPage.publicView.test.tsx).

Now:
  - lives at /fpl/line-ups, under Fantasy > Predict beside the projections
  - /football/lineups 301-redirects there (netlify.toml)
  - the admin Tactical Roles page is unchanged and stays in Admin

DO NOT build a second public line-ups page. Extend this one if the spec
below asks for anything it lacks.

#### Original spec (kept for reference)

Attempted by adding the admin Tactical Roles page to Fantasy > Predict.
That was wrong and has been reverted: it duplicated the page rather than
moving it, and exposed review filters, "mark reviewed" and formation
editing to a section where none of that belongs.

The admin page is organised around a REVIEW WORKFLOW — which players
still need a role assigned. A public page answers a different question:
what XI and shape is each club likely to field? Same underlying data,
opposite framing, so it needs its own page rather than a filtered view
of the admin one.

WHAT IT SHOULD BE (new route, e.g. /fpl/line-ups):
  - club selector, and the pitch
  - the model's most likely formation for that club, stated plainly,
    not as an editable dropdown
  - the expected XI at 1st choice, with 2nd choice available as a
    "if there are changes" view (depth is now capped at 3, so those are
    the only meaningful tiers)
  - per-player: expected minutes or ppg, set-piece duty, and the
    "role not yet confirmed" marker where it applies — that caveat IS
    worth showing publicly, since it tells a reader how much to trust
    the position
  - NO review filters, NO mark-reviewed, NO editing

REUSE: FormationPitch already renders all of this and is the expensive
part. The new page is a thin read-only wrapper around it plus a club
selector. The admin page keeps its own controls and stays in Admin.

Note the CM/DM alias fix landed already, so pitch placement is correct
for both pages.

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

BACKUPS: dropped 2026-09-24, see "Pre-key-change backups" above.

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

### Site hung forever on "Checking session..." after a token refresh — FIXED
Reported live, from a phone: the whole app stuck on "Checking session..."
indefinitely (visible on /login, but the effect blocks any admin-gated
UI everywhere via useAuth's loading flag).

Confirmed from the Supabase auth/rest logs, not guessed: is_admin
succeeded fine on the initial page load (11:23:04). A later token refresh
(200 OK on /auth/v1/token) had NO follow-up is_admin call at all -- it
never reached the server, meaning the client-side code never got past
the `await`.

ROOT CAUSE: auth.tsx's `onAuthStateChange` callback was `async` and
awaited `supabase.rpc('is_admin')` (via resolveAdmin) directly inside
it. Supabase's own docs warn against exactly this: the callback fires
while an internal session lock is held during the refresh, and calling
the client again from inside it tries to acquire that same lock and
deadlocks. `getSession()` at initial mount doesn't have this problem --
it isn't inside the listener -- which is why sign-in and normal use
worked fine and this only ever surfaced later, after a token refresh
(e.g. reopening the app after it had been idle).

FIXED: deferred the supabase call to the next tick (`setTimeout(fn, 0)`
inside the listener), exactly as Supabase's docs recommend for this
case. 212 tests still passing, tsc clean, build clean. No auth test
existed to update -- worth adding one that mocks onAuthStateChange
firing a TOKEN_REFRESHED event and asserts loading eventually clears.

### Player pages: canonical page enriched — DONE (v1)
The canonical /fpl/players/:slug now carries the season-by-season record
that previously only existed on the orphaned scout page, via a SHARED
component (components/fpl/PlayerCareerRecord.tsx) used by both -- one
implementation, so the same player can't read differently in two places.

Done: fpl_code added to PlayerPageProfile (verified non-null with a
matching player_identity row for all 667 current players); career fetched
separately and allowed to fail on its own, since it's a secondary section
and must not take out a page that projection links point at; "Full career
record" deep link added.

STILL ON THE SCOUT PAGE ONLY, deliberately not duplicated: the
contribution split, the cumulative-points line, and the per-gameweek
breakdown per season. Worth deciding whether those move too, or whether
the scout page stays as the deep-dive. If they move, the scout route
should probably redirect rather than linger.

NOTE, an assumption worth re-checking: the scout route keys on
player_identity.slug, this page on fpl_players.slug -- two separately
maintained columns, agreeing for all 667 today (checked, zero
mismatches). Same generation rule, so divergence is unlikely, and it
degrades to the scout page's own not-found state.

### (superseded) Player pages: three pages, the richest one orphaned
Requested: every player name should link to one rich page; actuals and
projections mostly the same view, with projection info added on top.

WHAT'S ACTUALLY THERE (checked, not assumed):
  - /fpl/players/:slug  (PlayerPage, 202 lines) — CANONICAL. Prerendered,
    in the sitemap, and what almost every player-name link on the site
    points to (Digest, Market, Injuries, PriceRisk, TeamOfTheWeek, Value,
    PlayerProjectionsTable all link here). Content is thin: projected
    points + one gameweek table.
  - /fpl/player-scout/:slug (PlayerRecordPage, 409 lines) — RICHER by
    far: contribution split, cumulative-points line, per-season compare
    (Aug price, pts, mins, per-90, per-£m, G, A), full gameweek
    breakdown across every season held. Reachable ONLY from the Player
    Scout search. Effectively orphaned.
  - /fpl/player-points (PlayerProjectionsTablePage) — the sortable
    all-players table, not a per-player page. Not part of this merge.

THE BLOCKER, and why this wasn't just done: the two pages don't share a
key. PlayerPageProfile is keyed on fpl_player_id and has NO fpl_code;
every scout API (getPlayerCareer, getPlayerSeasons,
getPlayerSeasonGameweeks) keys on fpl_code via player_identity. So
enriching the canonical page needs an fpl_player_id -> fpl_code lookup
first. fpl_players carries fpl_code (trigger-maintained), so the data is
there — it just isn't on the type or in that query.

RECOMMENDED SHAPE (not yet agreed):
  1. Add fpl_code to PlayerPageProfile / getPlayerBySlug.
  2. Extract the rich actuals sections out of PlayerRecordPage into a
     shared component, so the two can't drift.
  3. Canonical PlayerPage renders shared-actuals + its projections
     block, becoming a genuine superset.
  4. Leave /fpl/player-scout/:slug routed (it's slugged, prerendered and
     linked) — either keep it as the career-only view or redirect it.
Doing it this way keeps every existing link and the prerendering intact,
which repointing ~10 files' worth of links would not.

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

## SECURITY REMEDIATION (audit vs commit 2b3d392) — TRIAGED 2026-09-20

The audit is broadly sound but PARTLY STALE: it predates the refresh_fpl
consolidation and the anon-grant revoke. Re-verified against live DB
today rather than taken on trust. What's actually true now:

### LIVE HOLE 1 — authenticated could run privileged refreshes — FIXED 2026-09-20
CLOSED. Verified after: anon=false, authenticated=false, service_role=true
on both functions; cron calls private.refresh_fpl so is unaffected.
Also revoked PUBLIC execute on handle_new_auth_user() and pinned
get_data_integrity_report()'s search_path in the same migration.
ORIGINAL FINDING: anon was revoked (that fix held), but
`authenticated` retains EXECUTE on public.refresh_fpl() and
public.refresh_fpl_projections_range(), both SECURITY DEFINER, neither
with an internal is_admin() check.

Why this is worse than it looks: is_admin defaults FALSE for a new
signup, so "authenticated" is not a trusted set. If Supabase email
signup is enabled on the project, anyone holding the publishable key
(it's in the bundle, by design) can create an account and then trigger a
full FPL ingestion repeatedly -- hammering the FPL API and writing
thousands of rows. FIRST ACTION: check whether signup is open in the
dashboard; that determines whether this is urgent or merely wrong.
Fix is small: revoke from authenticated, add is_admin() inside the
wrapper. Do NOT break pg_cron (it calls private.refresh_fpl, unaffected).

### LIVE HOLE 2 — trigger-workflow.ts was unauthenticated — FIXED 2026-09-20
CLOSED. Now requires a Supabase access token verified server-side against
Supabase (not decoded locally) plus is_admin() checked server-side; a
client-sent admin flag is ignored. Bounded-integer input validation that
REJECTS rather than clamps, unknown workflow/input keys rejected, 5/min
per-user rate limit, GitHub error detail logged not returned. 11 tests
cover anonymous / bad-token / non-admin / forged-flag / valid-admin /
bad-input / rate-limited / no-leak. The stale 'no auth is fine here'
header comment was rewritten at the same time.
NOTE: the rate limit is in-memory and therefore per-instance -- a
backstop, not a guarantee. A shared counter needs Supabase or KV; only
worth it if this proves insufficient.
ORIGINAL FINDING: Holds GITHUB_ACTIONS_TOKEN server-side and will trigger any
of three workflows for any anonymous caller. The file's own header
argues this is acceptable because blast radius is bounded to three
known-safe re-derivation workflows.

That argument is half right and should not be left standing: it's true
nothing can be corrupted or escalated, but it ignores COST and
AVAILABILITY -- unlimited anonymous GitHub Actions minutes, and
concurrent refreshes racing each other. Minimum fix is a Supabase JWT +
is_admin check (the frontend already has a session when these buttons
render) plus bounded-integer input validation and rate limiting. The
header comment must be rewritten at the same time; leaving a stale
rationale in the file is how the next person concludes it's fine.

### Confirmed still open, lower urgency
  - RLS on 6 tables: FIXED 2026-09-20. Classified by actual usage, not
    guesswork. The 4 read by frontend pages got RLS + an explicit
    public-read policy (declaring the intent, not hiding data the site
    needs); the 2 that appear only in generated types got RLS with NO
    policy, so they are service-only. Verified AS anon afterwards: all
    four still return rows, both service-only tables correctly denied.
  - get_data_integrity_report has NO pinned search_path and is
    anon-callable; it also exposes operational internals. Pin the path;
    consider restricting to admin.
  - handle_new_auth_user is EXECUTE to PUBLIC. It's a trigger helper and
    should be callable by nobody.
  - Dependencies: FIXED 2026-09-20. react-router-dom -> ^7.18.2,
    vitest/@vitest/ui -> ^3 (the critical advisory), then a non-forced
    `npm audit fix` for the transitive four (brace-expansion,
    browserslist, nanoid, postcss). 12 vulns (1 critical, 7 high) -> 3
    moderate, and PROD-ONLY is now ZERO. All 232 tests pass on vitest 3
    with no test changes needed; tsc and build clean.
  - Change control: PARTLY FIXED 2026-09-20. supabase/ now exists with 4
    of 5 Edge Function sources recovered byte-for-byte from the live
    deployment, config.toml, and a README covering deploy/rollback and
    the exact CLI commands for the rest. STILL MISSING, and both need
    the CLI locally (supabase.com is outside the agent sandbox's allowed
    egress): (a) fpl-optimize-squad source -- `supabase functions
    download fpl-optimize-squad`; (b) the schema baseline itself --
    `supabase db dump` for public AND private schemas, committed, then
    `supabase migration repair --status applied`. Until (b) exists there
    is still no way to rebuild this database from the repo.

  - EDGE FUNCTION AUTH, newly confirmed from the recovered source: all 5
    are verify_jwt=false and the four ingest/backfill ones use the
    service-role key with NO auth of their own. Any anonymous caller can
    make the server scrape third-party sites and write rows. Cost/abuse
    rather than data integrity (idempotent upserts), but real.
      * ingest-football-results is a STUB -- it inserts a junk
        result_ingestion_runs row on every call and returns
        {status:'test'}. Nothing calls it. DELETE it rather than secure
        it; it is currently a public write endpoint doing nothing useful.
      * the three real ones are machine-called, so they want a shared
        webhook secret, not a JWT.
      * fpl-optimize-squad is meant to be public: input limits, rate
        limiting and caching, not auth.

### Judgement on sequencing
Do the two live holes as their own small commits BEFORE any games or
finance work. Everything else in that audit is real but not urgent, and
the Phase 3 migration-baseline work is the one worth doing early because
it gets harder every week.

---

## PRODUCT: GAMES LAYER (Save Our Club et al) — ASSESSED, NOT STARTED
Full brief retained separately. Position taken 2026-09-20:

  - Beat the Shark is the only one that reuses the existing model
    directly (fixtures + stored 1X2 from lambda/rho + get_model_accuracy).
    It is also the cheapest and the best fit for the "model transparency"
    story. Do it first, after the security holes.
  - Save Our Club should be prototyped as a SELF-CONTAINED FRONTEND with
    a local deterministic state machine and ~6 hard-coded events. No DB,
    no auth, no tables. The open question is whether the loop is FUN and
    that is answerable in a day of frontend work. Explicitly do NOT
    design its schema first.
  - Save Our Club must NOT reuse Dixon-Coles. Wrong model for the job:
    DC is calibrated on real PL-to-League-Two teams and needs real
    ratings; the game needs a cheap seeded scoreline generator from two
    fictional strength numbers. Reuse the PRESENTATION (vidiprinter) and
    the seeded-RNG discipline, not the model.
  - Today's 10 and Ask FixtureShark both depend on data/model quality
    being high enough to generate or answer from. They come after, not
    before, the core data work.
  - NO schema decisions needed now. app_users + Supabase auth already
    exist, so a future games account has a path; adding a user_id column
    to a game table later is trivial. Resist building a gamification
    platform.

---

## META: DATA AND CALCULATION FLOW (2026-09-22) — NEW

meta_flow_nodes / meta_flow_edges / meta_flow_history, plus the reading view
meta_flow_summary and meta_refresh_flow(). Structure is re-derived from the
catalogue (211 objects, 334 links); definitions are FINGERPRINTED, so history
records automatically when a view or function changes, appears or disappears.
Human columns (layer, purpose, refresh_note, commentary) are never overwritten
— write notes straight into meta_flow_nodes. Admin-only (RLS), second run
reports 0 changes. Run after schema work:  select * from meta_refresh_flow();

NOW AUTOMATIC: pg_cron job 'meta-refresh-flow-daily' at 05:45, after the
fixture refresh (04:15) and cup ingest (05:15). Admin page at /data-flow
(Admin menu → Data Flow): browse by layer, search, open an object for its
lineage and history, edit purpose/refresh/commentary, or refresh on demand.
Commentary edits are logged in the history by a trigger, with the editor's
email.

NOTE: the new tables/view/function were added to src/types/database.generated.ts
BY HAND (the Supabase CLI can't reach the network from the agent sandbox). The
next real regeneration will produce them from the database; nothing else to do.

## BROKEN FUNCTION FIXED (2026-09-22)

get_season_player_projections_json pointed at fpl_fixture_bonus_projection_v3,
dropped long ago; every call failed. Repointed at
fpl_fixture_bonus_montecarlo_v1 (667 players for GW6, 526 with a bonus).
Swept for the same problem: none. The check worth repeating after any
drop/rename is in the migration header — Postgres does NOT validate function
bodies when the objects they read change.

## BETTING RETURNS (2026-09-22) — SUPERSEDED, see Model Returns / Model Scorecard

get_betting_returns(edge, market, closing, best_price, stake, season) returns
bets / staked / returned / profit / ROI / hit rate / average odds / average
edge per selection. A bet is placed when the model beats the RAW implied
probability (margin included) by the edge threshold. Flat stakes.

First numbers (this season, 153 matches with both predictions and odds):
  1X2, 5% edge, best price, closing : 97 bets, -GBP44.70, ROI -4.6%
  1X2, 5% edge, MEDIAN price        : 83 bets, -GBP14.35, ROI -1.7%
  1X2, 10% edge, best price         : 24 bets, -GBP29.50, ROI -12.3%
  Over/under 2.5, 5% edge           : 109 bets, -GBP69.50, ROI -6.4%
NOT a verdict: ~100 bets says nothing against a bookmaker's margin.

STILL TO DO: the front-end page (controls for edge/market/price basis, the
table above, and a running profit line). And the historical refit, which is
what would make these numbers mean something -- odds go back to 2014 (1X2,
8 books) and 2019 (AH and OU2.5), but model fits only to June 2026.

## FPL WEEKLY HISTORY — DATA IS READY (2026-09-22)

fpl_player_gameweek_history now covers FIVE past seasons: 2021/22 19,531 rows
· 2022/23 19,584 · 2023/24 20,544 · 2024/25 20,217 · 2025/26 19,643, each
37-38 gameweeks and 537-570 players. Seasons 9-12 were already imported on
19 Sep; 2021/22 was added today once the slug bug below was fixed.

FIXED: player_identity.slug was NOT NULL with no default and no trigger, so
import_fpl_season failed for any new season. The table now fills its own slug
(migration 20260922214500).

CAUTION FOR NEXT TIME (my own error, twice in one task): pg_stat_user_tables
reports ESTIMATES -- it said fpl_player_gameweek_history had 0 rows when it
had 80,000. Count, don't trust n_live_tup. Likewise a multi-statement SQL call
returns only the LAST statement's result.

STILL TO BUILD: the weekly totals / distribution (min, max, mean, sd) for the
set-and-forget XIs across past seasons on SeasonXiPage. The maths already
exists and is tested: weeklyScores / weeklyDistribution in fplOptimizerApi,
used by the squad pages' Weekly view for the current season.

## SEARCH-PATH HARDENING 2026-09-22 — DONE

All 61 public functions that lacked a pinned search_path now have one
(migration 20260922194500). Verified: 20 representative functions return
results identical to a baseline taken first; the 7 trigger functions fire
cleanly on writes; backfill_fixture_predictions still refreshes 1,807
fixtures as owner AND as service_role. The 4 unaccent functions belong to
the extension and were left alone.

FOUND WHILE TESTING (pre-existing, not from this change):
get_season_player_projections_json is BROKEN — it selects from
fpl_fixture_bonus_projection_v3, which no longer exists (there is a v4).
Nothing calls it: it appears only in the generated types, not in app code or
workflows. Options: drop it, or repoint it at the v4 view. Needs Chris's
call before deleting anything.

Remaining advisor items (all judged acceptable): unaccent in public
(cosmetic, moving it risks search); 25 tables with RLS and no policy
(deny-all, correct for pipeline tables); is_admin() and fpl_gameweek_for_date
callable without signing in (deliberately narrow). Leaked-password
protection: ENABLED by Chris 2026-09-22.

## SECURITY ALERT 2026-09-22 (Supabase email) — CHECKED, ONE FIX

The email ("Table publicly accessible", dated 19 Sep) was already resolved by
the 21 Sep work: 0 tables without RLS, 0 anon-readable without RLS, 0
anon-writable. One real finding remained: fpl_full_season_projection_health_v1
(created after the audit) was SECURITY DEFINER — switched to invoker
(migration 20260922191613), verified 38 rows for a signed-in user.

STILL FOR CHRIS (one click, outstanding since the first audit): enable
leaked-password protection in Supabase → Authentication settings.
Housekeeping, unchanged: 61 functions without a pinned search_path; unaccent
in public; 25 tables with RLS on and no policy (deny-all — safe, they're
pipeline tables nothing should read directly).

## BEAT THE SHARK — PLAYTEST FEEDBACK (Chris, 2026-09-21)

Chris played as a Beginner. More comments to come; batch them before acting.

1. **Beginner felt lost.** Progressive disclosure alone isn't enough
   orientation -- needs a clearer "what am I doing and why" at the start
   and at each new idea.
2. **The vidiprinter and the league updates are too fast to follow.**
   Consider slower defaults (especially for Beginner), a speed control, and
   tap-to-continue or pause, so the 3pm results and table moves can be read.

## BEAT THE SHARK — ENGAGEMENT REVIEW (2026-09-21)

Measured (test harness, beginner manager, 250 words/min): a season is ~5,500
words (~22 min of reading) plus animations, for a game billed as "a season
in five minutes"; ~870 words before the first match; a beginner's 4th team
sheet (457 words, 27 buttons) is HEAVIER than a Data guru's (315) because
banners/tips were added on top; heaviest screens: January window ~575,
ending ~370, heat map ~320, stats ~285.

DONE (pacing, from the playtest): commentary slowed to reading pace (2.2s a
line for beginners, 1.6s otherwise; was 0.8-1.0s), 3pm results 2.6s each;
Slow/Normal/Fast control and "Skip to full time" / "Show all results"
(skipping never passes a half-time decision); the table no longer re-sorts
after every result -- it redraws once at the end with arrows since 3pm.
READING BUDGET ratchet in test/screens.cjs caps every screen and the season
at today's level, so nothing grows; lower the caps as screens are trimmed.

DONE (ten-minute season, Chris chose 10): "Why?" fold-outs on the heavy
screens; pre-season 360 -> 56 words (mission + target + Begin); Beginner
team sheet inverted (lessons fold after the match they're introduced);
January window (verdict-only targets, sell list folded); ending, heat map,
stats slimmed; Beginners open with the press conference (story first).
After the whistle: three calm screens, no timers -- the match (waits at
full time), the table, then the other results and what they did to the
table. Commentary ~3s a line for Beginners (2.2s normal). Dashboard only on
key screens; a one-line summary after each week.
MEASURED: a Beginner's season ~15 min of reading (was ~22) + ~3 min of
commentary. Largest screen 258 words (was ~575). Budget caps ratcheted
down to these levels.

TO DO toward ~10 minutes (~7 min reading): physio (~200 words x2), crisis
(~160 x2), the team sheet's prose around the pitch, and the opening screen
(194 words). Measure each with the budget check and ratchet it down.

## BEAT THE SHARK — DESIGN RULE: NO FLUFF (Chris, 2026-09-21)

A label, not a paragraph. No explanations of how the game works, no
strapline, no blurbs under buttons, no captions explaining a chart. If
something needs explaining, it's either obvious from play or it goes
behind "Why?". The reading-budget check (test/screens.cjs) enforces the
caps; ratchet them down with every cut.

Applied: opening screen 172 -> 25 words (title; "Win the league. The
Shark predicts 3rd."; Beginner / Intermediate / Advanced; Manager / Owner).
"Data guru" renamed Advanced. Pre-season: "Win the league" + the
prediction. Dashboard caption, star footnote and wordy table labels gone.

## BEAT THE SHARK — WIN THE LEAGUE (2026-09-21)

Chris: the aim is just to finish first; no over-complication or explanation.
DONE: one aim, win the league; the Shark predicts 3rd (every season). Top
two clubs 70/62 (were 78/64): competent manager wins ~15%, careless ~2-4%,
random ~2-3%, favourite ~63%. Header = league position + cash only; no
score. Ending = CHAMPIONS or your position + the Shark's prediction + table.
Money: in the red -> forced sale of your best player; below -GBP300k -> 3
points, once. Beginner: one either/or per full match (shape framed as
reading the opponent, no win %), no half-time decision; weeks with no
pre-match decision get one half-time sub choice (all manager levels).
Pre-season: an offer for your best player (was a venue question). Chief
Scout United renamed Shark Scout United. Checks recalibrated for the new
aim, reasons recorded. Beginner reading ~12.2 min (target ~7).

OPEN: owner balance (competent owners beat the target least; owners can't
pick the team); further word cuts (story events, cash crises).

## PRODUCT: FOOTBALL FINANCE PILLAR — ASSESSED, NOT STARTED
Full brief retained separately. Position taken 2026-09-20:

  - This is the most VALUABLE of the new ideas for SEO (evergreen,
    genuinely scarce, strong internal linking to existing club pages)
    and also by far the most EXPENSIVE, because the hard part is not
    schema, it is normalisation and provenance across clubs with
    different year ends, entity structures and filing detail.
  - It belongs in the existing architecture. Club identity should hang
    off the existing canonical teams table via a SEPARATE club-entity
    mapping (one club can have several Companies House entities over
    time, and a holding company is not the same legal entity as the
    playing club). Do not put company numbers on teams.
  - Recommended shape when it starts: HYBRID, not pure EAV and not a
    wide table. A narrow fact table keyed on (entity, financial_year,
    metric) with provenance columns, plus a derived/published view. A
    wide table will break on the first club that reports a line item
    nobody else does; pure EAV makes every page query painful.
  - Provenance is the thing that must exist FROM THE FIRST ROW:
    source_type (filed/official/reported/estimate), source_url,
    document_id, filing_date, currency, units, restates_id, confidence.
    Retrofitting provenance onto a populated finance table is the one
    genuinely painful change here.
  - Proof of concept should be SMALLER than the brief suggests: ~6 clubs
    across divisions (not all 20 PL), 5 years, ~15 variables, done by
    HAND first. Manual entry of 6x5 clubs answers "can these even be
    compared?" before any Companies House ingestion is written.
  - Do not start this before launch/SEO/data-quality work is done.

---

## AUDIT 2026-09-21 — findings and status

Read-only sweep after a heavy day of changes (game, finance, In the papers,
two AIs editing the same repo and database). Ranked:

1. **HIGH — the repo cannot rebuild the database. FIXED (2026-09-21).**
   supabase/schema/public.sql is a baseline of the whole public schema, built
   from the live catalogue: 79 functions, 85 tables, constraints, indexes,
   foreign keys, 42 views in dependency order, triggers, RLS, 69 policies,
   and every table/view/function privilege (REVOKE then GRANT, exactly as
   live). Scanned for secrets before committing (the repo is public): none.
   VERIFIED: restored into an empty PostgreSQL with zero errors, and
   supabase/schema/verify/fingerprint.sql -- 19 checks incl. which tables and
   functions anon/authenticated can read, write and call -- matched
   production exactly (whole-fingerprint md5 identical). The kit to repeat
   this is in supabase/schema/verify/. When the SUPABASE_DB_URL secret is
   added, the weekly workflow replaces this file with a true pg_dump.
   Not included: data, sequence positions, ownership, Supabase platform
   objects, pg_cron commands (names/schedules only).

2. **MEDIUM — admin diagnostics callable anonymously.** FIXED
   (migration 20260921120115): get_public_read_audit and
   get_data_integrity_report now admin/service-role only via wrappers over
   renamed _impl originals. Tested as anon (no execute), non-admin
   (42501 "admin only") and admin (all three work, Data Health unaffected).
   The advisor still lists the wrappers as "callable by signed-in users" —
   expected: it sees the grant, not the admin check inside. Accepted.
3. **MEDIUM — 16 publicly readable SECURITY DEFINER views** (advisor
   ERROR). Traced through view chains and row filters: nothing leaks today,
   every table reached is fully public. Fragile if a table is made private
   later. FIXED for 15 (migration 20260921120732), trialled first in a
   rolled-back transaction: identical row counts as anon and as a signed-in
   admin. EXCEPTION kept: team_home_away_adjustment_v1 stays definer -- it is
   the public face of a private experimental view (switching it broke it in
   the trial). The advisor will keep listing that one. Also noted:
   fpl_full_season_projection_health_v1 (signed-in/service only) is still
   definer -- not public, lower priority.
4. **LOW — check_auth_user_token_nulls callable by any signed-in user.**
   FIXED in the same migration as 2.
5. **LOW — pipeline health. INVESTIGATED, no fix needed.**
   - "fpl refresh failures (48h) = FAIL": cron job fpl-refresh-6-hourly
     failed at 19 Sep 18:17 and 20 Sep 00:17 UTC with "no unique or
     exclusion constraint matching the ON CONFLICT specification" on insert
     into fpl_players — during the 19–20 Sep table work (backups taken
     then). Every run since (6 in a row) succeeded. Self-clears once the
     failures age out of the 48h window. Cron failures never reach
     fpl_ingestion_runs, which is why only the health check saw them.
   - Timeouts on fixtures 51/55 (20 Sep 21:06 GitHub run): retries
     succeeded, all 22 upcoming fixtures refreshed. WATCH: if they recur,
     optimise the refresh query (a function-level statement_timeout would
     not help — the timeout applies to the outer REST call).
   - "gameweek history reconciles = WARN": 1 player in 2024–25. Historical;
     low priority.
6. **LOW — leaked-password protection off.** Dashboard toggle — Chris.
7. **HOUSEKEEPING** — 61 functions without a pinned search_path; unaccent
   in public; ~160 lint warnings (101 no-explicit-any, 38
   set-state-in-effect); 2 unused eslint-disable comments.
8. **PROCESS** — PRs for anything touching the database or shared files;
   every migration saved as a file under its RECORDED version (the MCP
   records its own timestamp — rename the file to match).

Confirmed clean: private finance and gameweek tables still private; 0
production npm vulnerabilities; 278 tests; no stale Newsroom/Transfer
Window names; upcoming projections fresh. Not yet checked: phone layout of
the finance pages and In the papers (needs a human eye).

## SANITY CHECK 2026-09-21 — nightly prediction refresh (FIXED)

The Daily Premier League Import failed 19–21 Sep at "Refresh fixture
predictions": service_role could not read team_home_away_adjustment_v1 and
team_strength_manual_override, which backfill_fixture_predictions() (security
invoker) needs. Future-fixture predictions went unrefreshed from the 18th.
Fixed by migration 20260921132413 (exactly those two grants, found by
iterating as service_role in a rolled-back transaction). WATCH: service_role
still lacks SELECT on 27 other public objects (a past re-grant appears to have
covered anon/authenticated only). None is needed by a current job; if a
pipeline starts failing with "permission denied", this is the likely cause.
Also noted: the 07:00 UTC FPL projections run hadn't appeared by 13:40 UTC on
21 Sep (GitHub scheduled runs can be delayed or dropped) -- watch.

## PRODUCT: TRIVIA — BACKLOG (from Chris, 2026-09-21)

**Where it lives:** questions are built in `src/lib/landingApi.ts` (one
`get…Trivia()` function per question, typed `TriviaFact`), and shown by
`src/components/TriviaCarousel.tsx` on the Football hub and theme hubs. No
database table — each question queries live data when the carousel loads.

1. **The comeback question is poor** (`getComebackTrivia`, ~line 326). It
   asks which of several 3–0 half-time comebacks happened *in the Premier
   League* — guessable without any knowledge, because people know which
   clubs are in the Premier League. Suggested: "Which of these teams came
   back from 3–0 down at half time to win?" with **every option correct**,
   and the reveal telling each club's story.
2. **Reveal the other options too.** After answering, show the data for
   every option, not just the right one — e.g. the most-common-scoreline
   question should show the percentage for each scoreline offered.
3. **Always one question on the latest gameweek's projections**, so the
   quiz refreshes itself weekly. It must **name the gameweek explicitly**
   ("Gameweek 5 projections…") — gameweeks are often midway through and
   "this week" is ambiguous across the site.
4. **Use the quiz to send people around the site.** Each reveal links to
   the page that holds the answer. Ideas:
   - "Whose price is most at risk of changing today?" → Bullpit
     (`/fpl/price-risk`)
   - "Which teams' next five gameweeks are easier than average?" → Fixture
     heat map (may lack data for this yet — check first)
   - "Who has the highest expected contribution from set pieces?" → Set
     piece takers (`/fpl/set-pieces`) — note this changes slowly, so it
     would go stale; rotate it rather than show it weekly

## Minor findings (2026-09-21)

- **"Sep" vs "Sept".** `Intl` date formatting with `en-GB` now spells
  September "Sept" in recent engines (Node, Chrome) and "Sep" in others.
  Public pages are unaffected — the shared `src/lib/formatDate.ts` uses
  fixed tables (and now has `formatShortDay`). Two admin pages
  (`TacticalRolesAdminPage.tsx`, `DataHealth.tsx`) still use
  `month: 'short'`; harmless, but inconsistent.
- **Merge order: `src/types/database.generated.ts`.** Both the finance PR
  (#3) and the In-the-papers PR regenerate it from the live database.
  Whichever merges second needs its copy regenerated (or the other side
  taken) — both come from the same live schema, so either is correct.

## Cleanup

- `admin_bootstrap_emails` still contains the owner's address. Harmless
  (it only applies at signup, and the account exists), but tidier
  removed.
- `buildMatchTrend()` in `api.ts` is now unused by any page — kept
  because it's small, pure and tested, and useful if a future view wants
  trend data. Delete if that never happens.
