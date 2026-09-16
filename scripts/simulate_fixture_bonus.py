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
# capture that.
#
# Second iteration: clean-sheet BPS is now modelled as ONE shared,
# correlated Bernoulli draw per TEAM per simulated fixture, not
# independent noise per player. This matters because in reality a clean
# sheet either happens for the whole defence or it doesn't -- treating
# 15-20 defenders across both teams as independently noisy (the first
# version's approach) meant the simulated "maximum of many independent
# draws" could spuriously outscore even a dominant striker fairly often,
# which is why that version under-served Haaland-type players relative to
# both the old model and his real season record. Confirmed directly (same
# real GW6 Man City v Liverpool fixture, all 69 rostered players, not a
# truncated pool) that this version recovers a sensible ~2.05 for Haaland
# -- in line with his actual bonus history (0, 3, 3, 3 across his first
# four games) -- and that a synthetic high-clean-sheet-probability team
# correctly shows correlated bonus clustering across its defenders (four
# defenders on a team at 75% clean sheet probability collectively claim
# ~5.2 of the match's 6 available bonus points), which the old
# independent-noise version could not produce.
#
# The non-clean-sheet "residual" BPS component (tackles, passes,
# recoveries, appearance points -- everything expected_bps_score contains
# that isn't goals/assists/clean-sheet) uses a position-specific SD
# empirically estimated from real fpl_player_gameweeks data, with
# clean-sheet variance now properly excluded from that estimate (previously
# it wasn't, which inflated defender noise further on top of the
# independent-per-player clean sheet issue): GK 7.32, DEF 7.64, MID 5.91,
# FWD 4.56.
#
# For each player in a fixture:
#   residual ~ Normal(residual_mean, RESIDUAL_SD_BY_POS[position])
#   goals ~ Poisson(expected_goals)
#   assists ~ Poisson(expected_assists)
#   clean_sheet_contribution = (team's shared Bernoulli(clean_sheet_prob)
#     draw for this simulation) * min(1, expected_minutes/60) * 12, for
#     GK/DEF only, 0 otherwise
#   total_bps = residual + goals*goal_bps_value[position] + assists*9 + clean_sheet_contribution
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
RESIDUAL_SD_BY_POS = {1: 7.32, 2: 7.64, 3: 5.91, 4: 4.56}
N_SIMS = 30000
RNG_SEED = 20260916  # fixed seed -- reproducible runs, not a security-relevant value


def simulate_fixture(rng: np.random.Generator, players: list[dict]) -> dict[int, float]:
    """players: list of {fpl_player_id, element_type, team_id, expected_bps_score,
    expected_goals, expected_assists, expected_minutes, clean_sheet_probability}."""
    n = len(players)
    if n == 0:
        return {}

    element_type = np.array([p["element_type"] for p in players])
    team_id = np.array([p["team_id"] for p in players])
    goal_value = np.array([GOAL_BPS_VALUE.get(p["element_type"], 18) for p in players], dtype=np.float64)
    xg = np.array([max(0.0, p["expected_goals"] or 0.0) for p in players], dtype=np.float64)
    xa = np.array([max(0.0, p["expected_assists"] or 0.0) for p in players], dtype=np.float64)
    bps_mean = np.array([p["expected_bps_score"] or 0.0 for p in players], dtype=np.float64)
    exp_min = np.array([p["expected_minutes"] or 0.0 for p in players], dtype=np.float64)
    cs_prob = np.array([p["clean_sheet_probability"] or 0.0 for p in players], dtype=np.float64)
    residual_sd = np.array([RESIDUAL_SD_BY_POS.get(p["element_type"], 6.0) for p in players], dtype=np.float64)

    is_def_or_gk = np.isin(element_type, [1, 2])
    cs_minutes_factor = np.clip(exp_min / 60.0, 0, 1)
    cs_mean_contribution = np.where(is_def_or_gk, cs_prob * cs_minutes_factor * 12.0, 0.0)
    residual_mean = bps_mean - goal_value * xg - 9.0 * xa - cs_mean_contribution

    # One shared Bernoulli(clean_sheet_prob) draw per team per simulation --
    # every eligible player on that team gets the SAME draw, not their own
    # independent one, since a clean sheet is a shared team outcome.
    cs_actual = np.zeros((N_SIMS, n), dtype=np.float64)
    for t in sorted(set(team_id.tolist())):
        mask = team_id == t
        team_prob = float(cs_prob[mask][0]) if mask.any() else 0.0
        draw = rng.random(N_SIMS) < team_prob
        contribution = np.where(is_def_or_gk[mask], cs_minutes_factor[mask] * 12.0, 0.0)
        cs_actual[:, mask] = draw[:, None] * contribution[None, :]

    goals = rng.poisson(xg, size=(N_SIMS, n))
    assists = rng.poisson(xa, size=(N_SIMS, n))
    residual = rng.normal(residual_mean, residual_sd, size=(N_SIMS, n))
    total = residual + goals * goal_value + assists * 9.0 + cs_actual

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
        # The view now carries everything needed in one query -- no second
        # fetch against fpl_player_projections required.
        bps_resp = (
            supabase.table("fpl_fixture_bps_projection_v1")
            .select("fpl_player_id, element_type, team_id, expected_bps_score, expected_minutes, expected_goals, expected_assists, clean_sheet_probability")
            .eq("fixture_id", fixture_id)
            .execute()
        )
        if not bps_resp.data:
            continue

        players = [
            {
                "fpl_player_id": r["fpl_player_id"],
                "element_type": r["element_type"],
                "team_id": r["team_id"],
                "expected_bps_score": float(r["expected_bps_score"]),
                "expected_minutes": float(r["expected_minutes"]),
                "expected_goals": float(r["expected_goals"]) if r["expected_goals"] is not None else 0.0,
                "expected_assists": float(r["expected_assists"]) if r["expected_assists"] is not None else 0.0,
                "clean_sheet_probability": float(r["clean_sheet_probability"]) if r["clean_sheet_probability"] is not None else 0.0,
            }
            for r in bps_resp.data
        ]

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
    try:
        main()
    except Exception:
        import traceback
        tb = traceback.format_exc()
        # GitHub Actions error annotation -- surfaces via the check-run
        # annotations API even when the raw log blob storage isn't reachable.
        for line in tb.splitlines():
            print(f"::error::{line}")
        raise
