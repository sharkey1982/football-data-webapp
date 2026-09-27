# Historical data layer

Built 27 Sep 2026 (step A0 of the Historical Analytics & Data Lab design), extended the same day for Phase A (What Happened Next?, Historic Pace, table reliability). Five objects; the table and four views are refreshed together by `refresh_history_derived()` (pg_cron `refresh-history-derived`, 06:50 and 12:50 UTC, after the English and international imports).

## What it answers

- Where a team stood after every league match of every season on file: its record, points and position.
- Each season's final table with its outcomes (champion, top four, top six, promoted, relegated).
- Each league-season's character: scoring, home advantage, thresholds, competitive balance.

## Objects

| Object | Grain | Kind |
|---|---|---|
| `team_match_snapshot` | league, season, team, matches played | table (about 278k rows) |
| `team_season_summary` | league, season, team | materialised view over `league_standings` |
| `league_season_summary` | league, season | materialised view |
| `league_pace_benchmarks` | league, comparable group, matches played, outcome | materialised view |
| `league_table_reliability` | league, comparable group, matches played | materialised view |
| `history_what_happened_next()` | team-season after N matches | read-only RPC (security invoker, max 2,000 rows) |

Anon can read all five. The two build functions are service-role only.

## Method

### `team_match_snapshot`

For each league match with a full-time score, one row per side, ordered by date then `match_id`.

- **Cumulative record:** W/D/L, goals for and against, goal difference, points won (3/1/0).
- **Deductions:** a `point_deductions` row counts from its `effective_date`. An undated deduction, or one dated after the team's last match, counts from the team's latest row. So the latest row always equals `league_standings`, and in-season positions only reflect deductions once they applied.
- **`position_on_date`:** the team's position in the real table after all of that date's matches. Every team in the season is ranked; a team yet to play counts as 0 points.
- **`position_at_played`:** the team's rank among every team's record after the same number of matches. This is the like-for-like basis for "after N matches" questions, because postponements make the real table uneven.
- **Order:** points, then goal difference, then goals scored. The Football League (tiers 2-4) used goals scored before goal difference up to 1998/99, as `league_standings` does. Ties share a rank (`rank()`); no name tie-break.
- **Split-format seasons** (`league_season_formats.format = 'split'`) are raw totals over every game, with no halving or locked groups. Their official table is in `league_standings`.

### `team_season_summary`

`league_standings` for league competitions, plus:
- `games_in_season`, `clubs` and `comparable_group`: clubs x a double round robin (`20x38`, `24x46`), so the current season falls in the same group as the finished seasons it is compared with;
- `split_format`;
- `champion`, `top_four`, `top_six` (final seasons only);
- `next_league_id`, `relegated` and `promoted`:
  - **England (league_id 1-5):** read from where the club plays next season. A tier 1-4 club absent from the data next season (dropped below the National League before 2004/05, expelled, or re-formed as another team such as Wimbledon in 2004) is NULL, not guessed. A National League club absent next season is relegated.
  - **Elsewhere:** only top flights are loaded, so `relegated` means absent next season.
  - NULL for the current season, or when next season is not loaded.

### `league_season_summary`

Per league-season:
- scoring: goals per game (home, away and total), H/D/A shares, 0-0 share, clean-sheet share, average winning margin;
- home advantage: home minus away points per game;
- thresholds: champion points and PPG, highest relegated points, lowest safe points, points spread;
- balance: standard deviation of PPG, and Noll-Scully (standard deviation of win share with draws as half, divided by 0.5/sqrt(games));
- flags: `is_final`, `curtailed`, `split_format`, `covid_affected` (seasons starting 2019 and 2020), `half_time_coverage`, `stats_coverage`.

### Phase A: comparisons by matches played

All three use complete finished seasons only: `is_final`, not `curtailed`, not `split_format`. They compare seasons of the same `comparable_group`, by matches played rather than gameweek or date.

- **`league_pace_benchmarks`:** points after N matches for all clubs, champions, top four, top six and relegated clubs: count, p10/p25/p50/p75/p90, min, max, mean.
- **`league_table_reliability`:** per season and N, the correlation between `position_at_played` and final position, the average absolute gap between them, and the share of clubs already in their final position; then averaged over seasons (seasons with fewer than 4 clubs at N are skipped).
- **`history_what_happened_next()`:** every team-season after N matches, filtered by position range, points range, start-year range and comparable group, with how it finished.

Pages: `/football/history` (hub; reliability numbers server-rendered into the HTML), `/football/history/what-happened-next` (query in the URL, every share shown as k of n), `/football/history/pace` (percentile ranks count ties as half).

### League and season pages

`/football/leagues`, `/football/leagues/:league` and `/football/leagues/:league/:season` read `team_season_summary` and `league_season_summary`, and are written as full static HTML at build (`generate-static.mjs`, four bulk queries) and listed in the sitemap.

- Season URLs use `1995-96`; Allsvenskan, Eliteserien and Veikkausliiga are played in a calendar year, so theirs use `2024` (stored under start_year 2024). Other forms redirect to the canonical one.
- Division names are those of the time (`league_season_display_names`): "First Division 1995/96", now the Championship.
- Outside England only top flights are loaded, so a club is "not in the league next season" rather than "relegated".
- Season-in-numbers averages use the league's complete seasons (not curtailed, not the current one); points thresholds only seasons with the same number of clubs.

### Club season pages

`/football/teams/:slug/:season` (e.g. `/football/teams/sunderland/1995-96`): the club's finish and record, time at the top, highest and lowest position, longest runs (wins in a row, unbeaten, without a win), position after each match (`position_on_date`), points against the middle half of champions' and relegated clubs' points at the same stage (`league_pace_benchmarks`, same league size), and every result. Static HTML and sitemap entries for English leagues (about 3,800 pages); other leagues render in the browser. Generated last, from one snapshot query per league-season, inside a time budget so a slow database only costs these pages.

### Record Book

`/football/records` and `/football/records/:league` (static HTML, sitemap).

- **`history_streaks`** (materialised view): every run of 3+ consecutive league matches won, unbeaten, without a win, lost, scoring, keeping a clean sheet or without scoring. Runs continue across consecutive seasons in the same league and end when the club spends a season in another division (so Sunderland's 2003 and 2005 Premier League defeats are two runs, not one). `ongoing` = still running this season; `truncated_start` = began at the club's first match of the league's first season on file, so it may be longer.
- **`history_league_matches`** (view): one row per league match with total goals and margin.
- **`history_record_streaks(league, limit)`** and **`history_record_matches(league, limit)`**: top N with shared ranks for ties.
- Season records use complete seasons only (not curtailed, not split format) and rank by the per-game rate; points are after deductions. "Most points by a relegated club" is English leagues only.
- Checked at build against known records: Arsenal 49 unbeaten (2003-04), Manchester City and Liverpool 18 wins in a row, Derby 32 without a win (2007/08), Sunderland 15 defeats (2002/03), Manchester United 14 clean sheets, Arsenal 55 matches scoring, Portsmouth 7-4 Reading, four 9-0 wins.
- League season pages add "Where this season ranks": goals per game against every complete season, champions' points and the best relegated total against seasons with the same number of clubs.

### League Lab and Scoreline Explorer

- **League Lab** (`/football/history/trends`, Premier League; `/football/history/trends/:league` for the others): goals per game, home/draw/away shares, home advantage (home minus away points per game), champions' and best relegated club's points per game (English leagues; split formats left out), and Noll-Scully, season by season from `league_season_summary`. The opening compares the first and last five complete seasons on file (fewer if the league has fewer), leaving out curtailed and Covid-affected (2019/20, 2020/21) seasons.
- **Scoreline Explorer** (`/football/history/scorelines`): `history_scorelines(league, from, to, team, venue)` counts each scoreline, goals capped at 5 ("5+"), with win/draw/loss taken from the full score. With no club it is the home side's view; with a club, that club's goals first. Filters live in the URL; only the unfiltered page is a search page.
- League season pages show "Where this season ranks" only when the season is among the three highest or lowest, and not shared with more than two other seasons.

## Refresh

`refresh_history_derived(p_force default false)`:
- rebuilds a league-season when its match count changed, a match was updated after the last build, or a deduction was added after it;
- then refreshes the four materialised views concurrently.

Timing: a no-op run takes about 15 s (mostly the view refreshes); a full rebuild of all 381 league-seasons takes about 3 minutes.

Run it with `true` after changing a deduction's effective date or a team mapping.

## Checks

`check_model_integrity()` → `history_snapshot_reconciles` fails if any team's latest snapshot row differs from `league_standings` in played, W/D/L, goals or points (split formats excluded).

Checked at build:
- **Records:** 6,495 team-seasons, 0 differences.
- **Final positions:** on the season's last match date, `position_on_date` equals the official position for all 5,268 comparable rows, except two genuine ties that `league_standings` orders by name.
- **Premier League relegations:** 103 over 34 seasons (3 a season, 4 in 1994/95).
- **Championship relegations and promotions:** 4 relegated and 2 promoted in 1994/95, as when the Premier League shrank to 20 clubs.

## Caveats

1. Split-format seasons: in-season positions ignore the split and the halving.
2. Curtailed seasons (EFL tiers 3-5 2019/20 and others) end early: `position_at_played` has fewer teams at high match counts.
3. Positions on a date count teams that have not played yet as 0 points. That matches a real table early in a season, but not a table with postponed games in hand.
4. `relegated` outside England is "absent next season", which includes dissolved clubs.
5. Wimbledon 2003/04 is shown as relegated = NULL, because the club reappears as a different team (MK Dons).

## Source

`supabase/migrations/20260927202000_history_team_match_snapshot.sql`, `20260927203000_history_refresh_schedule_integrity_catalogue.sql`, `20260927210000_history_phase_a_rpcs.sql`, `20260927211000_history_phase_a_catalogue.sql`, `20260927220000_history_streaks_and_matches.sql`, `20260927221000_history_record_rpcs.sql`, `20260927224000_history_scorelines.sql`, `20260927224500_history_scorelines_outcome.sql`.
