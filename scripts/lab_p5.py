#!/usr/bin/env python3
# ============================================================================
# scripts/lab_p5.py
#
# Experiment P5 (registered in lab_experiments before this ran): do expected
# goals from market ratings (F4 method, half-life 30 days, fixed) forecast
# each side's goals and clean sheets better than the walk-forward
# Dixon-Coles prediction made at the same forecast date?
#
# For every DC walk-forward forecast (dc_walkforward_v1, hl180_s0: match,
# as_of_date), market ratings are fitted on closing prices of the league's
# matches up to as_of_date and give the match's expected goals. Scored on:
#   primary    Poisson log loss of home goals + away goals, paired per match
#              (DC minus market; positive = market better), SE clustered by
#              matchday (league x date)
#   secondary  clean-sheet Brier, P(CS) = exp(-opponent expected goals)
#
#   python scripts/lab_p5.py                 # tuning + validation
#   python scripts/lab_p5.py --open-holdout  # adds the one holdout look
# ============================================================================

import argparse
import os
import subprocess
import sys
from datetime import date

import numpy as np
from scipy.special import gammaln
from scipy.stats import norm

sys.path.insert(0, os.path.dirname(__file__))
from market_ratings import lines_from_rows, market_ratings  # noqa: E402

EXPERIMENT = "P5_market_team_goals"


def page_all(sb, table, cols, **eq):
    out, start = [], 0
    while True:
        q = sb.table(table).select(cols)
        for k, v in eq.items():
            q = q.eq(k, v)
        page = q.order("match_id").range(start, start + 999).execute().data or []
        out += page
        if len(page) < 1000:
            return out
        start += 1000


def pois_nll(k, lam):
    return lam - k * np.log(lam) + gammaln(k + 1)


def clustered(diff, cl):
    n, mean = len(diff), diff.mean()
    groups = {}
    for v, c in zip(diff - mean, cl):
        groups[c] = groups.get(c, 0.0) + v
    g = len(groups)
    se = np.sqrt(sum(s * s for s in groups.values()) * g / (g - 1)) / n
    return float(mean), float(se), float(mean / se) if se > 0 else 0.0


def score(rows):
    hg = np.array([r["hg"] for r in rows], float); ag = np.array([r["ag"] for r in rows], float)
    dh = np.array([r["dc_h"] for r in rows]); da = np.array([r["dc_a"] for r in rows])
    mh = np.array([r["mk_h"] for r in rows]); ma = np.array([r["mk_a"] for r in rows])
    cl = np.array([f'{r["league"]}|{r["date"]}' for r in rows])
    ll_dc = pois_nll(hg, dh) + pois_nll(ag, da)
    ll_mk = pois_nll(hg, mh) + pois_nll(ag, ma)
    gain, se, t = clustered(ll_dc - ll_mk, cl)
    cs_home, cs_away = (ag == 0).astype(float), (hg == 0).astype(float)
    br_dc = (np.exp(-da) - cs_home) ** 2 + (np.exp(-dh) - cs_away) ** 2
    br_mk = (np.exp(-ma) - cs_home) ** 2 + (np.exp(-mh) - cs_away) ** 2
    cs_gain, cs_se, cs_t = clustered((br_dc - br_mk) / 2, cl)
    pl = np.array([r["league"] == 1 for r in rows])
    out = {
        "matches": len(rows), "logloss_dc": float(ll_dc.mean()), "logloss_market": float(ll_mk.mean()),
        "gain_market": gain, "se": se, "t": t, "p_one_sided": float(1 - norm.cdf(t)),
        "cs_brier_dc": float(br_dc.mean() / 2), "cs_brier_market": float(br_mk.mean() / 2),
        "cs_gain_market": cs_gain, "cs_t": cs_t,
        "mean_goals": float((hg + ag).mean()), "mean_pred_dc": float((dh + da).mean()), "mean_pred_market": float((mh + ma).mean()),
    }
    if pl.sum() > 10:
        g, s, tt = clustered((ll_dc - ll_mk)[pl], cl[pl])
        out["premier_league"] = {"matches": int(pl.sum()), "gain_market": g, "t": tt,
                                 "cs_brier_dc": float(br_dc[pl].mean() / 2), "cs_brier_market": float(br_mk[pl].mean() / 2)}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--open-holdout", action="store_true")
    args = ap.parse_args()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    exp = sb.table("lab_experiments").select("*").eq("experiment_id", EXPERIMENT).single().execute().data
    code_ref = os.environ.get("GITHUB_SHA") or subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()

    priced = page_all(sb, "lab_f4_lines", "match_id,league_id,start_year,match_date,home_team_id,away_team_id,hg,ag,p_home,p_away,p_over")
    by_id = {r["match_id"]: r for r in priced}
    lines = {lg: [] for lg in (1, 2, 3, 4)}
    for r, ln in zip(priced, lines_from_rows(priced)):
        lines[r["league_id"]].append(ln)
    print(f"{len(priced)} priced matches")

    dc = page_all(sb, "model_experiment_predictions", "match_id,as_of_date,pred_home_goals,pred_away_goals",
                  experiment="dc_walkforward_v1", variant="hl180_s0")
    print(f"{len(dc)} DC forecasts")

    cache, rows, skipped = {}, [], 0
    for p in dc:
        m = by_id.get(p["match_id"])
        if m is None:
            skipped += 1
            continue
        as_of = date.fromisoformat(p["as_of_date"][:10])
        key = (m["league_id"], as_of)
        if key not in cache:
            cache[key] = market_ratings(lines[m["league_id"]], as_of)
        if cache[key] is None:
            skipped += 1
            continue
        idx, c0, hfa, att, dfn = cache[key]
        h, a = m["home_team_id"], m["away_team_id"]
        if h not in idx or a not in idx:
            skipped += 1
            continue
        rows.append({"league": m["league_id"], "year": m["start_year"], "date": m["match_date"][:10], "hg": m["hg"], "ag": m["ag"],
                     "dc_h": float(p["pred_home_goals"]), "dc_a": float(p["pred_away_goals"]),
                     "mk_h": float(np.exp(c0 + hfa + att[idx[h]] - dfn[idx[a]])), "mk_a": float(np.exp(c0 + att[idx[a]] - dfn[idx[h]]))})
    print(f"{len(rows)} matches with both forecasts ({skipped} skipped)")

    splits = [("tuning", exp["tuning_seasons"]), ("validation", exp["validation_seasons"])]
    if args.open_holdout:
        splits.append(("holdout", exp["holdout_seasons"]))
    out = []
    for split, yrs in splits:
        s = score([r for r in rows if r["year"] in yrs])
        s["seasons"] = yrs
        print(split, {k: (round(v, 5) if isinstance(v, float) else v) for k, v in s.items()})
        out.append({"experiment_id": EXPERIMENT, "split": split, "variant": "hl30", "n_matches": s["matches"], "metrics": s, "code_ref": code_ref})
    for row in sorted(out, key=lambda r: r["split"] == "holdout"):
        sb.table("lab_scorings").insert(row).execute()
    sb.table("lab_experiments").update({"variants_tried": 1, "status": "holdout_opened" if args.open_holdout else "validated"}).eq("experiment_id", EXPERIMENT).execute()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        for line in traceback.format_exc().splitlines():
            print(f"::error::{line}")
        raise
