# NFL (October 2026)

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
| `nfl_fantasy_points_match` | our standard or PPR points differ from nflverse on a non-kicking player-week |
| `nfl_player_stats_fresh` | a scored game (2016+) older than 3 days has no player stats |
| `nfl_model_fresh` | a game kicking off in the next 48 hours has no model prediction from the last 36 hours |

## Structure (phase 2)

NFL is a third theme in `src/lib/journey.ts`, built exactly like Football and
Fantasy: a hub (`/nfl`), stage pages (`/nfl/discover`, `/nfl/fantasy`) and the
same page names for the same jobs (Chris: keep menu naming consistent):

| Stage | Page | URL |
|---|---|---|
| Discover | Fixtures & Results | `/nfl/fixtures` |
| Discover | TV Guide | `/nfl/tv-guide` |
| Discover | League Table | `/nfl/table` |
| Discover | Your Team | `/nfl/teams`, `/nfl/teams/:slug` |
| Discover | Past seasons | `/nfl/seasons`, `/nfl/seasons/:season` |
| Fantasy | Player Scout | `/nfl/players`, `/nfl/players/:slug` |
| Fantasy | Fixture Heat Map | `/nfl/fixture-heat-map` |
| Fantasy | Scoring Rules | `/nfl/scoring-rules` |

A test fails if an NFL page name is not also used by Football (Discover) or
Fantasy (the fantasy stage). The phase-1 `/nfl/standings/...` URLs 301 to
`/nfl/table` and `/nfl/seasons/:season`.

## Season stories

`src/lib/nflStory.ts` writes each season's story from results and closing
lines only: champion, route (division title or wild card) and conference
championships; best and worst records; most points scored and fewest
conceded; the longest winning run; the biggest upset (the largest spread a
winner was getting) and how many wins came from 7+ point underdogs; the
widest margin and highest-scoring game; and where the season's scoring ranks
since 2002. In-progress seasons say "so far" and add unbeaten and winless
teams. `public.nfl_season_summary` supplies the "Season in numbers"
fingerprint (points per game, home win rate, one-score games, favourites'
win rate, overtime). Team pages add the team's own season: finish, biggest
win and defeat, longest run, and the record against the closing spread.

## TV Guide

There is no terms-compliant per-game feed of UK NFL listings, and Football's
TV Guide deliberately does not scrape listings sites. `src/lib/nflWatch.ts`
applies the published UK rights for 2026/27 to each game instead and shows
them in Football's `WatchOptions` component:

- DAZN NFL Game Pass: every game, live.
- Sky Sports NFL (also through NOW): prime time (after 23:00 UK), every
  London and European game, the play-offs, the Super Bowl.
- 5 (free; also My5): the three London games and the Super Bowl.
- Sunday 18:00 and 21:25 windows: Sky and 5 pick games week by week, so the
  page says so and links to Sky's listings rather than guessing.

Sources and the date the rights were last checked are on the page; re-check
every season (`RULES_CHECKED`).

## Players and fantasy points

Source: nflverse-data releases `players/players.csv` (bios) and
`stats_player/stats_player_week_<season>.csv` (weekly stats), QB/RB/FB/WR/TE/K
from 2016, in `nfl.players` and `nfl.player_weeks` (67,108 player-weeks at
first load). The daily import loads the latest season; `--player-seasons`
backfills. Player slugs are assigned once and never change.

Fantasy points are computed in the database by `nfl.points_std` (standard;
half-PPR adds 0.5 a reception, PPR 1). Standard: pass yard 0.04, pass TD 4,
INT -2, rush/rec yard 0.1, rush/rec/return TD 6, two-point conversion 2,
fumble lost -2. Kickers (ESPN-style): FG 0-39 yds 3, 40-49 4, 50+ 5, miss -1,
PAT 1, missed PAT -1. Check `nfl_fantasy_points_match` requires our standard
and PPR points to equal nflverse's on every non-kicking player-week (61,492
at first load, 0 differences). Kicking is excluded from that check because
nflverse does not score it: Dare Ogunbowale's emergency field goal (2023 week
9) is 3 points here and 0 there.

Views: `nfl_player_weeks`, `nfl_player_seasons` (totals, points per game in
three formats, last-3 average, weekly spread), `nfl_points_allowed` (points
each defence gives up per game to each position; rank 1 = most), `nfl_players`.

Player pages show week-to-week consistency (25th percentile, median and 75th
percentile weekly points, and weeks at or above a startable line: QB 18, RB
12, WR 12, TE 9, K 8) and the next six opponents with their points allowed to
the position. Until every defence has played 4 games, matchups use the
previous season. Player pages are client-rendered and not in the sitemap
(about 2,000 players; the page-count policy).

Not yet: team defences (DST), injury reports, snap counts, projections.

## Modelling (Model Lab, from 4 Oct 2026)

Same protocol as football: experiments are registered in `lab_experiments`
(question, benchmark, decision rule, splits) before they run; results go to
append-only `lab_scorings`; the sealed holdout is scored once. NFL splits:
tuning 2010-2023, validation 2024, holdout 2025 + 2026; 2002-2009 is Elo
burn-in only. Scorer: `scripts/lab_nfl.py` (workflow Model Lab, jobs
`nfl_n0`, `nfl_n1`; `--dry` never computes the holdout). Results in
`docs/experiments.md`.

- **N0** fixed the benchmark: the closing moneyline, margin removed (basic).
- **N1** margin Elo: beats a home-field guess on the holdout (passes the
  display test), trails the market by about 0.02 nats a game and adds no
  information to it (null result as a market signal).

On the site: `scripts/nfl_elo.py` runs after the daily import with N1's
chosen settings (`nfl_elo_v1`: K 20, home advantage 45, regression 0.5) and
the experiment's own code (`lab_nfl.elo_walk`). Every unplayed game in the
next 8 days gets a row in append-only `nfl.model_predictions`, with the
market at that moment; Fixtures & Results shows the latest prediction made
before kick-off (`public.nfl_game_model`) beside the market. There are no
hindsight predictions: games before 4 Oct 2026 have none. The stored market
snapshots build the opening-to-closing line record for later work.

New game fields for modelling (in `nfl.games`; `public.nfl_lab_games`,
service role only): rest days, starting QB ids, temperature and wind, and the
prices on both sides of the spread and total.

Next candidates (each a registered experiment): a starting-QB adjustment,
efficiency ratings from nflverse play-by-play (EPA), rest and travel, weather
for totals.

## Static pages

About 62 server-rendered pages: Fixtures & Results, League Table, Your Team
and its 32 team pages, Past seasons and one page per season, Scoring Rules.
The hub, stage pages, TV Guide, Player Scout and Fixture Heat Map get head
tags only; player pages are client-only.
