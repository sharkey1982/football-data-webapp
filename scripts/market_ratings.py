#!/usr/bin/env python3
# ============================================================================
# scripts/market_ratings.py
#
# Team ratings read off betting-market prices -- the method that passed Model
# Lab experiment F4 (28 Sep 2026: final-points RMSE 7.6 v 8.5 for Dixon-Coles
# over 2019/20-2025/26, better in the sealed 2025/26 holdout in all four
# English leagues). One source of truth for the lab scorer (lab_f4.py) and
# the live projection (simulate_final_table.py).
#
#   1. implied_goals: per match, expected goals (home, away) solved from the
#      de-vigged 1X2 and over/under 2.5 prices under independent Poisson.
#   2. market_ratings: time-weighted least squares on log expected goals --
#      intercept, home advantage, attack, defence -- over the league's
#      matches in the 730 days before the cutoff. F4 chose a 30-day
#      half-life on the tuning seasons.
# ============================================================================

from datetime import date, timedelta

import numpy as np
from scipy.optimize import least_squares
from scipy.special import gammaln

HALF_LIFE_DAYS = 30   # F4 tuning result
WINDOW_DAYS = 730
G = np.arange(13)


def pois(lam):
    """Poisson pmf over 0..12 goals for an array of rates -> (n, 13)."""
    lam = np.asarray(lam, float)[:, None]
    return np.exp(G * np.log(lam) - lam - gammaln(G + 1))


def outcome_probs(lh, la):
    """Independent Poisson P(home), P(draw), P(away), P(over 2.5) for arrays of rates."""
    ph, pa = pois(lh), pois(la)
    grid = ph[:, :, None] * pa[:, None, :]
    home = np.tril(np.ones((13, 13)), -1)
    tot = G[:, None] + G[None, :]
    return ((grid * home).sum((1, 2)), (grid * np.eye(13)).sum((1, 2)), (grid * home.T).sum((1, 2)),
            (grid * (tot > 2.5)).sum((1, 2)))


def implied_goals(p_home, p_away, p_over):
    """Expected goals (home, away) matching the market's P(home), P(away), P(over 2.5).
    Returns (home, away, largest probability residual)."""
    def resid(x):
        h, _, a, o = outcome_probs(np.exp(x[:1]), np.exp(x[1:]))
        return np.array([h[0] - p_home, a[0] - p_away, o[0] - p_over])
    r = least_squares(resid, x0=np.log([1.45, 1.15]), bounds=([-3, -3], [2, 2]), xtol=1e-10, ftol=1e-12)
    return float(np.exp(r.x[0])), float(np.exp(r.x[1])), float(np.abs(r.fun).max())


def market_ratings(lines, as_of, half_life=HALF_LIFE_DAYS):
    """lines: [{d, h, a, lh, la}] for one league. Returns (idx, intercept, home, attack, defence);
    expected goals are exp(intercept + home + attack[h] - defence[a]) and exp(intercept + attack[a] - defence[h])."""
    start = as_of - timedelta(days=WINDOW_DAYS)
    win = [r for r in lines if start < r["d"] <= as_of]
    teams = sorted({r["h"] for r in win} | {r["a"] for r in win})
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    rows, y, w = [], [], []
    for r in win:
        wt = 0.5 ** ((as_of - r["d"]).days / half_life)
        for home, att_t, def_t, lam in ((1, r["h"], r["a"], r["lh"]), (0, r["a"], r["h"], r["la"])):
            x = np.zeros(2 + 2 * n)
            x[0], x[1] = 1, home
            x[2 + idx[att_t]] = 1
            x[2 + n + idx[def_t]] = -1
            rows.append(x); y.append(np.log(lam)); w.append(wt)
    X, y, sw = np.array(rows), np.array(y), np.sqrt(np.array(w))
    ridge = 1e-4
    A = np.vstack([X * sw[:, None], np.sqrt(ridge) * np.hstack([np.zeros((2 * n, 2)), np.eye(2 * n)])])
    b = np.concatenate([y * sw, np.zeros(2 * n)])
    beta = np.linalg.lstsq(A, b, rcond=None)[0]
    return idx, beta[0], beta[1], beta[2:2 + n], beta[2 + n:]


def lines_from_rows(rows):
    """Rows with match_date, home_team_id, away_team_id, p_home, p_away, p_over -> rating inputs."""
    out = []
    for r in rows:
        lh, la, _ = implied_goals(float(r["p_home"]), float(r["p_away"]), float(r["p_over"]))
        out.append({"d": date.fromisoformat(str(r["match_date"])[:10]), "h": r["home_team_id"], "a": r["away_team_id"],
                    "lh": lh, "la": la})
    return out
