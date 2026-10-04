# NFL (phase 1, October 2026)

Schedule and results, standings and team pages for the NFL, built the same
way as the football section: one free source, a daily import that reconciles
against the file it read, views the site reads, and integrity checks.

## Source

nflverse, `github.com/nflverse/nfldata`:

- `data/games.csv`: every game since 1999 with scores, overtime, the closing
  spread and total, moneylines, venue, roof, surface, starting QBs and coaches.
  `gametime` is US Eastern; `spread_line` is positive when the HOME team is
  favoured (it lines up with `result` = home minus away).
- `data/teams.csv`: each team code's full name per season (Oakland Raiders,
  Washington Redskins / Football Team / Commanders, St Louis Rams, ...).

The repository has no licence file. nflverse publishes its data openly and
asks to be credited; the pages credit nflverse.

Seasons load from **2002**, the first season of the current 32-team,
8-division alignment, so every season shares the same divisions.

## Storage

Raw tables live in the `nfl` schema, which PostgREST does not expose:
`franchises` (32, keyed by current code), `team_codes` (adds OAK -> LV,
SD -> LAC, STL -> LA), `team_seasons` (name per code per season) and `games`
(keyed by the nflverse `game_id`). The site reads three `security_invoker`
views in `public`: `nfl_teams`, `nfl_games` and `nfl_standings`. The importer
writes only through `public.nfl_upsert_games` / `public.nfl_upsert_team_seasons`,
executable by `service_role` alone. A later file can never blank a score
already held.

## Daily import

`scripts/nfl_import.py`, workflow `nfl-import.yml`, 06:20 UTC: after Monday
Night Football and before the 07:00 FPL run rebuilds the site. After writing,
it re-reads `nfl_games` and requires games, scored games and total points per
season to match the file exactly; any difference fails the run. One
`pipeline_runs` row per run (`job_name = nfl_import`).

## Standings

Regular season only. Win % counts a tie as half a win.

**Division winners come from the play-off bracket**, not from the table.
Since 2002 every division winner is seeded above every wild card, so it either
hosts its wild-card game or has a bye (no wild-card game, then a divisional
game), and a wild card never does either. This gives exactly one winner per
division in every completed season. Ordering by win % alone named the wrong
winner in six division-seasons (2002 AFC East, 2008 AFC East, 2011 AFC West,
2023 NFC South, 2024 NFC West, 2025 NFC South).

Below the winner, and for a season in progress, teams level on win % are
ordered by division win %, then points difference. That is **not** the NFL's
tiebreak procedure (head-to-head, common games, strength of victory, ...),
so the order of tied teams can differ from the official standings; the pages
say so. Play-off result is the furthest round reached.

2022: Buffalo v Cincinnati (week 17) was not completed and is absent from the
source, so both teams played 16 games.

## Integrity checks

`public.check_nfl_integrity()`, run daily with the football checks by
`scripts/run_integrity_checks.py`:

| Check | Fails when |
|---|---|
| `nfl_results_fresh` | a game kicked off more than 2 days ago has no score |
| `nfl_standings_complete` | a completed season lacks 32 teams with the full schedule (17 games from 2021, 16 before; BUF and CIN 2022 allowed 16) |
| `nfl_games_mapped` | a game is missing from `nfl_games` (unmapped team code) |
| `nfl_division_winners` | a completed division-season lacks exactly one bracket winner |

## Pages

- `/nfl`: one week, kick-offs in UK time, the line, neutral-site venues;
  `?season=&week=` for any other week. Server-rendered at the current week.
- `/nfl/standings/:season` (2002 onwards): by division or the whole league,
  sortable. `/nfl/standings` redirects to the latest season.
- `/nfl/teams/:slug`: this season's games (with bye weeks) and every season
  since 2002 under the name the franchise played as.

About 58 static pages in all (hub, 25 standings, 32 teams), in the sitemap.
