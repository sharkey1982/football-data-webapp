# Provisional results (Premier League)

Added 25 Oct 2026 (migration `20261025130000_pl_provisional_results_from_fpl.sql`).

A Premier League result shows on the site within a minute or two of full time,
labelled **Provisional**, until the confirmed result (the `matches` table, from
football-data) arrives, usually the next morning.

## Where the score comes from

`fpl_live_tick` refreshes `fpl_live_fixtures` every minute. When FPL marks a game
`finished_provisional` (or `fpl_fixtures.finished`), `public.sync_pl_reported_from_fpl()`
copies its score into `fixtures.reported_home_goals / reported_away_goals` with
`reported_source = 'fpl_live'` and sets the fixture to `played`. It runs from
statement triggers on `fpl_live_fixtures` and `fpl_fixtures`; a failure is a
warning, never an error in the FPL refresh.

## Precedence

1. A confirmed result (`matches`, via `private.fixture_has_result`) always wins.
   The writer never touches a fixture that has one, and the site shows the
   confirmed score.
2. FPL fills `reported_*` only when it is empty or was written by FPL itself.
3. A score already reported by FixtureDownload is kept; FPL only marks the
   fixture played. FixtureDownload's daily run may overwrite an `fpl_live` score
   (it is the older, feed-matched source); both are display only.

## What reads it

- Shown: match page, team page results, gameweek browser, and the list under the
  league table ("N provisional results, not yet in this table").
- Not read: league tables, the model, history, facts and X posts. These use
  confirmed results only.

## Football League scores (Championship, League One, League Two)

Added 25 Oct 2026 (migration `20261025190000_efl_reported_scores_fwp.sql`).
FixtureDownload's 04:15 run often doesn't have Saturday's EFL scores by Sunday
morning, so `public.refresh_efl_reported_scores()` reads footballwebpages'
current month page for each division (last month's too in a month's first three
days) at 17:20, 22:20 and 06:20 UTC (cron `refresh-efl-reported-scores`,
logged in `fixture_refresh_runs` with competitions E1/E2/E3).

It writes `reported_*` with `reported_source = 'FootballWebPages'` only for a past
game that has no confirmed result and no score from another source (an empty
score, or one it wrote itself), and marks it played. It never moves kick-offs or
adds fixtures. FixtureDownload's daily run may later replace the score with its
own; both are display only. An unmapped club name fails the run with the name in
`error_message`: add a `team_aliases` row (source FootballWebPages).
