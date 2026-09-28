# Model v market

Since 28 Sep 2026 match pages show the betting market's probabilities beside the model's, and say which has been more accurate. This follows experiment F1 (`docs/experiments.md`): on 2019/20-2024/25 English league matches the Dixon-Coles model added no usable information to the market's odds, so the market is shown as the stronger forecast rather than hidden.

## The market line

- **Source:** football-data.co.uk `fixtures.csv`, which carries pre-match odds for the next few days of fixtures (updated around Tuesday and Friday). `capture_upcoming_odds()` fetches it three times a day (pg_cron `capture-upcoming-odds`, 07:10, 13:10, 19:10 UTC) and stores every distinct price in `fixture_odds_snapshots` (append-only: 1X2, over/under 2.5 and Asian handicap for the market average, maximum, Bet365 and Betfair exchange).
- **Shown:** the latest market-average 1X2 price captured before kick-off (`fixture_market_latest`), with the bookmakers' margin removed proportionally (the F0 benchmark method).
- **Not shown:** anything captured after kick-off.

## Which is more accurate

`model_vs_market_by_league` compares the model's point-in-time predictions with the market-average closing odds on every played match that has both (`model_scorecard_matches`), by mean log loss (lower is better). The page states the comparison only with at least 100 matches in that league.

At launch: Premier League 1,190 matches, market 0.964 v model 0.989; Championship 1,732, 1.028 v 1.051; League One 1,712, 1.019 v 1.035; League Two 1,713, 1.041 v 1.063. National League has too few matches to state yet.

## Guard

`check_model_integrity()` 'upcoming_odds_fresh' warns when no prices have been captured for 8 days while fixtures are scheduled in the next fortnight. Each run is logged in `pipeline_runs` (job `capture-upcoming-odds`); an unmapped club name marks the run failed (add a `team_aliases` row with source `football-data.co.uk`).

Source: `supabase/migrations/20260928070000_upcoming_odds_capture.sql`.
