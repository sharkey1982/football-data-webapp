#!/usr/bin/env python3
# ============================================================================
# scripts/fit_dixon_coles.py
#
# Fits the Dixon-Coles model for one league from completed matches already
# in Supabase, and writes the result as a new model_fit_runs row plus one
# team_ratings row per genuinely-fitted team.
#
# This MUST stay mathematically consistent with src/lib/dixonColes.ts and
# the backfill_fixture_predictions()/backfill_historic_fixture_predictions()
# Postgres functions, which all share this exact parametrisation:
#
#   lambda_home = exp(home_advantage + attack_home - defence_away)
#   lambda_away = exp(attack_away - defence_home)
#
# and the same Dixon-Coles low-score correction tau(x, y):
#   tau(0,0) = 1 - lambda_home*lambda_away*rho
#   tau(0,1) = 1 + lambda_home*rho
#   tau(1,0) = 1 + lambda_away*rho
#   tau(1,1) = 1 - rho
#   tau(x,y) = 1 otherwise
#
# If you change either formula here, change it in both other places too, or
# a fit will silently stop matching what the frontend/backfill functions
# compute from it.
#
# Identifiability: this parametrisation has exactly one spare degree of
# freedom -- adding the same constant c to every team's attack AND defence
# value leaves both lambda_home and lambda_away unchanged for every
# fixture, home_advantage included. (Shifting attack alone, or attack and
# defence by different amounts, does NOT leave the likelihood invariant --
# only a shared shift to both does.) We fix this by recentring so the mean
# attack_strength across fitted teams is exactly 0, applying that same
# shift to defence_strength, after optimisation.
#
# Only teams with at least one completed match in the fitting window get a
# genuine fitted rating here. Teams with zero matches in-window (freshly
# promoted, no top-flight history yet) are deliberately left out --
# scripts/estimate_promoted_team_ratings.py handles those separately by
# deriving an estimate from their rating in the division below, rather
# than this script inventing a number for a team it has no data on.
#
# Usage:
#   python scripts/fit_dixon_coles.py --league-code E0
#   python scripts/fit_dixon_coles.py --league-code E0 --dry-run
#
# Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment. Never
# expose SUPABASE_SERVICE_KEY to the Vite frontend -- this only ever runs
# server-side (locally, or via GitHub Actions).
# ============================================================================

import argparse
import json
import os
import sys
from datetime import date, timedelta

import numpy as np
from scipy.optimize import minimize
from scipy.special import gammaln
from supabase import create_client

HALF_LIFE_DAYS = 180.0
WINDOW_DAYS = 730  # "approximately the previous two years", matching the existing fit_run_id=2 window length
RHO_BOUNDS = (-0.4, 0.4)
HOME_ADV_BOUNDS = (-2.0, 2.0)
STRENGTH_BOUNDS = (-5.0, 5.0)

# A team with very few matches in-window is not just "noisy" -- if those
# few matches happen to be extreme (e.g. scoreless in all of them), the
# Poisson MLE for that team's attack strength has no finite optimum: the
# likelihood keeps improving as attack_strength -> -infinity, so the
# optimiser just races to whatever numeric bound it's given and stops
# there. That single degenerate value then contaminates every OTHER
# team's rating too, because the post-fit identifiability shift (see
# below) is a shared constant computed from the mean across ALL fitted
# teams. A team below this threshold is therefore excluded from the
# direct fit entirely -- its matches are dropped from the fitting
# dataset -- and left for estimate_promoted_team_ratings.py to handle via
# the division-below estimate, exactly as a team with zero matches
# already is. 10 matches (~a quarter of a season) is enough for a stable
# fit in practice without being so high it defers real signal for
# newly-promoted teams for months.
MIN_MATCHES_FOR_DIRECT_FIT = 10


def dixon_coles_tau(x, y, lambda_home, lambda_away, rho):
    """Exact port of dixonColesTau() in src/lib/dixonColes.ts."""
    if x == 0 and y == 0:
        return 1 - lambda_home * lambda_away * rho
    if x == 0 and y == 1:
        return 1 + lambda_home * rho
    if x == 1 and y == 0:
        return 1 + lambda_away * rho
    if x == 1 and y == 1:
        return 1 - rho
    return 1.0


def negative_log_likelihood(params, home_idx, away_idx, home_goals, away_goals, weights, n_teams):
    attack = params[0:n_teams]
    defence = params[n_teams : 2 * n_teams]
    home_adv = params[2 * n_teams]
    rho = params[2 * n_teams + 1]

    lambda_home = np.exp(home_adv + attack[home_idx] - defence[away_idx])
    lambda_away = np.exp(attack[away_idx] - defence[home_idx])

    # Dixon-Coles low-score correction, vectorised. tau only differs from 1
    # for the four (0,0)/(0,1)/(1,0)/(1,1) score combinations.
    tau = np.ones_like(lambda_home)
    m00 = (home_goals == 0) & (away_goals == 0)
    m01 = (home_goals == 0) & (away_goals == 1)
    m10 = (home_goals == 1) & (away_goals == 0)
    m11 = (home_goals == 1) & (away_goals == 1)
    tau[m00] = 1 - lambda_home[m00] * lambda_away[m00] * rho
    tau[m01] = 1 + lambda_home[m01] * rho
    tau[m10] = 1 + lambda_away[m10] * rho
    tau[m11] = 1 - rho

    # tau can go non-positive in bad regions the optimiser briefly wanders
    # into; clip so log() stays finite instead of NaN-ing the whole search.
    tau = np.clip(tau, 1e-10, None)

    log_poisson_home = home_goals * np.log(lambda_home) - lambda_home - gammaln(home_goals + 1)
    log_poisson_away = away_goals * np.log(lambda_away) - lambda_away - gammaln(away_goals + 1)

    ll = weights * (np.log(tau) + log_poisson_home + log_poisson_away)
    return -np.sum(ll)


def fit_league(supabase, league_code: str, dry_run: bool):
    league_res = supabase.table("leagues").select("league_id, code, name").eq("code", league_code).single().execute()
    league = league_res.data
    if not league:
        print(f"ERROR: no league found with code {league_code}", file=sys.stderr)
        sys.exit(1)
    league_id = league["league_id"]

    window_end_date = date.today()
    window_start_date = window_end_date - timedelta(days=WINDOW_DAYS)

    # Paginate -- the REST API caps rows per request regardless of how many
    # actually match the filter.
    matches = []
    page_size = 1000
    start = 0
    while True:
        res = (
            supabase.table("matches")
            .select("home_team_id, away_team_id, match_date, full_time_home_goals, full_time_away_goals")
            .eq("league_id", league_id)
            .gte("match_date", window_start_date.isoformat())
            .lte("match_date", window_end_date.isoformat())
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = res.data or []
        matches.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size

    if len(matches) < 20:
        print(
            f"ERROR: only {len(matches)} completed {league_code} match(es) in the "
            f"{window_start_date} to {window_end_date} window -- too few to fit reliably. Aborting.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Drop teams (and their matches) with too few appearances in-window --
    # see MIN_MATCHES_FOR_DIRECT_FIT for why. Counting appearances first
    # over the FULL match list, then filtering matches, so a team that's
    # eligible only counts real matches against other eligible teams.
    appearances: dict[int, int] = {}
    for m in matches:
        appearances[m["home_team_id"]] = appearances.get(m["home_team_id"], 0) + 1
        appearances[m["away_team_id"]] = appearances.get(m["away_team_id"], 0) + 1
    eligible_team_ids = {tid for tid, n in appearances.items() if n >= MIN_MATCHES_FOR_DIRECT_FIT}
    excluded_team_ids = {tid for tid, n in appearances.items() if n < MIN_MATCHES_FOR_DIRECT_FIT}

    if excluded_team_ids:
        names_res = supabase.table("teams").select("team_id, canonical_name").in_("team_id", list(excluded_team_ids)).execute()
        name_by_id = {t["team_id"]: t["canonical_name"] for t in (names_res.data or [])}
        for tid in excluded_team_ids:
            print(
                f"Excluding {name_by_id.get(tid, tid)} from the direct fit -- only "
                f"{appearances[tid]} match(es) in-window (< {MIN_MATCHES_FOR_DIRECT_FIT}); "
                "left for estimate_promoted_team_ratings.py.",
                file=sys.stderr,
            )

    matches = [m for m in matches if m["home_team_id"] in eligible_team_ids and m["away_team_id"] in eligible_team_ids]

    if len(matches) < 20:
        print(
            f"ERROR: only {len(matches)} match(es) remain after excluding sparse teams -- too few to fit reliably. Aborting.",
            file=sys.stderr,
        )
        sys.exit(1)

    team_ids = sorted(eligible_team_ids)
    team_index = {tid: i for i, tid in enumerate(team_ids)}
    n_teams = len(team_ids)

    home_idx = np.array([team_index[m["home_team_id"]] for m in matches])
    away_idx = np.array([team_index[m["away_team_id"]] for m in matches])
    home_goals = np.array([m["full_time_home_goals"] for m in matches], dtype=float)
    away_goals = np.array([m["full_time_away_goals"] for m in matches], dtype=float)

    match_dates = [date.fromisoformat(m["match_date"]) for m in matches]
    days_ago = np.array([(window_end_date - d).days for d in match_dates], dtype=float)
    weights = 0.5 ** (days_ago / HALF_LIFE_DAYS)

    x0 = np.concatenate([np.zeros(n_teams), np.zeros(n_teams), [0.25], [-0.05]])
    bounds = (
        [STRENGTH_BOUNDS] * n_teams
        + [STRENGTH_BOUNDS] * n_teams
        + [HOME_ADV_BOUNDS]
        + [RHO_BOUNDS]
    )

    result = minimize(
        negative_log_likelihood,
        x0,
        args=(home_idx, away_idx, home_goals, away_goals, weights, n_teams),
        method="L-BFGS-B",
        bounds=bounds,
        options={"maxiter": 2000, "ftol": 1e-12},
    )

    attack = result.x[0:n_teams]
    defence = result.x[n_teams : 2 * n_teams]
    home_advantage = float(result.x[2 * n_teams])
    rho = float(result.x[2 * n_teams + 1])
    log_likelihood = float(-result.fun)

    # Identifiability fix: shift attack AND defence by the same constant so
    # mean(attack) == 0. This is the only shift that leaves every lambda
    # (and therefore the log-likelihood) unchanged -- see the module
    # docstring for why attack-only or independent attack/defence
    # recentring would silently change predictions.
    shift = -np.mean(attack)
    attack = attack + shift
    defence = defence + shift

    ratings = [
        {"team_id": tid, "attack_strength": float(attack[team_index[tid]]), "defence_strength": float(defence[team_index[tid]])}
        for tid in team_ids
    ]

    summary = {
        "league_code": league_code,
        "league_id": league_id,
        "window_start_date": window_start_date.isoformat(),
        "window_end_date": window_end_date.isoformat(),
        "decay_half_life_days": HALF_LIFE_DAYS,
        "rho": rho,
        "home_advantage": home_advantage,
        "log_likelihood": log_likelihood,
        "converged": bool(result.success),
        "matches_used": len(matches),
        "n_teams_fitted": n_teams,
        "n_teams_excluded_sparse": len(excluded_team_ids),
    }

    if not result.success:
        print("ERROR: optimiser did not converge:", result.message, file=sys.stderr)
        print(json.dumps(summary, indent=2), file=sys.stderr)
        sys.exit(1)

    if dry_run:
        print("DRY RUN -- not writing to Supabase.")
        print(json.dumps(summary, indent=2))
        for r in sorted(ratings, key=lambda r: -r["attack_strength"]):
            print(f"  team_id={r['team_id']:>4}  attack={r['attack_strength']:+.4f}  defence={r['defence_strength']:+.4f}")
        return summary, None

    # Insert the fit run first, then the ratings that reference it. If the
    # ratings insert fails, the fit run row still exists but has zero
    # ratings -- backfill_fixture_predictions() only ever reads the latest
    # fit run *with* ratings via its team_ratings join, so an incomplete
    # fit run with no ratings simply can't produce predictions and won't be
    # picked up as "the" latest usable fit. It's still worth failing loudly
    # rather than silently leaving a half-written fit run behind.
    fit_run_res = (
        supabase.table("model_fit_runs")
        .insert(
            {
                "league_id": league_id,
                "window_start_date": summary["window_start_date"],
                "window_end_date": summary["window_end_date"],
                "rho": rho,
                "home_advantage": home_advantage,
                "decay_half_life_days": HALF_LIFE_DAYS,
                "log_likelihood": log_likelihood,
                "converged": True,
                "matches_used": len(matches),
            }
        )
        .execute()
    )
    fit_run_id = fit_run_res.data[0]["fit_run_id"]

    rating_rows = [
        {
            "fit_run_id": fit_run_id,
            "team_id": r["team_id"],
            "attack_strength": r["attack_strength"],
            "defence_strength": r["defence_strength"],
            "is_estimated": False,
        }
        for r in ratings
    ]
    ratings_res = supabase.table("team_ratings").insert(rating_rows).execute()
    if len(ratings_res.data or []) != len(rating_rows):
        print(
            f"ERROR: inserted fit_run_id={fit_run_id} but only {len(ratings_res.data or [])}/"
            f"{len(rating_rows)} team_ratings rows were written. This fit run has no usable "
            f"ratings and must not be treated as the latest fit -- investigate before rerunning.",
            file=sys.stderr,
        )
        sys.exit(1)

    summary["fit_run_id"] = fit_run_id
    print(json.dumps(summary, indent=2))
    return summary, fit_run_id


def main():
    parser = argparse.ArgumentParser(description="Fit the Dixon-Coles model for one league.")
    parser.add_argument("--league-code", default="E0")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment.", file=sys.stderr)
        sys.exit(1)

    supabase = create_client(url, key)
    fit_league(supabase, args.league_code, args.dry_run)


if __name__ == "__main__":
    main()
