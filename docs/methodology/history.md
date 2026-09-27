# Historical data layer

Built 27 Sep 2026 (step A0 of the Historical Analytics & Data Lab design). Three objects, refreshed together by `refresh_history_derived()` (pg_cron `refresh-history-derived`, 06:50 and 12:50 UTC, after the English and international imports).

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

Anon can read all three. The two build functions are service-role only.

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
- `games_in_season`, `clubs` and `comparable_group` (e.g. `20x38`, `22x42`);
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

## Refresh

`refresh_history_derived(p_force default false)`:
- rebuilds a league-season when its match count changed, a match was updated after the last build, or a deduction was added after it;
- then refreshes both materialised views concurrently.

Timing: a no-op run takes about 13 s (mostly the view refreshes); a full rebuild of all 381 league-seasons takes about 3 minutes.

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

`supabase/migrations/20260927202000_history_team_match_snapshot.sql`, `20260927203000_history_refresh_schedule_integrity_catalogue.sql`.
