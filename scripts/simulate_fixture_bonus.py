#!/usr/bin/env python3
# ============================================================================
# scripts/simulate_fixture_bonus.py
#
# Replaces get_fpl_fixture_bonus_v4()'s closed-form pairwise comparison
# (a symmetric normal/logistic approximation) with a genuine Monte Carlo
# simulation that samples from each player's actual Poisson goal/assist
# distribution. This matters specifically because goal-driven BPS is
# right-skewed -- bounded near the appearance-points floor, unbounded
# upside via a brace/hat-trick -- and a symmetric distribution doesn't
# capture that: validated directly (real GW6 Man City v Liverpool data)
# that widening a big favourite's SD symmetrically to reflect goal upside
# actually REDUCED their expected bonus (Haaland 2.02 -> 1.55), the
# opposite of the intended effect, because a wider symmetric distribution
# implies equally more downside as upside. Sampling from the true,
# right-skewed Poisson distribution instead correctly increased it
# (2.02 -> 2.04) in that same test case.
#
# For each player in a fixture:
#   baseline ~ Normal(baseline_mean, BASELINE_SD)   -- everything in
#     expected_bps_score that isn't goals/assists (tackles, passes,
#     recoveries, appearance points, etc) -- baseline_mean is backed out
#     as expected_bps_score minus the goal/assist contributions, since
#     the projection pipeline doesn't store this split directly.
#   goals ~ Poisson(expected_goals)
#   assists ~ Poisson(expected_assists)
#   total_bps = baseline + goals*goal_bps_value[position] + assists*9
#
# Ranks all players by total_bps per simulated draw, awards 3/2/1 to the
# top 3 (matching real FPL bonus rules), averages across draws. Requires
# SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.
# ============================================================================

import os
import sys
import argparse
import numpy as np
from supabase import create_client

GOAL_BPS_VALUE = {1: 12, 2: 12, 3: 18, 4: 24}
BASELINE_SD = 8.0  # matches the floor the old model's typical output implied for a non-goal-threat player
N_SIMS = 30000
RNG_SEED = 20260916  # fixed seed -- reproducible runs, not a security-relevant value


def simulate_fixture(rng: np.random.Generator, players: list[dict]) -> dict[int, float]:
    """players: list of {fpl_player_id, element_type, expected_bps_score, expected_goals, expected_assists}."""
    n = len(players)
    if n == 0:
        return {}

    goal_value = np.array([GOAL_BPS_VALUE.get(p["element_type"], 18) for p in players], dtype=np.float64)
    xg = np.array([max(0.0, p["expected_goals"] or 0.0) for p in players], dtype=np.float64)
    xa = np.array([max(0.0, p["expected_assists"] or 0.0) for p in players], dtype=np.float64)
    bps_mean = np.array([p["expected_bps_score"] or 0.0 for p in players], dtype=np.float64)
    baseline_mean = bps_mean - goal_value * xg - 9.0 * xa

    goals = rng.poisson(xg, size=(N_SIMS, n))
    assists = rng.poisson(xa, size=(N_SIMS, n))
    baseline = rng.normal(baseline_mean, BASELINE_SD, size=(N_SIMS, n))
    total = baseline + goals * goal_value + assists * 9.0

    # rank each simulated draw (row) descending; top-3 get 3/2/1
    order = np.argsort(-total, axis=1)
    bonus_points = np.zeros(n, dtype=np.float64)
    top_k = min(3, n)
    for rank in range(top_k):
        idx = order[:, rank]
        np.add.at(bonus_points, idx, [3, 2, 1][rank])
    bonus_points /= N_SIMS

    return {players[i]["fpl_player_id"]: float(bonus_points[i]) for i in range(n)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-matchweek", type=int, required=True)
    parser.add_argument("--to-matchweek", type=int, required=True)
    parser.add_argument("--league-id", type=int, default=1)
    parser.add_argument("--season-id", type=int, default=13)
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment.", file=sys.stderr)
        sys.exit(1)
    supabase = create_client(url, key)

    fixtures_resp = (
        supabase.table("fixtures")
        .select("fixture_id")
        .eq("league_id", args.league_id)
        .eq("season_id", args.season_id)
        .gte("matchweek", args.from_matchweek)
        .lte("matchweek", args.to_matchweek)
        .execute()
    )
    fixture_ids = [r["fixture_id"] for r in fixtures_resp.data]
    print(f"Simulating bonus for {len(fixture_ids)} fixtures (GW{args.from_matchweek}-{args.to_matchweek})")

    rng = np.random.default_rng(RNG_SEED)
    total_rows_written = 0

    for fixture_id in fixture_ids:
        bps_resp = (
            supabase.table("fpl_fixture_bps_projection_v1")
            .select("fpl_player_id, element_type, expected_bps_score")
            .eq("fixture_id", fixture_id)
            .execute()
        )
        if not bps_resp.data:
            continue
        player_ids = [r["fpl_player_id"] for r in bps_resp.data]

        proj_resp = (
            supabase.table("fpl_player_projections")
            .select("fpl_player_id, expected_goals, expected_assists")
            .eq("fixture_id", fixture_id)
            .eq("model_version", "leaguewide_v6")
            .eq("scenario_key", "baseline")
            .in_("fpl_player_id", player_ids)
            .execute()
        )
        proj_by_player = {r["fpl_player_id"]: r for r in proj_resp.data}

        players = []
        for r in bps_resp.data:
            proj = proj_by_player.get(r["fpl_player_id"])
            players.append(
                {
                    "fpl_player_id": r["fpl_player_id"],
                    "element_type": r["element_type"],
                    "expected_bps_score": float(r["expected_bps_score"]),
                    "expected_goals": float(proj["expected_goals"]) if proj else 0.0,
                    "expected_assists": float(proj["expected_assists"]) if proj else 0.0,
                }
            )

        bonus_by_player = simulate_fixture(rng, players)
        rows = [
            {"fixture_id": fixture_id, "fpl_player_id": pid, "expected_bonus_points": round(bonus, 6)}
            for pid, bonus in bonus_by_player.items()
        ]
        if rows:
            supabase.table("fpl_fixture_bonus_montecarlo_v1").upsert(rows, on_conflict="fixture_id,fpl_player_id").execute()
            total_rows_written += len(rows)

    print(f"Wrote {total_rows_written} rows across {len(fixture_ids)} fixtures.")


if __name__ == "__main__":
    main()
