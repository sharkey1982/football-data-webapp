#!/usr/bin/env python3
# ============================================================================
# scripts/model_experiment.py
#
# Point-in-time model experiments. For each variant of the fit settings, walks
# a league's seasons week by week: fits AS OF each date (in memory -- nothing
# is written to model_fit_runs, so an experiment can never become a live fit),
# predicts the next 7 days' matches, and stores the per-match 1X2 forecasts in
# model_experiment_predictions. Scoring against the market happens in SQL
# (score_model_experiment), on exactly the matches every variant predicted.
#
# Variants: half-life (days) and shrinkage -- a penalty lambda * sum of squared
# deviations of attack and defence ratings from their league means (a Gaussian
# prior pulling teams together without moving the overall scoring level).
# The baseline variant (half-life 180, shrinkage 0) reproduces dc_v1_1, and is
# checked match by match against the production retro-fits.
#
# Usage (in the model-experiment workflow):
#   python scripts/model_experiment.py --experiment shrink_halflife_v1 \
#     --league E1 --seasons 10,11,12 --variants "180:0,90:0,365:0,180:2,180:5,180:10"
# ============================================================================

import argparse
import os
import sys
from datetime import date, timedelta

import numpy as np
from scipy.optimize import minimize
from scipy.special import gammaln

sys.path.insert(0, os.path.dirname(__file__))
from fit_dixon_coles import (  # noqa: E402  -- shared definitions, one source of truth
    HOME_ADV_BOUNDS,
    MIN_MATCHES_FOR_DIRECT_FIT,
    RHO_BOUNDS,
    STRENGTH_BOUNDS,
    WINDOW_DAYS,
    negative_log_likelihood,
)

MAX_GOALS = 10


def objective(params, hi, ai, hg, ag, w, n, shrink):
    """Weighted Dixon-Coles negative log-likelihood + shrinkage penalty, with its exact gradient."""
    att, dfn = params[:n], params[n:2 * n]
    ha, rho = params[2 * n], params[2 * n + 1]
    lh = np.exp(ha + att[hi] - dfn[ai])
    la = np.exp(att[ai] - dfn[hi])
    m00 = (hg == 0) & (ag == 0)
    m01 = (hg == 0) & (ag == 1)
    m10 = (hg == 1) & (ag == 0)
    m11 = (hg == 1) & (ag == 1)
    tau = np.ones_like(lh)
    tau[m00] = 1 - lh[m00] * la[m00] * rho
    tau[m01] = 1 + lh[m01] * rho
    tau[m10] = 1 + la[m10] * rho
    tau[m11] = 1 - rho
    tau = np.clip(tau, 1e-10, None)
    ll = w * (np.log(tau) + hg * np.log(lh) - lh - gammaln(hg + 1) + ag * np.log(la) - la - gammaln(ag + 1))

    # d log tau / d lambda_home, / d lambda_away, / d rho
    dth = np.zeros_like(lh); dta = np.zeros_like(lh); dtr = np.zeros_like(lh)
    dth[m00] = -la[m00] * rho / tau[m00]; dta[m00] = -lh[m00] * rho / tau[m00]; dtr[m00] = -lh[m00] * la[m00] / tau[m00]
    dth[m01] = rho / tau[m01]; dtr[m01] = lh[m01] / tau[m01]
    dta[m10] = rho / tau[m10]; dtr[m10] = la[m10] / tau[m10]
    dtr[m11] = -1 / tau[m11]
    # derivatives w.r.t. the log-rates eta_h = log lambda_home, eta_a = log lambda_away
    gh = w * (hg - lh + lh * dth)
    ga = w * (ag - la + la * dta)
    g_att = np.bincount(hi, gh, n) + np.bincount(ai, ga, n)
    g_def = -np.bincount(ai, gh, n) - np.bincount(hi, ga, n)
    grad = -np.concatenate([g_att, g_def, [gh.sum()], [np.sum(w * dtr)]])

    nll = -np.sum(ll)
    if shrink > 0:
        ca, cd = att - att.mean(), dfn - dfn.mean()
        nll += shrink * (np.sum(ca ** 2) + np.sum(cd ** 2))
        grad[:n] += 2 * shrink * ca
        grad[n:2 * n] += 2 * shrink * cd
    return nll, grad


def fit(matches, as_of, half_life, shrink):
    """Fit as at the end of as_of. Returns (team_index, attack, defence, ha, rho) or None."""
    start = as_of - timedelta(days=WINDOW_DAYS)
    win = [m for m in matches if start <= m["d"] <= as_of]
    counts = {}
    for m in win:
        counts[m["h"]] = counts.get(m["h"], 0) + 1
        counts[m["a"]] = counts.get(m["a"], 0) + 1
    teams = sorted(t for t, c in counts.items() if c >= MIN_MATCHES_FOR_DIRECT_FIT)
    ok = set(teams)
    win = [m for m in win if m["h"] in ok and m["a"] in ok]
    if len(win) < 50 or len(teams) < 4:
        return None
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    hi = np.array([idx[m["h"]] for m in win]); ai = np.array([idx[m["a"]] for m in win])
    hg = np.array([m["hg"] for m in win], float); ag = np.array([m["ag"] for m in win], float)
    w = 0.5 ** (np.array([(as_of - m["d"]).days for m in win], float) / half_life)
    x0 = np.concatenate([np.zeros(n), np.zeros(n), [0.25], [-0.05]])
    bounds = [STRENGTH_BOUNDS] * (2 * n) + [HOME_ADV_BOUNDS, RHO_BOUNDS]
    res = minimize(objective, x0, args=(hi, ai, hg, ag, w, n, shrink), jac=True, method="L-BFGS-B",
                   bounds=bounds, options={"maxiter": 5000, "ftol": 1e-12})
    att, dfn = res.x[:n].copy(), res.x[n:2 * n].copy()
    shift = -att.mean()  # same normalisation as production: predictions unchanged
    return idx, att + shift, dfn + shift, float(res.x[2 * n]), float(res.x[2 * n + 1])


def probs_1x2(lh, la, rho):
    """Dixon-Coles home/draw/away probabilities from a 0..MAX_GOALS score grid."""
    g = np.arange(MAX_GOALS + 1)
    ph = np.exp(g * np.log(lh) - lh - gammaln(g + 1))
    pa = np.exp(g * np.log(la) - la - gammaln(g + 1))
    grid = np.outer(ph, pa)
    grid[0, 0] *= 1 - lh * la * rho
    grid[0, 1] *= 1 + lh * rho
    grid[1, 0] *= 1 + la * rho
    grid[1, 1] *= 1 - rho
    grid /= grid.sum()
    return float(np.tril(grid, -1).sum()), float(np.trace(grid)), float(np.triu(grid, 1).sum())


def load_matches(sb, league_id):
    out, start = [], 0
    while True:
        rows = (sb.table("matches").select("match_id, match_date, season_id, home_team_id, away_team_id, full_time_home_goals, full_time_away_goals")
                .eq("league_id", league_id).not_.is_("full_time_home_goals", "null")
                .order("match_id").range(start, start + 999).execute().data or [])
        out += rows
        if len(rows) < 1000:
            break
        start += 1000
    return [{"id": r["match_id"], "d": date.fromisoformat(r["match_date"][:10]), "s": r["season_id"], "h": r["home_team_id"],
             "a": r["away_team_id"], "hg": r["full_time_home_goals"], "ag": r["full_time_away_goals"]} for r in out]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--experiment", required=True)
    ap.add_argument("--league", required=True)
    ap.add_argument("--seasons", required=True)
    ap.add_argument("--variants", required=True, help="half_life:shrink,... e.g. 180:0,365:0,180:5")
    ap.add_argument("--step-days", type=int, default=7)
    a = ap.parse_args()

    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    league_id = sb.table("leagues").select("league_id").eq("code", a.league).single().execute().data["league_id"]
    matches = load_matches(sb, league_id)
    variants = [(float(v.split(":")[0]), float(v.split(":")[1])) for v in a.variants.split(",")]
    print(f"{a.league}: {len(matches)} matches loaded; variants {variants}")

    for sid in [int(s) for s in a.seasons.split(",")]:
        season = sorted(m["d"] for m in matches if m["s"] == sid)
        if not season:
            continue
        d, last = season[0] - timedelta(days=1), season[-1] - timedelta(days=1)
        rows = []
        while d <= last:
            nxt = [m for m in matches if m["s"] == sid and d < m["d"] <= d + timedelta(days=a.step_days)]
            if nxt:
                for hl, sh in variants:
                    f = fit(matches, d, hl, sh)
                    if f is None:
                        continue
                    idx, att, dfn, ha, rho = f
                    for m in nxt:
                        if m["h"] not in idx or m["a"] not in idx:
                            continue
                        lh = float(np.exp(ha + att[idx[m["h"]]] - dfn[idx[m["a"]]]))
                        la = float(np.exp(att[idx[m["a"]]] - dfn[idx[m["h"]]]))
                        p = probs_1x2(lh, la, rho)
                        rows.append({"experiment": a.experiment, "variant": f"hl{int(hl)}_s{sh:g}", "half_life_days": hl, "shrinkage": sh,
                                     "match_id": m["id"], "as_of_date": d.isoformat(), "pred_home_goals": lh, "pred_away_goals": la,
                                     "rho": rho, "p_home": p[0], "p_draw": p[1], "p_away": p[2]})
            d += timedelta(days=a.step_days)
        for i in range(0, len(rows), 500):
            sb.table("model_experiment_predictions").upsert(rows[i:i + 500], on_conflict="experiment,variant,match_id").execute()
        print(f"{a.league} season {sid}: {len(rows)} forecasts written")


if __name__ == "__main__":
    main()
