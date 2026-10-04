#!/usr/bin/env python3
# ============================================================================
# scripts/lab_nfl.py
#
# NFL Model Lab scorers (registered in lab_experiments before running; see
# supabase/migrations/20261004171000_lab_nfl_register.sql and
# docs/experiments.md):
#
#   n0  Market benchmark: closing moneyline (two-way, basic de-vig) v the
#       closing spread read as Normal(spread, sigma), sigma fitted on tuning.
#   n1  Margin-of-victory Elo (grid of 36 variants, chosen on tuning) v the
#       N0 benchmark and a home-field-only baseline; log-linear pool test.
#       Scores the sealed holdout ONCE (the database refuses a second look).
#
# Splits: tuning 2010-2023, validation 2024, holdout 2025 + 2026 (all game
# types; ties excluded from win metrics). 2002-2009 is Elo burn-in only.
#
#   python scripts/lab_nfl.py n0                 score N0, fix the benchmark
#   python scripts/lab_nfl.py n1                 N1 tuning + validation
#   python scripts/lab_nfl.py n1 --open-holdout  N1 holdout only (once), then conclude
#   python scripts/lab_nfl.py n0|n1 --csv games.csv --dry
#
# --dry never touches the database and never computes the holdout, so the
# code can be tested without looking at the sealed seasons.
# ============================================================================

import argparse
import csv
import json
import math
import os
import sys
from collections import defaultdict

import numpy as np
from scipy.optimize import minimize_scalar
from scipy.stats import norm

TUNING = set(range(2010, 2024))
VALIDATION = {2024}
HOLDOUT = {2025, 2026}
CODE_REF = os.environ.get("GITHUB_SHA", "local")[:12]
EPS = 1e-12


# ---- data ---------------------------------------------------------------------------

def num(v):
    if v is None or v == "" or v == "NA":
        return None
    f = float(v)
    return f


def load_db(sb) -> list[dict]:
    cols = "game_id,season,week,game_type,gameday,kickoff_at,home_franchise,away_franchise,home_score,away_score,neutral_site,spread_line,home_moneyline,away_moneyline"
    out, page = [], 0
    while True:
        chunk = (sb.table("nfl_lab_games").select(cols).not_.is_("home_score", "null")
                 .order("gameday").order("game_id").range(page * 1000, page * 1000 + 999).execute().data)
        out += chunk
        if len(chunk) < 1000:
            break
        page += 1
    return out


def load_csv(path: str) -> list[dict]:
    codes = {"OAK": "LV", "SD": "LAC", "STL": "LA"}
    out = []
    for g in csv.DictReader(open(path)):
        if int(g["season"]) < 2002 or g["home_score"] in ("", "NA"):
            continue
        out.append({
            "game_id": g["game_id"], "season": int(g["season"]), "week": int(g["week"]), "game_type": g["game_type"],
            "gameday": g["gameday"], "home_franchise": codes.get(g["home_team"], g["home_team"]),
            "away_franchise": codes.get(g["away_team"], g["away_team"]),
            "home_score": int(g["home_score"]), "away_score": int(g["away_score"]),
            "neutral_site": g["location"] == "Neutral", "spread_line": num(g["spread_line"]),
            "home_moneyline": num(g["home_moneyline"]), "away_moneyline": num(g["away_moneyline"]),
        })
    out.sort(key=lambda r: (r["gameday"], r["game_id"]))
    return out


def split_of(season: int) -> str | None:
    if season in TUNING:
        return "tuning"
    if season in VALIDATION:
        return "validation"
    if season in HOLDOUT:
        return "holdout"
    return None


# ---- metrics ----------------------------------------------------------------------------

def logloss(p: np.ndarray, y: np.ndarray) -> np.ndarray:
    p = np.clip(p, EPS, 1 - EPS)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def paired(a: np.ndarray, b: np.ndarray, clusters: list[str]) -> dict:
    """Mean of a - b with a week-clustered standard error. Negative = a better."""
    d = a - b
    n = len(d)
    mean = float(d.mean())
    sums = defaultdict(float)
    for di, c in zip(d - mean, clusters):
        sums[c] += di
    se = math.sqrt(sum(v * v for v in sums.values())) / n
    return {"diff": mean, "se": se, "t": mean / se if se > 0 else 0.0, "n": n}


# ---- market --------------------------------------------------------------------------------

def american_to_prob(ml: float) -> float:
    return 100 / (ml + 100) if ml > 0 else -ml / (-ml + 100)


def moneyline_prob(g: dict) -> float | None:
    if g["home_moneyline"] is None or g["away_moneyline"] is None:
        return None
    ph, pa = american_to_prob(g["home_moneyline"]), american_to_prob(g["away_moneyline"])
    return ph / (ph + pa)


def spread_prob(g: dict, sigma: float) -> float | None:
    if g["spread_line"] is None:
        return None
    return float(norm.cdf(g["spread_line"] / sigma))


def fit_sigma(games: list[dict]) -> float:
    s = np.array([g["spread_line"] for g in games])
    y = np.array([1.0 if g["home_score"] > g["away_score"] else 0.0 for g in games])
    res = minimize_scalar(lambda sig: logloss(norm.cdf(s / sig), y).mean(), bounds=(5, 25), method="bounded")
    return float(res.x)


# ---- Elo -------------------------------------------------------------------------------------

def run_elo(games: list[dict], k: float, hfa: float, reg: float) -> dict[str, tuple[float, float]]:
    """Walk-forward: returns game_id -> (pre-game P(home win), Elo edge incl. home advantage)."""
    r: dict[str, float] = defaultdict(lambda: 1500.0)
    season = None
    out = {}
    for g in games:
        if g["season"] != season:
            season = g["season"]
            for t in list(r):
                r[t] = 1500 + (1 - reg) * (r[t] - 1500)
        h, a = g["home_franchise"], g["away_franchise"]
        edge = r[h] - r[a] + (0 if g["neutral_site"] else hfa)
        p = 1 / (1 + 10 ** (-edge / 400))
        out[g["game_id"]] = (p, edge)
        margin = g["home_score"] - g["away_score"]
        result = 1.0 if margin > 0 else 0.0 if margin < 0 else 0.5
        winner_edge = edge if margin > 0 else -edge if margin < 0 else 0.0
        mult = math.log(abs(margin) + 1) * 2.2 / (winner_edge * 0.001 + 2.2)
        delta = k * mult * (result - p)
        r[h] += delta
        r[a] -= delta
    return out


# ---- log-linear pool ---------------------------------------------------------------------------

def logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-9, 1 - 1e-9)
    return np.log(p / (1 - p))


def fit_pool(pm: np.ndarray, pe: np.ndarray, y: np.ndarray, clusters: list[str]) -> dict:
    """logit p = a*logit(pm) + b*logit(pe), no intercept; Newton; cluster-robust SEs."""
    X = np.column_stack([logit(pm), logit(pe)])
    w = np.array([1.0, 0.0])
    for _ in range(50):
        p = 1 / (1 + np.exp(-X @ w))
        grad = X.T @ (y - p)
        H = (X * (p * (1 - p))[:, None]).T @ X
        step = np.linalg.solve(H, grad)
        w += step
        if np.abs(step).max() < 1e-10:
            break
    p = 1 / (1 + np.exp(-X @ w))
    Hinv = np.linalg.inv((X * (p * (1 - p))[:, None]).T @ X)
    meat = np.zeros((2, 2))
    groups = defaultdict(lambda: np.zeros(2))
    for xi, ri, c in zip(X, y - p, clusters):
        groups[c] += xi * ri
    for v in groups.values():
        meat += np.outer(v, v)
    cov = Hinv @ meat @ Hinv
    se = np.sqrt(np.diag(cov))
    return {"a": float(w[0]), "b": float(w[1]), "se_a": float(se[0]), "se_b": float(se[1]), "t_b": float(w[1] / se[1])}


def pool_prob(fit: dict, pm: np.ndarray, pe: np.ndarray) -> np.ndarray:
    return 1 / (1 + np.exp(-(fit["a"] * logit(pm) + fit["b"] * logit(pe))))


# ---- experiments ------------------------------------------------------------------------------------

def decided(g: dict) -> bool:
    return g["home_score"] != g["away_score"]


def outcome(rows: list[dict]) -> np.ndarray:
    return np.array([1.0 if g["home_score"] > g["away_score"] else 0.0 for g in rows])


def clusters_of(rows: list[dict]) -> list[str]:
    return [f'{g["season"]}-{g["week"]}' for g in rows]


def n0(games: list[dict], dry: bool):
    priced = [g for g in games if decided(g) and moneyline_prob(g) is not None and g["spread_line"] is not None]
    tun = [g for g in priced if split_of(g["season"]) == "tuning"]
    sigma = fit_sigma(tun)
    results = {}
    for split in ("tuning", "validation"):
        rows = [g for g in priced if split_of(g["season"]) == split]
        y = outcome(rows)
        ml = logloss(np.array([moneyline_prob(g) for g in rows]), y)
        sp = logloss(np.array([spread_prob(g, sigma) for g in rows]), y)
        results[split] = {"n": len(rows), "moneyline": float(ml.mean()), "spread": float(sp.mean()),
                          "spread_minus_moneyline": paired(sp, ml, clusters_of(rows))}
    tun_diff = results["tuning"]["spread_minus_moneyline"]["diff"]
    winner = "spread_normal" if tun_diff < -0.001 else "moneyline_basic"
    print(json.dumps({"sigma": sigma, **results, "winner": winner}, indent=2))
    return {"sigma": sigma, "results": results, "winner": winner}


def market_probs(games: list[dict], n0res: dict) -> dict[str, float]:
    out = {}
    for g in games:
        p = moneyline_prob(g) if n0res["winner"] == "moneyline_basic" else spread_prob(g, n0res["sigma"])
        if p is not None:
            out[g["game_id"]] = p
    return out


def n1(games: list[dict], dry: bool, n0res: dict, holdout: bool = False):
    mkt = market_probs(games, n0res)
    grid = [(k, h, r) for k in (15, 20, 25, 30) for h in (30, 45, 60) for r in (0.25, 0.33, 0.5)]
    tun_rows = [g for g in games if split_of(g["season"]) == "tuning" and decided(g)]
    y_t = outcome(tun_rows)
    scored = []
    runs = {}
    for v in grid:
        runs[v] = run_elo(games, *v)
        p = np.array([runs[v][g["game_id"]][0] for g in tun_rows])
        scored.append((float(logloss(p, y_t).mean()), v))
    scored.sort()
    best = scored[0][1]
    elo = runs[best]
    home_rate = float(np.mean([1.0 if g["home_score"] > g["away_score"] else 0.0 for g in tun_rows if not g["neutral_site"]]))

    def baseline(g):
        return 0.5 if g["neutral_site"] else home_rate

    def split_metrics(split: str, pool_fit: dict | None):
        rows = [g for g in games if split_of(g["season"]) == split and decided(g)]
        y = outcome(rows)
        cl = clusters_of(rows)
        pe = np.array([elo[g["game_id"]][0] for g in rows])
        pb = np.array([baseline(g) for g in rows])
        ll_e, ll_b = logloss(pe, y), logloss(pb, y)
        priced = [i for i, g in enumerate(rows) if g["game_id"] in mkt]
        pm = np.array([mkt[rows[i]["game_id"]] for i in priced])
        yp = y[priced]
        clp = [cl[i] for i in priced]
        ll_m = logloss(pm, yp)
        ll_ep = ll_e[priced]
        margin = np.array([g["home_score"] - g["away_score"] for g in rows])
        pred_margin = np.array([elo[g["game_id"]][1] / 25 for g in rows])
        spread = np.array([rows[i]["spread_line"] if rows[i]["spread_line"] is not None else np.nan for i in range(len(rows))])
        has_spread = ~np.isnan(spread)
        m = {
            "n": len(rows), "n_priced": len(priced),
            "logloss_elo": float(ll_e.mean()), "logloss_baseline": float(ll_b.mean()),
            "elo_minus_baseline": paired(ll_e, ll_b, cl),
            "logloss_market": float(ll_m.mean()), "logloss_elo_priced": float(ll_ep.mean()),
            "elo_minus_market": paired(ll_ep, ll_m, clp),
            "margin_mae_elo": float(np.abs(margin - pred_margin).mean()),
            "margin_mae_spread": float(np.abs(margin[has_spread] - spread[has_spread]).mean()),
            "margin_mae_elo_same_games": float(np.abs(margin[has_spread] - pred_margin[has_spread]).mean()),
        }
        if pool_fit is not None:
            pp = pool_prob(pool_fit, pm, pe[priced])
            m["logloss_pool"] = float(logloss(pp, yp).mean())
            m["pool_minus_market"] = paired(logloss(pp, yp), ll_m, clp)
        return m, rows, pe, priced, pm, yp, clp

    t_metrics, t_rows, t_pe, t_priced, t_pm, t_yp, t_clp = split_metrics("tuning", None)
    pool = fit_pool(t_pm, t_pe[t_priced], t_yp, t_clp)
    t_metrics, *_ = split_metrics("tuning", pool)
    v_metrics, *_ = split_metrics("validation", pool)
    t_metrics.update({"variant": {"k": best[0], "hfa": best[1], "reg": best[2]}, "home_rate": home_rate,
                      "grid_top5": [{"logloss": s, "k": v[0], "hfa": v[1], "reg": v[2]} for s, v in scored[:5]], "pool": pool})
    b_ok = pool["b"] > 0 and pool["t_b"] > 2 and v_metrics["pool_minus_market"]["diff"] < 0
    out = {"tuning": t_metrics, "validation": v_metrics, "pool_goes_to_holdout": b_ok}
    if holdout and not dry:
        h_metrics, *_ = split_metrics("holdout", pool if b_ok else None)
        out["holdout"] = h_metrics
    print(json.dumps(out, indent=2))
    return out, best


def write(sb, experiment: str, split: str, variant: str, n: int, metrics: dict):
    sb.table("lab_scorings").insert({"experiment_id": experiment, "split": split, "variant": variant, "n_matches": n,
                                     "metrics": metrics, "code_ref": CODE_REF}).execute()


def conclude(sb, experiment: str, status: str, conclusion: str, variants: int):
    sb.table("lab_experiments").update({"status": status, "conclusion": conclusion, "variants_tried": variants,
                                        "concluded_at": "now()"}).eq("experiment_id", experiment).execute()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["n0", "n1"])
    ap.add_argument("--csv")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--open-holdout", action="store_true", help="n1: score the sealed holdout (once) and conclude")
    args = ap.parse_args()
    if args.dry and not args.csv:
        sys.exit("--dry needs --csv")
    sb = None
    if not args.dry:
        from supabase import create_client
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    games = load_csv(args.csv) if args.csv else load_db(sb)
    if args.dry:
        games = [g for g in games if g["season"] not in HOLDOUT]

    n0res = n0(games, args.dry)
    if args.command == "n0" and not args.dry:
        for split, r in n0res["results"].items():
            write(sb, "N0", split, "moneyline_basic", r["n"], {"logloss": r["moneyline"]})
            write(sb, "N0", split, "spread_normal", r["n"], {"logloss": r["spread"], "sigma": n0res["sigma"],
                                                              "spread_minus_moneyline": r["spread_minus_moneyline"]})
        t = n0res["results"]["tuning"]
        conclude(sb, "N0", "passed",
                 f"Benchmark fixed: {n0res['winner']}. Tuning log loss moneyline {t['moneyline']:.5f} v spread {t['spread']:.5f} "
                 f"(sigma {n0res['sigma']:.2f}); validation {n0res['results']['validation']['moneyline']:.5f} v "
                 f"{n0res['results']['validation']['spread']:.5f}.", 2)

    if args.command == "n1":
        out, best = n1(games, args.dry, n0res, holdout=args.open_holdout)
        if args.dry:
            return
        variant = f"k{best[0]}_hfa{best[1]}_reg{best[2]}"
        if not args.open_holdout:
            for split in ("tuning", "validation"):
                write(sb, "N1", split, variant, out[split]["n"], out[split])
            sb.table("lab_experiments").update({"status": "validated", "variants_tried": 36}).eq("experiment_id", "N1").execute()
            return
        h = out["holdout"]
        write(sb, "N1", "holdout", variant, h["n"], {**h, "pool_goes_to_holdout": out["pool_goes_to_holdout"]})
        a_pass = h["elo_minus_baseline"]["diff"] < 0 and h["elo_minus_baseline"]["t"] < -2
        b_pass = out["pool_goes_to_holdout"] and h.get("pool_minus_market", {}).get("t", 0) < -2
        conclude(sb, "N1", "passed" if a_pass else "failed",
                 f"(A) display: Elo v home-field baseline on holdout {h['elo_minus_baseline']['diff']:+.4f} nats "
                 f"(t {h['elo_minus_baseline']['t']:.1f}) -> {'pass' if a_pass else 'fail'}. "
                 f"Elo v market on holdout {h['elo_minus_market']['diff']:+.4f} (t {h['elo_minus_market']['t']:.1f}). "
                 f"(B) market value: pool b = {out['tuning']['pool']['b']:.3f} (t {out['tuning']['pool']['t_b']:.1f}); "
                 + (("pool scored on holdout: " + ("pass" if b_pass else "fail")) if out["pool_goes_to_holdout"]
                    else "null result, pool not scored on holdout") + ".", 36)


if __name__ == "__main__":
    main()
