# Outstanding work

Running record of known gaps, deferred decisions and things that need a
human. Kept in the repo rather than in a chat history so it survives the
conversation it came from.

Ordered roughly by value, not by effort.

---

## Needs you (blocked on a manual step)

### Netlify build hook for rebuild-on-refresh
Both data pipelines now try to trigger a site rebuild when they finish,
but the secret doesn't exist yet, so the step logs a notice and skips.

Until this is done, prerendered pages show data as of the last deploy
while simultaneously displaying "Projections updated <timestamp>" — so
the freshness claim on the page can drift from reality.

1. Netlify → Site configuration → Build & deploy → Build hooks → Add
2. Copy the URL
3. GitHub → Settings → Secrets and variables → Actions → new secret
   named `NETLIFY_BUILD_HOOK_URL`

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

### FPL projections keep no history
`refresh_fpl_projection_fixture_v6` upserts with `on conflict ... do
update`, so a projection is overwritten in place. `generated_at` only
ever shows the latest refresh, and there is no record of what was
projected before.

Football predictions do NOT have this problem —
`backfill_fixture_predictions()` deliberately never touches a played
fixture, so the stored value stays a genuine pre-kickoff forecast.

This blocks honest model-accuracy reporting on the FPL side, which the
AI/search audit flagged as a differentiator (data nobody can recreate
retrospectively). Smallest fix: an `on conflict do nothing` variant that
inserts a new row, or a history table fed by a trigger.

### No team pages
`/football/teams/:slug` currently renders TeamExplorer — a heavy
interactive page never designed for injected data, so it can't be
prerendered the way player and match pages are.

Needs a purpose-built semantic team page following the
PlayerPage/MatchPage pattern, with TeamExplorer staying at `/teams` as
the interactive tool.

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

### Naming: Browse → Explore, and a stage-based nav accordion
Low impact, but one real interaction: the back-to-hub link derives
"which theme am I in" from nav group labels `Football`/`Fantasy`. A
stage-based regroup removes that signal and would need an explicit
route→theme map. It would fail silently, so do it deliberately.

### Facts / Forecasts / Verdict naming
Discussed, not decided. Would become the headers on stage-level landing
pages, so settle it before building those.

### Stage-level landing pages
One per Explore/Predict/Validate/Configure, below the theme hubs. Held
pending the naming decision above.

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
