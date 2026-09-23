#!/usr/bin/env python3
# ============================================================================
# scripts/fit_dixon_coles.py
#
# Fits the Dixon-Coles model for one league from completed matches already
# in Supabase, runs the fit through a set of quality gates, and writes the
# result as a new model_fit_runs row (status = accepted/rejected) plus one
# team_ratings row per genuinely-fitted team. Competition-agnostic: any
# league code already in the `leagues` table works via --league-code.
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
# fixture, home_advantage included. We fix this by recentring so the mean
# attack_strength across fitted teams is exactly 0, applying that same
# shift to defence_strength, after optimisation.
#
# Only teams with at least MIN_MATCHES_FOR_DIRECT_FIT matches in-window get
# a genuine fitted rating here. Teams below that (freshly promoted, or too
# few real matches to fit stably -- see the MIN_MATCHES_FOR_DIRECT_FIT
# comment) are left out entirely; scripts/estimate_promoted_team_ratings.py
# handles those separately from their rating in the division below, rather
# than this script inventing or extrapolating a number for them.
#
# PRODUCTION SELECTION: nothing downstream should ever pick "the latest
# fit_run_id" or "latest fitted_at" -- it must filter status = 'accepted'.
# A fit that fails any hard quality gate is still written (status =
# 'rejected', with a reason and the full check results) so it's visible
# for audit via the league_fit_status view, but it is never selected as a
# production fit, and the script still exits non-zero so CI fails loudly.
#
# Usage:
#   python scripts/fit_dixon_coles.py --league-code E0
#   python scripts/fit_dixon_coles.py --league-code E0 --dry-run
#   python scripts/fit_dixon_coles.py --league-code E0 --as-of 2025-11-06
#
# --as-of DATE (retro-fit): fits exactly as if run at the end of DATE.
# The match window and the recency weighting both end at DATE (matches ON
# DATE are included), the movement check compares only against fits made
# before it, and the row is stamped fitted_at = DATE 23:59:59 UTC,
# as_of_date = DATE, is_retrofit = true. Because every prediction function
# picks the newest accepted fit with fitted_at::date < kick-off date, a
# fit as of DATE serves kick-offs from DATE+1 onward -- never a match it
# has already seen. Re-running for a date that already has an accepted
# retro-fit is a no-op (exit 0), so a partly-failed backfill can be rerun.
#
# Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment. Never
# expose SUPABASE_SERVICE_KEY to the Vite frontend -- this only ever runs
# server-side (locally, or via GitHub Actions).
# ============================================================================

import argparse
import itertools
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
# team's rating too, because the post-fit identifiability shift is a
# shared constant computed from the mean across ALL fitted teams. A team
# below this threshold is excluded from the direct fit entirely -- its
# matches are dropped from the fitting dataset -- and left for
# estimate_promoted_team_ratings.py, exactly as a team with zero matches
# already is. 10 matches (~a quarter of a season) is enough for a stable
# fit in practice without deferring real signal for months.
MIN_MATCHES_FOR_DIRECT_FIT = 10

# --- Quality gates (see validate_fit) --------------------------------------
BOUND_HUG_TOLERANCE = 0.02
SENSIBLE_STRENGTH_BOUND = 2.5
SENSIBLE_RHO_BOUNDS = (-0.35, 0.35)
SENSIBLE_HOME_ADV_BOUNDS = (-0.5, 1.0)
MIN_MATCHES_FOR_PRODUCTION = 50
SENSIBLE_EXPECTED_GOALS_BOUNDS = (0.05, 6.0)
MOVEMENT_WARNING_THRESHOLD = 1.0


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

    tau = np.ones_like(lambda_home)
    m00 = (home_goals == 0) & (away_goals == 0)
    m01 = (home_goals == 0) & (away_goals == 1)
    m10 = (home_goals == 1) & (away_goals == 0)
    m11 = (home_goals == 1) & (away_goals == 1)
    tau[m00] = 1 - lambda_home[m00] * lambda_away[m00] * rho
    tau[m01] = 1 + lambda_home[m01] * rho
    tau[m10] = 1 + lambda_away[m10] * rho
    tau[m11] = 1 - rho
    tau = np.clip(tau, 1e-10, None)

    log_poisson_home = home_goals * np.log(lambda_home) - lambda_home - gammaln(home_goals + 1)
    log_poisson_away = away_goals * np.log(lambda_away) - lambda_away - gammaln(away_goals + 1)

    ll = weights * (np.log(tau) + log_poisson_home + log_poisson_away)
    return -np.sum(ll)


def previous_accepted_ratings(supabase, league_id, before=None):
    """Ratings from the production fit for this league, if any -- used only for the movement check.
    With `before` (retro-fits), only fits made strictly before that timestamp count, so a
    retro-fit is never compared against a fit from its own future."""
    q = (
        supabase.table("model_fit_runs")
        .select("fit_run_id")
        .eq("league_id", league_id)
        .eq("status", "accepted")
    )
    if before is not None:
        q = q.lt("fitted_at", before)
    fit_res = q.order("fitted_at", desc=True).limit(1).execute()
    if not fit_res.data:
        return None
    prev_fit_run_id = fit_res.data[0]["fit_run_id"]
    ratings_res = (
        supabase.table("team_ratings")
        .select("team_id, attack_strength, defence_strength")
        .eq("fit_run_id", prev_fit_run_id)
        .execute()
    )
    return {r["team_id"]: r for r in (ratings_res.data or [])}


def validate_fit(
    *,
    converged,
    optimizer_message,
    raw_attack,
    raw_defence,
    attack,
    defence,
    home_advantage,
    rho,
    matches_used,
    team_ids,
    previous_ratings,
):
    """
    Runs every hard gate and soft (warning-only) check against a completed
    fit. Returns (status, rejection_reason, warnings, checks) where status
    is 'accepted' or 'rejected'. Never raises -- a check that can't be
    evaluated is recorded as a warning, not a silent pass.
    """
    errors = []
    warnings = []
    checks = {}

    checks["converged"] = {"pass": bool(converged), "optimizer_message": optimizer_message}
    if not converged:
        errors.append(f"optimiser did not converge ({optimizer_message})")

    all_params = np.concatenate([raw_attack, raw_defence, [home_advantage, rho]])
    all_finite = bool(np.all(np.isfinite(all_params)))
    checks["all_parameters_finite"] = {"pass": all_finite}
    if not all_finite:
        errors.append("one or more fitted parameters is NaN/inf")

    if all_finite:
        hug_lo_att = np.any(raw_attack <= STRENGTH_BOUNDS[0] + BOUND_HUG_TOLERANCE)
        hug_hi_att = np.any(raw_attack >= STRENGTH_BOUNDS[1] - BOUND_HUG_TOLERANCE)
        hug_lo_def = np.any(raw_defence <= STRENGTH_BOUNDS[0] + BOUND_HUG_TOLERANCE)
        hug_hi_def = np.any(raw_defence >= STRENGTH_BOUNDS[1] - BOUND_HUG_TOLERANCE)
        hug_home = home_advantage <= HOME_ADV_BOUNDS[0] + BOUND_HUG_TOLERANCE or home_advantage >= HOME_ADV_BOUNDS[1] - BOUND_HUG_TOLERANCE
        hug_rho = rho <= RHO_BOUNDS[0] + BOUND_HUG_TOLERANCE or rho >= RHO_BOUNDS[1] - BOUND_HUG_TOLERANCE
        any_hug = bool(hug_lo_att or hug_hi_att or hug_lo_def or hug_hi_def or hug_home or hug_rho)
        checks["no_parameter_at_optimizer_bound"] = {
            "pass": not any_hug,
            "attack_hit_bound": bool(hug_lo_att or hug_hi_att),
            "defence_hit_bound": bool(hug_lo_def or hug_hi_def),
            "home_advantage_hit_bound": bool(hug_home),
            "rho_hit_bound": bool(hug_rho),
        }
        if any_hug:
            errors.append(
                "a fitted parameter is pinned at the optimiser's numeric bound -- no finite interior "
                "optimum was found (this is exactly how the Coventry complete-separation failure looked)"
            )
    else:
        checks["no_parameter_at_optimizer_bound"] = {"pass": False, "note": "skipped -- non-finite parameters"}

    if all_finite:
        attack_range = (float(np.min(attack)), float(np.max(attack)))
        defence_range = (float(np.min(defence)), float(np.max(defence)))
        strength_ok = bool(
            np.all(np.abs(attack) <= SENSIBLE_STRENGTH_BOUND) and np.all(np.abs(defence) <= SENSIBLE_STRENGTH_BOUND)
        )
        checks["attack_defence_within_sensible_bounds"] = {
            "pass": strength_ok,
            "bound": SENSIBLE_STRENGTH_BOUND,
            "attack_range": attack_range,
            "defence_range": defence_range,
        }
        if not strength_ok:
            errors.append(
                f"attack/defence outside +/-{SENSIBLE_STRENGTH_BOUND} "
                f"(attack {attack_range}, defence {defence_range})"
            )

        home_adv_ok = SENSIBLE_HOME_ADV_BOUNDS[0] <= home_advantage <= SENSIBLE_HOME_ADV_BOUNDS[1]
        rho_ok = SENSIBLE_RHO_BOUNDS[0] <= rho <= SENSIBLE_RHO_BOUNDS[1]
        checks["home_advantage_within_sensible_bounds"] = {
            "pass": home_adv_ok, "value": home_advantage, "bounds": list(SENSIBLE_HOME_ADV_BOUNDS)
        }
        checks["rho_within_sensible_bounds"] = {"pass": rho_ok, "value": rho, "bounds": list(SENSIBLE_RHO_BOUNDS)}
        if not home_adv_ok:
            errors.append(f"home_advantage={home_advantage:.4f} outside sensible bounds {SENSIBLE_HOME_ADV_BOUNDS}")
        if not rho_ok:
            errors.append(f"rho={rho:.4f} outside sensible bounds {SENSIBLE_RHO_BOUNDS}")
    else:
        checks["attack_defence_within_sensible_bounds"] = {"pass": False, "note": "skipped -- non-finite parameters"}
        checks["home_advantage_within_sensible_bounds"] = {"pass": False, "note": "skipped -- non-finite parameters"}
        checks["rho_within_sensible_bounds"] = {"pass": False, "note": "skipped -- non-finite parameters"}

    obs_ok = matches_used >= MIN_MATCHES_FOR_PRODUCTION
    checks["sufficient_observations"] = {"pass": obs_ok, "matches_used": matches_used, "minimum": MIN_MATCHES_FOR_PRODUCTION}
    if not obs_ok:
        errors.append(f"only {matches_used} matches used, below the production minimum of {MIN_MATCHES_FOR_PRODUCTION}")

    if all_finite:
        eg_min, eg_max = np.inf, -np.inf
        for i, j in itertools.permutations(range(len(team_ids)), 2):
            lam_home = np.exp(home_advantage + attack[i] - defence[j])
            lam_away = np.exp(attack[j] - defence[i])
            eg_min = min(eg_min, lam_home, lam_away)
            eg_max = max(eg_max, lam_home, lam_away)
        eg_ok = eg_min >= SENSIBLE_EXPECTED_GOALS_BOUNDS[0] and eg_max <= SENSIBLE_EXPECTED_GOALS_BOUNDS[1]
        checks["expected_goals_within_sensible_bounds"] = {
            "pass": bool(eg_ok),
            "bounds": list(SENSIBLE_EXPECTED_GOALS_BOUNDS),
            "observed_range": [float(eg_min), float(eg_max)],
        }
        if not eg_ok:
            errors.append(
                f"predicted expected goals range [{eg_min:.3f}, {eg_max:.3f}] falls outside sensible bounds "
                f"{SENSIBLE_EXPECTED_GOALS_BOUNDS} for at least one team pairing"
            )
    else:
        checks["expected_goals_within_sensible_bounds"] = {"pass": False, "note": "skipped -- non-finite parameters"}

    if all_finite and previous_ratings:
        movements = []
        for idx, tid in enumerate(team_ids):
            prev = previous_ratings.get(tid)
            if not prev:
                continue
            d_attack = abs(attack[idx] - prev["attack_strength"])
            d_defence = abs(defence[idx] - prev["defence_strength"])
            if d_attack > MOVEMENT_WARNING_THRESHOLD or d_defence > MOVEMENT_WARNING_THRESHOLD:
                movements.append({"team_id": tid, "delta_attack": float(d_attack), "delta_defence": float(d_defence)})
        checks["movement_vs_previous_accepted_fit"] = {
            "compared_teams": len(previous_ratings),
            "large_movements": movements,
            "threshold": MOVEMENT_WARNING_THRESHOLD,
        }
        if movements:
            warnings.append(f"{len(movements)} team(s) moved by more than {MOVEMENT_WARNING_THRESHOLD} vs the current production fit")
    else:
        checks["movement_vs_previous_accepted_fit"] = {"note": "no previous accepted fit to compare against" if all_finite else "skipped -- non-finite parameters"}

    status = "rejected" if errors else "accepted"
    rejection_reason = "; ".join(errors) if errors else None
    return status, rejection_reason, warnings, checks


def fit_league(supabase, league_code, dry_run, as_of=None):
    league_res = supabase.table("leagues").select("league_id, code, name").eq("code", league_code).single().execute()
    league = league_res.data
    if not league:
        print(f"ERROR: no league found with code {league_code}", file=sys.stderr)
        sys.exit(1)
    league_id = league["league_id"]

    if as_of is not None:
        if as_of >= date.today():
            print(f"ERROR: --as-of {as_of} must be before today -- use a normal run for today.", file=sys.stderr)
            sys.exit(1)
        existing = (
            supabase.table("model_fit_runs")
            .select("fit_run_id, fitted_at")
            .eq("league_id", league_id)
            .eq("is_retrofit", True)
            .eq("status", "accepted")
            .eq("as_of_date", as_of.isoformat())
            .execute()
        )
        if existing.data:
            print(f"{league_code} already has accepted retro-fit {existing.data[0]['fit_run_id']} as of {as_of} -- skipping.")
            return None, existing.data[0]["fit_run_id"]
        window_end_date = as_of
        fitted_at = f"{as_of.isoformat()}T23:59:59+00:00"
    else:
        window_end_date = date.today()
        fitted_at = None  # column default now()
    window_start_date = window_end_date - timedelta(days=WINDOW_DAYS)

    def run_metadata():
        meta = {"as_of_date": window_end_date.isoformat(), "is_retrofit": as_of is not None}
        if fitted_at is not None:
            meta["fitted_at"] = fitted_at
        return meta

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

    def write_rejected_stub(reason, matches_used=0, converged=False):
        row = {
            "league_id": league_id,
            "window_start_date": window_start_date.isoformat(),
            "window_end_date": window_end_date.isoformat(),
            "rho": 0.0,
            "home_advantage": 0.0,
            "decay_half_life_days": HALF_LIFE_DAYS,
            "log_likelihood": None,
            "converged": converged,
            "matches_used": matches_used,
            "status": "rejected",
            "rejection_reason": reason,
            "validation_checks": {"note": "fit could not be attempted -- see rejection_reason"},
            **run_metadata(),
        }
        if dry_run:
            print(f"DRY RUN -- would write rejected fit_run for {league_code}: {reason}")
            return
        supabase.table("model_fit_runs").insert(row).execute()
        print(f"Wrote rejected fit_run for {league_code}: {reason}", file=sys.stderr)

    if len(matches) < 20:
        reason = f"only {len(matches)} completed {league_code} match(es) in the {window_start_date} to {window_end_date} window"
        print(f"ERROR: {reason} -- too few to fit reliably.", file=sys.stderr)
        write_rejected_stub(reason, matches_used=len(matches))
        sys.exit(1)

    appearances = {}
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
    team_ids = sorted(eligible_team_ids)
    n_teams = len(team_ids)

    if len(matches) < max(20, 2 * n_teams + 2):
        reason = f"only {len(matches)} match(es) remain after excluding sparse teams, for {n_teams} eligible teams"
        print(f"ERROR: {reason} -- too few to fit reliably.", file=sys.stderr)
        write_rejected_stub(reason, matches_used=len(matches))
        sys.exit(1)

    team_index = {tid: i for i, tid in enumerate(team_ids)}

    home_idx = np.array([team_index[m["home_team_id"]] for m in matches])
    away_idx = np.array([team_index[m["away_team_id"]] for m in matches])
    home_goals = np.array([m["full_time_home_goals"] for m in matches], dtype=float)
    away_goals = np.array([m["full_time_away_goals"] for m in matches], dtype=float)

    match_dates = [date.fromisoformat(m["match_date"]) for m in matches]
    days_ago = np.array([(window_end_date - d).days for d in match_dates], dtype=float)
    weights = 0.5 ** (days_ago / HALF_LIFE_DAYS)

    x0 = np.concatenate([np.zeros(n_teams), np.zeros(n_teams), [0.25], [-0.05]])
    bounds = [STRENGTH_BOUNDS] * n_teams + [STRENGTH_BOUNDS] * n_teams + [HOME_ADV_BOUNDS] + [RHO_BOUNDS]

    result = minimize(
        negative_log_likelihood,
        x0,
        args=(home_idx, away_idx, home_goals, away_goals, weights, n_teams),
        method="L-BFGS-B",
        bounds=bounds,
        options={"maxiter": 2000, "ftol": 1e-12},
    )

    raw_attack = result.x[0:n_teams].copy()
    raw_defence = result.x[n_teams : 2 * n_teams].copy()
    home_advantage = float(result.x[2 * n_teams])
    rho = float(result.x[2 * n_teams + 1])
    log_likelihood = float(-result.fun)

    shift = -np.mean(raw_attack) if np.all(np.isfinite(raw_attack)) else 0.0
    attack = raw_attack + shift
    defence = raw_defence + shift

    previous_ratings = previous_accepted_ratings(supabase, league_id, before=fitted_at)
    status, rejection_reason, warnings, checks = validate_fit(
        converged=bool(result.success),
        optimizer_message=str(result.message),
        raw_attack=raw_attack,
        raw_defence=raw_defence,
        attack=attack,
        defence=defence,
        home_advantage=home_advantage,
        rho=rho,
        matches_used=len(matches),
        team_ids=team_ids,
        previous_ratings=previous_ratings,
    )

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
        "as_of_date": window_end_date.isoformat(),
        "is_retrofit": as_of is not None,
        "rho": rho,
        "home_advantage": home_advantage,
        "log_likelihood": log_likelihood,
        "converged": bool(result.success),
        "matches_used": len(matches),
        "n_teams_fitted": n_teams,
        "n_teams_excluded_sparse": len(excluded_team_ids),
        "status": status,
        "rejection_reason": rejection_reason,
        "warnings": warnings,
    }

    if dry_run:
        print("DRY RUN -- not writing to Supabase.")
        print(json.dumps(summary, indent=2))
        print(json.dumps(checks, indent=2, default=str))
        for r in sorted(ratings, key=lambda r: -r["attack_strength"]):
            print(f"  team_id={r['team_id']:>4}  attack={r['attack_strength']:+.4f}  defence={r['defence_strength']:+.4f}")
        return summary, None

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
                "converged": bool(result.success),
                "matches_used": len(matches),
                "status": status,
                "rejection_reason": rejection_reason,
                "validation_warnings": warnings,
                "validation_checks": checks,
                **run_metadata(),
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
            f"{len(rating_rows)} team_ratings rows were written.",
            file=sys.stderr,
        )
        sys.exit(1)

    summary["fit_run_id"] = fit_run_id
    print(json.dumps(summary, indent=2))
    if status == "rejected":
        print(f"\nFIT REJECTED: {rejection_reason}", file=sys.stderr)
        print(json.dumps(checks, indent=2, default=str), file=sys.stderr)
        sys.exit(1)
    if warnings:
        print("\nAccepted with warning(s):", file=sys.stderr)
        for w in warnings:
            print(f"  - {w}", file=sys.stderr)
    return summary, fit_run_id


def main():
    parser = argparse.ArgumentParser(description="Fit the Dixon-Coles model for one league.")
    parser.add_argument("--league-code", default="E0")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--as-of",
        type=date.fromisoformat,
        default=None,
        help="Retro-fit as at the end of this past date (YYYY-MM-DD). See the header comment.",
    )
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment.", file=sys.stderr)
        sys.exit(1)

    supabase = create_client(url, key)
    fit_league(supabase, args.league_code, args.dry_run, as_of=args.as_of)


if __name__ == "__main__":
    main()
