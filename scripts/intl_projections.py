"""International projections (model IP1) and the Nations League simulator.

IP1 is a Poisson goals model with a Dixon-Coles low-score correction whose
only team input is the World Football Elo gap -- nations play about ten games
a year, too few to rate attack and defence separately. For each game:

    log lambda_home = mu + kind + e*|d| + g*home + b*d
    log lambda_away = mu + kind + e*|d|          - b*d

where d = (Elo_home - Elo_away) / 400 before the game, home = 1 unless the
ground is neutral, and kind is the competition type (friendly, qualifying,
Nations League, tournament). Fitted on every game since 1980, weighted with an
8-year half-life. Scores are 90-minute scores where known.

Walk-forward test, 2012-2025 (13,501 games, each year predicted from a fit on
the years before it): log loss 0.8865 / RPS 0.1746, level with the Elo
expectation turned into win/draw/loss by an ordered logit (0.8861 / 0.1743),
and well calibrated for home win and draw (within ~2 points in every decile).
So IP1 adds scorelines and expected goals, not sharper win/draw/loss odds:
a recent-form term made it worse (0.8874). Totals are less well calibrated
(over 2.5 goals over-confident at the extremes), so the pages show win/draw/
loss, expected goals and likeliest scores, not goal lines.

Current ratings come from the results file plus the scores the Nations League
fixture feed reports for games the file hasn't caught up with (K 40, as in
the Elo method), so a group simulation sees the latest table.
"""

from __future__ import annotations

from collections import defaultdict

import numpy as np
from scipy.optimize import minimize
from scipy.stats import poisson

MODEL = "IP1"
KINDS = ["friendly", "qualifying", "nations_league", "tournament"]
MAXG = 10
HALF_LIFE = 8.0
FIT_FROM = 1980
SIMS = 10000
ELO_HOME = 100
NL_K = 40


def _x(games: list, kind_of: dict):
    d = np.array([(g["elo_home_pre"] - g["elo_away_pre"]) / 400 for g in games])
    home = np.array([0.0 if g["neutral"] else 1.0 for g in games])
    K = np.array([[1.0 if kind_of.get(g["competition"]) == k else 0.0 for k in KINDS[1:]] for g in games]).reshape(len(games), 3)
    return d, home, K


def lambdas(p, d, home, K):
    mu, g, b, k1, k2, k3, _rho, e = p
    base = mu + K @ np.array([k1, k2, k3]) + e * np.abs(d)
    return np.exp(base + g * home + b * d), np.exp(base - b * d)


def _tau(x, y, lh, la, rho):
    t = np.ones(np.broadcast(x, y, lh).shape)
    t = np.where((x == 0) & (y == 0), 1 - lh * la * rho, t)
    t = np.where((x == 0) & (y == 1), 1 + lh * rho, t)
    t = np.where((x == 1) & (y == 0), 1 + la * rho, t)
    t = np.where((x == 1) & (y == 1), 1 - rho, t)
    return t


def fit(matches: list, kind_of: dict, through_year: int) -> list:
    """IP1 parameters from games FIT_FROM..through_year (inclusive)."""
    games = [m for m in matches if m["elo_home_pre"] is not None and FIT_FROM <= int(m["match_date"][:4]) <= through_year]
    d, home, K = _x(games, kind_of)
    hs = np.array([m["home_score_90"] if m["home_score_90"] is not None else m["home_score"] for m in games])
    as_ = np.array([m["away_score_90"] if m["away_score_90"] is not None else m["away_score"] for m in games])
    yr = np.array([int(m["match_date"][:4]) + int(m["match_date"][5:7]) / 12 for m in games])
    w = 0.5 ** ((through_year + 1 - yr) / HALF_LIFE)

    def nll(p):
        lh, la = lambdas(p, d, home, K)
        ll = poisson.logpmf(hs, lh) + poisson.logpmf(as_, la) + np.log(np.clip(_tau(hs, as_, lh, la, p[6]), 1e-9, None))
        return -(w * ll).sum() / w.sum()

    return [float(v) for v in minimize(nll, [0.2, 0.3, 1.0, 0, 0, 0, -0.05, 0], method="L-BFGS-B").x]


def grid(p, elo_home: float, elo_away: float, neutral: bool, kind: str) -> np.ndarray:
    """Scoreline probabilities [home goals, away goals] for one game."""
    d = np.array([(elo_home - elo_away) / 400])
    home = np.array([0.0 if neutral else 1.0])
    K = np.array([[1.0 if kind == k else 0.0 for k in KINDS[1:]]])
    lh, la = lambdas(p, d, home, K)
    g = np.arange(MAXG + 1)
    M = poisson.pmf(g[:, None], lh[0]) * poisson.pmf(g[None, :], la[0])
    X, Y = np.meshgrid(g, g, indexing="ij")
    M = M * _tau(X, Y, lh[0], la[0], p[6])
    return M / M.sum()


def project(p, elo_home: float, elo_away: float, neutral: bool, kind: str) -> dict:
    M = grid(p, elo_home, elo_away, neutral, kind)
    g = np.arange(M.shape[0])
    X, Y = np.meshgrid(g, g, indexing="ij")
    flat = sorted(((float(M[i, j]), i, j) for i in range(M.shape[0]) for j in range(M.shape[1])), reverse=True)[:5]
    return {
        "p_home": round(float(M[X > Y].sum()), 4), "p_draw": round(float(M[X == Y].sum()), 4),
        "p_away": round(float(M[X < Y].sum()), 4),
        "xg_home": round(float((M.sum(1) * g).sum()), 2), "xg_away": round(float((M.sum(0) * g).sum()), 2),
        "scores": [{"h": i, "a": j, "p": round(pr, 4)} for pr, i, j in flat],
    }


def current_ratings(matches: list, reported: list) -> dict:
    """Each team's Elo after its latest game in the results file, then the
    feed-reported results (played, not yet in the file) applied in date order."""
    rating = {}
    for m in sorted(matches, key=lambda m: m["match_date"]):
        rating[m["home_team"]] = m["elo_home_pre"] + m["elo_change"]
        rating[m["away_team"]] = m["elo_away_pre"] - m["elo_change"]
    for f in sorted(reported, key=lambda f: f["kickoff_utc"]):
        h, a = f["home_team"], f["away_team"]
        rh, ra = rating.get(h, 1500.0), rating.get(a, 1500.0)
        we = 1 / (10 ** (-(rh - ra + ELO_HOME) / 400) + 1)
        hs, as_ = int(f["home_score"]), int(f["away_score"])
        w = 1.0 if hs > as_ else 0.0 if hs < as_ else 0.5
        margin = abs(hs - as_)
        mult = 1.0 if margin <= 1 else 1.5 if margin == 2 else (11 + margin) / 8
        ch = NL_K * mult * (w - we)
        rating[h], rating[a] = rh + ch, ra - ch
    return rating


def simulate_groups(p, groups: dict, played: list, remaining: list, rating: dict, seed: int = 7) -> list:
    """Monte Carlo of a round-robin league phase. groups: label -> teams;
    played: (home, away, hs, as); remaining: (home, away, neutral). Ranks by
    points, goal difference, goals scored, then at random (the official
    head-to-head tie-breakers aren't modelled). Returns one row per team."""
    rng = np.random.default_rng(seed)
    group_of = {t: g for g, ts in groups.items() for t in ts}
    base = {t: np.zeros(3) for t in group_of}  # points, gd, gf
    played_n = defaultdict(int)
    for h, a, hs, as_ in played:
        if h not in group_of or a not in group_of:
            continue
        base[h] += [3 if hs > as_ else 1 if hs == as_ else 0, hs - as_, hs]
        base[a] += [3 if as_ > hs else 1 if hs == as_ else 0, as_ - hs, as_]
        played_n[h] += 1
        played_n[a] += 1
    pts = {t: np.full(SIMS, base[t][0]) for t in group_of}
    gd = {t: np.full(SIMS, base[t][1]) for t in group_of}
    gf = {t: np.full(SIMS, base[t][2]) for t in group_of}
    for h, a, neutral in remaining:
        if h not in group_of or a not in group_of:
            continue
        M = grid(p, rating.get(h, 1500.0), rating.get(a, 1500.0), neutral, "nations_league")
        idx = rng.choice(M.size, size=SIMS, p=M.ravel())
        hs, as_ = idx // M.shape[1], idx % M.shape[1]
        pts[h] += np.where(hs > as_, 3, np.where(hs == as_, 1, 0))
        pts[a] += np.where(as_ > hs, 3, np.where(hs == as_, 1, 0))
        gd[h] += hs - as_
        gd[a] += as_ - hs
        gf[h] += hs
        gf[a] += as_
    out = []
    for g, ts in groups.items():
        ts = sorted(ts)
        key = np.stack([pts[t] * 1e6 + (gd[t] + 500) * 1e3 + gf[t] + rng.random(SIMS) * 0.5 for t in ts])
        order = (-key).argsort(0).argsort(0)  # rank of each team in each sim (0 = top)
        for i, t in enumerate(ts):
            pos = [round(float((order[i] == k).mean()), 4) for k in range(len(ts))]
            out.append({"group_label": g, "team": t, "played": played_n[t], "points": int(base[t][0]),
                        "gd": int(base[t][1]), "gf": int(base[t][2]), "p_pos": pos,
                        "exp_points": round(float(pts[t].mean()), 2), "sims": SIMS})
    return out


def build_projections(matches: list, fixtures: list, kind_of: dict, edition_key: str = "UNL-2026-27") -> dict:
    """Model parameters, a projection for every unplayed fixture, and the group
    odds for the Nations League league phase."""
    latest_year = max(int(m["match_date"][:4]) for m in matches)
    p = fit(matches, kind_of, latest_year)
    # A fixture is played if the results file has it (same pair within a day) or the feed reports a score.
    played_keys = {(m["home_team"], m["away_team"], m["match_date"]) for m in matches}

    def in_file(f):
        from datetime import date, timedelta
        d = date.fromisoformat(f["kickoff_utc"][:10])
        return any((f["home_team"], f["away_team"], (d + timedelta(days=k)).isoformat()) in played_keys for k in (-1, 0, 1))

    reported = [f for f in fixtures if f.get("home_score") is not None and f.get("away_score") is not None and not in_file(f)]
    rating = current_ratings(matches, reported)
    upcoming = [f for f in fixtures if f.get("home_score") is None and not in_file(f)]
    rows = []
    for f in upcoming:
        eh, ea = rating.get(f["home_team"], 1500.0), rating.get(f["away_team"], 1500.0)
        rows.append({"fixture_key": f["fixture_key"], "home_team": f["home_team"], "away_team": f["away_team"],
                     "kickoff_utc": f["kickoff_utc"], "neutral": False, "elo_home": round(eh, 1), "elo_away": round(ea, 1),
                     "model": MODEL, **project(p, eh, ea, False, "nations_league")})
    # Nations League league phase.
    groups = defaultdict(set)
    for f in fixtures:
        if f.get("group_label") and f["edition_key"] == edition_key:
            groups[f["group_label"]] |= {f["home_team"], f["away_team"]}
    lp = [m for m in matches if m.get("edition_key") == edition_key and m.get("stage_code") == "LP"]
    played = [(m["home_team"], m["away_team"], m["home_score"], m["away_score"]) for m in lp]
    played += [(f["home_team"], f["away_team"], int(f["home_score"]), int(f["away_score"])) for f in reported
               if f.get("group_label") and f["edition_key"] == edition_key]
    remaining = [(f["home_team"], f["away_team"], False) for f in upcoming if f.get("group_label") and f["edition_key"] == edition_key]
    odds = simulate_groups(p, {g: sorted(ts) for g, ts in groups.items()}, played, remaining, rating) if groups else []
    for o in odds:
        o["edition_key"] = edition_key
    return {"model": {"model": MODEL, "params": p, "fitted_through": latest_year}, "projections": rows, "group_odds": odds}
