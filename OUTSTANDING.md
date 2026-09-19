# Outstanding work

Running record of known gaps, deferred decisions and things that need a
human. Kept in the repo rather than in a chat history so it survives the
conversation it came from.

Ordered roughly by value, not by effort.

---

## Needs you (blocked on a manual step)

### Netlify build hook — DONE
Verified end to end: an FPL pipeline run produced a Netlify deploy
titled "Deploy triggered by hook: Data pipeline refresh", on the same
commit (so a data rebuild, not a code change), regenerating exactly the
658 player pages and nothing else — match and team pages were untouched
because that pipeline doesn't affect them.

Prerendered pages now track the twice-daily FPL refresh and the 6am
daily-import, so the freshness timestamps they publish stay honest.

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

### Historic FPL season ingestion — NOW UNBLOCKED
The schema no longer prevents it. Still required:
  - a source. The FPL API serves only the current season, so this needs
    a third-party dataset (vaastav/Fantasy-Premier-League is the usual
    one, 2016/17 onward).
  - a season_id for the import, passed explicitly — the trigger only
    fills NULLs, so an explicit value wins and back-dated imports work.
  - fpl_code mapping, which that dataset carries, so players link to
    existing identities rather than creating duplicates.

### Main bundle absorbed the Supabase client
`AuthProvider` wraps the whole app, so Supabase moved from its own
201KB chunk into the eager bundle (246KB → 450KB). Not 200KB of new
download — both loaded on any data-fetching page before — but it's no
longer parallelised or skippable. Revisit if load time matters.

---

## Deferred by decision

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
