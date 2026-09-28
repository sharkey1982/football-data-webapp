#!/usr/bin/env python3
# ============================================================================
# scripts/simulate_final_table.py
#
# Requested directly for the Team Strength page: projected final league
# position for every team in a league-type competition. For each remaining
# (status='scheduled') fixture, samples a scoreline from independent
# Poisson(predicted_home_goals)/Poisson(predicted_away_goals) draws -- the
# same predicted goals used everywhere else on the site -- awards standard
# 3/1/0 points, and combines with each team's already-accrued actual points
# from played matches. Repeats N_SIMS times, ranks the final table each time
# (points, then goal difference, then goals for -- standard English
# football tiebreakers), and records each team's finishing position.
#
# rho (the Dixon-Coles low-score correlation parameter) is NOT applied --
# independent Poisson sampling is a standard, well-justified simplification
# for a full-season aggregate; rho's effect on the final table is small
# relative to what adding it would cost in complexity.
#
# Two projections per league, stored side by side (method column):
#   market       remaining fixtures from team ratings read off closing market
#                prices (scripts/market_ratings.py) -- the headline on Team
#                Strength since Model Lab F4 passed (28 Sep 2026). Skipped for
#                a league until every team has 3 priced matches this season.
#   dixon_coles  remaining fixtures from fixtures.predicted_*_goals (the
#                site's model), shown beside it as "Model".
#
# Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.
# ============================================================================

import os
import sys
import argparse
from datetime import datetime, timedelta, timezone
import json
from datetime import date
import numpy as np
from supabase import create_client

sys.path.insert(0, os.path.dirname(__file__))
from market_ratings import lines_from_rows, market_ratings, WINDOW_DAYS  # noqa: E402

MARKET_MIN_PRICED_THIS_SEASON = 3

# Set inside main() once the client/run row exist; read by the __main__
# exception handler at the bottom of this file so a failure can be
# logged to pipeline_runs regardless of where it's thrown from.
_supabase = None
_pipeline_run_id = None

N_SIMS = 20000
RNG_SEED = 20260916  # fixed seed -- reproducible runs, not a security-relevant value

# Only round-robin league competitions have a "final position" to project --
# cup competitions are knockout, not applicable.
LEAGUE_IDS = [1, 2, 3, 4]


def market_lambdas(supabase, league_id, season_id, fixtures, team_ids):
    """Expected goals for every scheduled fixture from market ratings, or (None, reason)."""
    since = (date.today() - timedelta(days=WINDOW_DAYS)).isoformat()
    rows, start = [], 0
    while True:
        page = (supabase.table("market_closing_lines")
                .select("match_date, season_id, home_team_id, away_team_id, p_home, p_away, p_over")
                .eq("league_id", league_id).gte("match_date", since)
                .order("match_date").range(start, start + 999).execute().data or [])
        rows += page
        if len(page) < 1000:
            break
        start += 1000
    priced = {t: 0 for t in team_ids}
    for r in rows:
        if r["season_id"] == season_id:
            for t in (r["home_team_id"], r["away_team_id"]):
                if t in priced:
                    priced[t] += 1
    short = [t for t, c in priced.items() if c < MARKET_MIN_PRICED_THIS_SEASON]
    if short:
        return None, f"{len(short)} team(s) with fewer than {MARKET_MIN_PRICED_THIS_SEASON} priced matches this season"
    idx, c0, hfa, att, dfn = market_ratings(lines_from_rows(rows), date.today())
    lam = {}
    for f in fixtures:
        if f["status"] == "scheduled":
            h, a = idx[f["home_team_id"]], idx[f["away_team_id"]]
            lam[f["fixture_id"]] = (float(np.exp(c0 + hfa + att[h] - dfn[a])), float(np.exp(c0 + att[a] - dfn[h])))
    return lam, None


def simulate_league(supabase, league_id: int, season_id: int, rng: np.random.Generator, method: str = "dixon_coles"):
    # Teams actually in this league this season (a rating fit's window can
    # span past seasons, so the fixture list -- not the ratings table -- is
    # the source of truth for who's currently in it, same pattern used in
    # getTeamStrengthSummary).
    fixtures_resp = (
        supabase.table("fixtures")
        .select("fixture_id, home_team_id, away_team_id, status, predicted_home_goals, predicted_away_goals")
        .eq("league_id", league_id)
        .eq("season_id", season_id)
        .execute()
    )
    fixtures = fixtures_resp.data or []
    if not fixtures:
        return []

    team_ids = sorted({f["home_team_id"] for f in fixtures} | {f["away_team_id"] for f in fixtures})
    team_index = {tid: i for i, tid in enumerate(team_ids)}
    n_teams = len(team_ids)

    matches_resp = (
        supabase.table("matches")
        .select("home_team_id, away_team_id, full_time_home_goals, full_time_away_goals")
        .eq("league_id", league_id)
        .eq("season_id", season_id)
        .not_.is_("full_time_home_goals", "null")
        .not_.is_("full_time_away_goals", "null")
        .execute()
    )
    played = matches_resp.data or []

    current_points = np.zeros(n_teams, dtype=np.int64)
    current_gd = np.zeros(n_teams, dtype=np.int64)
    current_gf = np.zeros(n_teams, dtype=np.int64)
    current_played = np.zeros(n_teams, dtype=np.int64)

    for m in played:
        h, a = team_index.get(m["home_team_id"]), team_index.get(m["away_team_id"])
        if h is None or a is None:
            continue
        hg, ag = int(m["full_time_home_goals"]), int(m["full_time_away_goals"])
        current_gf[h] += hg
        current_gf[a] += ag
        current_gd[h] += hg - ag
        current_gd[a] += ag - hg
        current_played[h] += 1
        current_played[a] += 1
        if hg > ag:
            current_points[h] += 3
        elif hg < ag:
            current_points[a] += 3
        else:
            current_points[h] += 1
            current_points[a] += 1

    if method == "market":
        lam, reason = market_lambdas(supabase, league_id, season_id, fixtures, team_ids)
        if lam is None:
            print(f"::notice::League {league_id}: market projection skipped -- {reason}")
            return []
        remaining = [dict(f, predicted_home_goals=lam[f["fixture_id"]][0], predicted_away_goals=lam[f["fixture_id"]][1])
                     for f in fixtures if f["status"] == "scheduled"]
    else:
        remaining = [f for f in fixtures if f["status"] == "scheduled" and f["predicted_home_goals"] is not None]
    n_remaining = len(remaining)

    if n_remaining == 0:
        # Nothing left to simulate -- final table is just the current one.
        final_points = np.tile(current_points, (N_SIMS, 1)).astype(np.float64)
        final_gd = np.tile(current_gd, (N_SIMS, 1))
        final_gf = np.tile(current_gf, (N_SIMS, 1))
    else:
        home_idx = np.array([team_index[f["home_team_id"]] for f in remaining])
        away_idx = np.array([team_index[f["away_team_id"]] for f in remaining])
        lam_home = np.array([float(f["predicted_home_goals"]) for f in remaining])
        lam_away = np.array([float(f["predicted_away_goals"]) for f in remaining])

        sim_home_goals = rng.poisson(lam_home, size=(N_SIMS, n_remaining))
        sim_away_goals = rng.poisson(lam_away, size=(N_SIMS, n_remaining))

        home_win = sim_home_goals > sim_away_goals
        away_win = sim_away_goals > sim_home_goals
        draw = sim_home_goals == sim_away_goals

        points_home = np.where(home_win, 3, np.where(draw, 1, 0))
        points_away = np.where(away_win, 3, np.where(draw, 1, 0))

        final_points = np.tile(current_points, (N_SIMS, 1)).astype(np.float64)
        final_gd = np.tile(current_gd, (N_SIMS, 1)).astype(np.int64)
        final_gf = np.tile(current_gf, (N_SIMS, 1)).astype(np.int64)

        for i in range(n_remaining):
            h, a = home_idx[i], away_idx[i]
            final_points[:, h] += points_home[:, i]
            final_points[:, a] += points_away[:, i]
            gd_i = sim_home_goals[:, i] - sim_away_goals[:, i]
            final_gd[:, h] += gd_i
            final_gd[:, a] -= gd_i
            final_gf[:, h] += sim_home_goals[:, i]
            final_gf[:, a] += sim_away_goals[:, i]

    # Rank each simulated season: points desc, then GD desc, then GF desc
    # (standard English football tiebreakers). lexsort only supports
    # ranking by 1-D keys, so each simulated row is ranked separately.
    positions = np.zeros((N_SIMS, n_teams), dtype=np.int32)
    for s in range(N_SIMS):
        ranking = np.lexsort((-final_gf[s], -final_gd[s], -final_points[s]))
        positions[s, ranking] = np.arange(1, n_teams + 1)

    # Confirmed as a real bug: simulated_at was never included in the row
    # payload, relying on the column's own `default now()` -- which only
    # populates on a genuine INSERT. Once a row already exists (every run
    # after the first), the upsert's "on conflict do update" only touches
    # columns present in the payload, so simulated_at was silently left
    # at its original value forever, even though every other column
    # (projected_position_mean etc) really was updating each run. Set it
    # explicitly here so it's always part of the update.
    simulated_at = datetime.now(timezone.utc).isoformat()

    results = []
    for tid, idx in team_index.items():
        pos_counts = np.bincount(positions[:, idx], minlength=n_teams + 1)[1:]
        pos_dist = {str(p + 1): float(pos_counts[p]) / N_SIMS for p in range(n_teams)}
        results.append(
            {
                "league_id": league_id,
                "season_id": season_id,
                "team_id": tid,
                "method": method,
                "projected_points_mean": round(float(final_points[:, idx].mean()), 2),
                "projected_position_mean": round(float(positions[:, idx].mean()), 2),
                "projected_position_median": int(np.median(positions[:, idx])),
                "current_actual_points": int(current_points[idx]),
                "current_played": int(current_played[idx]),
                "position_distribution": pos_dist,
                "n_simulations": N_SIMS,
                "simulated_at": simulated_at,
            }
        )
    return results


def main():
    parser = argparse.ArgumentParser()
    # Default: the current season from the database (docs/season-rollover.md).
    parser.add_argument("--season-id", type=int, default=None)
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment.", file=sys.stderr)
        sys.exit(1)
    supabase = create_client(url, key)
    if args.season_id is None:
        args.season_id = supabase.rpc("current_season_id").execute().data
        if not args.season_id:
            sys.exit("Could not resolve the current season (current_season_id() returned nothing).")

    # Logged to pipeline_runs so this shows up in the app's status view --
    # requested directly ("I still don't feel clear on how I actually know
    # things have run, including fantasy updates"): this script had never
    # logged anywhere before.
    global _pipeline_run_id, _supabase
    _supabase = supabase
    run = (
        supabase.table("pipeline_runs")
        .insert({"job_name": "simulate_final_table", "status": "running"})
        .execute()
    )
    _pipeline_run_id = run.data[0]["run_id"]

    rng = np.random.default_rng(RNG_SEED)
    total_rows = 0
    written_by_method = {}
    market_failures = []
    for league_id in LEAGUE_IDS:
        for method in ("dixon_coles", "market"):
            if method == "market":
                # New in Sep 2026: a failure here must never cost the
                # Dixon-Coles projection, so it is logged and skipped.
                try:
                    rows = simulate_league(supabase, league_id, args.season_id, rng, method)
                except Exception as e:  # noqa: BLE001
                    print(f"::warning::League {league_id}: market projection failed -- {e}")
                    market_failures.append(f"league {league_id}: {e}")
                    continue
            else:
                rows = simulate_league(supabase, league_id, args.season_id, rng, method)
            if not rows:
                print(f"League {league_id} ({method}): nothing written")
                continue
            # The upsert's own response is checked: supabase-py can return an
            # error inside the response rather than raising, and a run once
            # reported success while nothing was written.
            result = (supabase.table("team_finishing_position_projection")
                      .upsert(rows, on_conflict="league_id,season_id,team_id,method").execute())
            written = len(result.data) if result.data else 0
            print(f"::notice::League {league_id} ({method}): upsert returned {written} rows (sent {len(rows)})")
            if written != len(rows):
                raise RuntimeError(f"League {league_id} ({method}): upsert returned {written} rows but {len(rows)} were sent -- write did not fully succeed")
            total_rows += len(rows)
            written_by_method[method] = written_by_method.get(method, 0) + len(rows)

    summary = (f"{total_rows} team row(s) written across {len(LEAGUE_IDS)} league(s): "
               + ", ".join(f"{m} {n}" for m, n in sorted(written_by_method.items())))
    print(f"Wrote {total_rows} rows total.")
    print(f"::notice::{summary}")
    if market_failures:
        summary += "; market projection failed for " + "; ".join(market_failures)
    supabase.table("pipeline_runs").update(
        {"finished_at": "now()", "status": "warning" if market_failures else "success", "summary": summary}
    ).eq("run_id", _pipeline_run_id).execute()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        for line in tb.splitlines():
            print(f"::error::{line}")
        if _supabase is not None and _pipeline_run_id is not None:
            _supabase.table("pipeline_runs").update(
                {"finished_at": "now()", "status": "failed", "error_message": str(e)}
            ).eq("run_id", _pipeline_run_id).execute()
        raise
