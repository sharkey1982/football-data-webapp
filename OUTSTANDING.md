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

### One player has a NULL season_id
Mason Miley (Newcastle) — invisible on every FPL page, since they all
filter `season_id = 13`. Single row. Unknown whether the 6-hourly
ingestion caused it and would recreate it.

### Main bundle absorbed the Supabase client
`AuthProvider` wraps the whole app, so Supabase moved from its own
201KB chunk into the eager bundle (246KB → 450KB). Not 200KB of new
download — both loaded on any data-fetching page before — but it's no
longer parallelised or skippable. Revisit if load time matters.

---

## Deferred by decision

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

### Facts / Forecasts / Verdict naming
Discussed, not decided. Would become the headers on stage-level landing
pages, so settle it before building those.

### Stage-level landing pages — DONE
Eight pages (/football/discover ... /fpl/start/configure), all rendered
by one StagePage component from src/lib/journey.ts. Adding a link to a
stage is a config edit, not a code change.

### Football "Validate"
No dedicated page. Currently points at Team Strength's proj-vs-actual
columns with an on-page note saying so. FPL's equivalents (Actual
Matches, Optimal Squad So Far) are genuine backtests.

### Multi-user scenarios and leaderboard
Depends on auth (now exists) plus a scenario/owner dimension on every
override table and on generated predictions. The admin-identity model
was built to anticipate this: user-owned rows would add
`owner_id = auth.uid()` policies alongside the existing admin-only ones,
not replace them.

### IndexNow
Deliberately skipped while there was no crawlable content. Worth
reconsidering now that pages are prerendered and rebuilds are automatic.

### GW15–38 backfill
Paused.

### Tactical role data gap
438 of 658 players on generic fallback roles.

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
