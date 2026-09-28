#!/usr/bin/env python3
# ============================================================================
# scripts/lab_f4.py
#
# Experiment F4 (registered in lab_experiments before this ran): do team
# ratings read off closing market prices project final league points better
# than Dixon-Coles ratings?
#
#   1. Per match, expected goals (home, away) solved from the de-vigged Avg
#      closing 1X2 and over/under 2.5 prices under independent Poisson
#      (least squares on P(home), P(away), P(over 2.5)).
#   2. Ratings at a cutoff: time-weighted least squares on log expected goals
#      -- intercept, home advantage, attack, defence -- over the league's
#      matches in the 730 days before the cutoff.
#   3. Projection: points won to the cutoff + expected points over the
#      season's remaining matches. Dixon-Coles (production settings) is
#      fitted at the same cutoff and projected the same way.
#
# Checkpoints: the first date by which every team has played 10, 19, 29
# league matches. Score: MSE of projected v actual final points won, paired
# DC minus market per league-season (checkpoints averaged), mean and t.
#
#   python scripts/lab_f4.py                 # tuning (4 half-lives) + validation
#   python scripts/lab_f4.py --open-holdout  # adds the one holdout look (2025/26)
# ============================================================================

import argparse
import os
import subprocess
import sys
from datetime import date

import numpy as np
from scipy.stats import norm

sys.path.insert(0, os.path.dirname(__file__))
from model_experiment import fit as dc_fit, load_matches, probs_1x2  # noqa: E402
from market_ratings import implied_goals, market_ratings, outcome_probs  # noqa: E402  -- shared with the live projection

EXPERIMENT = "F4_market_ratings_table"
HALF_LIVES = (30, 60, 120, 240)
CHECKPOINTS = (10, 19, 29)
LEAGUES = (1, 2, 3, 4)
CURTAILED = {(3, 2019), (4, 2019)}


def exp_points(ph, pd):
    return 3 * ph + pd


def points_won(matches, team, upto=None):
    pts = 0
    for m in matches:
        if upto is not None and m["d"] > upto:
            continue
        if m["h"] == team:
            pts += 3 if m["hg"] > m["ag"] else 1 if m["hg"] == m["ag"] else 0
        elif m["a"] == team:
            pts += 3 if m["ag"] > m["hg"] else 1 if m["hg"] == m["ag"] else 0
    return pts


def checkpoint_dates(season_matches):
    teams = {m["h"] for m in season_matches} | {m["a"] for m in season_matches}
    played = {t: 0 for t in teams}
    out, pending = {}, list(CHECKPOINTS)
    for d in sorted({m["d"] for m in season_matches}):
        for m in season_matches:
            if m["d"] == d:
                played[m["h"]] += 1
                played[m["a"]] += 1
        while pending and min(played.values()) >= pending[0]:
            out[pending.pop(0)] = d
    return out


def evaluate(lines_by_league, matches_by_league, seasons, half_life, dc_cache):
    """Per league-season: mean over checkpoints of MSE (market, DC). Returns list of units."""
    units = []
    for lg in LEAGUES:
        lines, allm = lines_by_league[lg], matches_by_league[lg]
        for yr in seasons:
            if (lg, yr) in CURTAILED:
                continue
            sm = [m for m in allm if m["yr"] == yr]
            if not sm:
                continue
            teams = sorted({m["h"] for m in sm} | {m["a"] for m in sm})
            final = {t: points_won(sm, t) for t in teams}
            mses_m, mses_d, spear_m, spear_d = [], [], [], []
            for k, cut in checkpoint_dates(sm).items():
                rem = [m for m in sm if m["d"] > cut]
                idx, c0, hfa, att, dfn = market_ratings(lines, cut, half_life)
                key = (lg, yr, k)
                if key not in dc_cache:
                    dc_cache[key] = dc_fit(allm, cut, 180, 0.0)
                dc = dc_cache[key]
                if dc is None or any(t not in dc[0] or t not in idx for t in teams):
                    continue
                didx, datt, ddfn, dha, drho = dc
                proj_m = {t: points_won(sm, t, cut) for t in teams}
                proj_d = dict(proj_m)
                if rem:
                    hi = np.array([idx[m["h"]] for m in rem]); ai = np.array([idx[m["a"]] for m in rem])
                    lh = np.exp(c0 + hfa + att[hi] - dfn[ai]); la = np.exp(c0 + att[ai] - dfn[hi])
                    ph, pd, pa, _ = outcome_probs(lh, la)
                    for j, m in enumerate(rem):
                        proj_m[m["h"]] += exp_points(ph[j], pd[j])
                        proj_m[m["a"]] += exp_points(pa[j], pd[j])
                        dlh = np.exp(dha + datt[didx[m["h"]]] - ddfn[didx[m["a"]]])
                        dla = np.exp(datt[didx[m["a"]]] - ddfn[didx[m["h"]]])
                        qh, qd, qa = probs_1x2(dlh, dla, drho)
                        proj_d[m["h"]] += exp_points(qh, qd)
                        proj_d[m["a"]] += exp_points(qa, qd)
                err_m = np.array([proj_m[t] - final[t] for t in teams])
                err_d = np.array([proj_d[t] - final[t] for t in teams])
                mses_m.append(float((err_m ** 2).mean())); mses_d.append(float((err_d ** 2).mean()))
                fin = np.array([final[t] for t in teams])
                rank = lambda v: np.argsort(np.argsort(-np.asarray(v)))
                spear_m.append(float(np.corrcoef(rank([proj_m[t] for t in teams]), rank(fin))[0, 1]))
                spear_d.append(float(np.corrcoef(rank([proj_d[t] for t in teams]), rank(fin))[0, 1]))
            if mses_m:
                units.append({"league": lg, "season": yr, "checkpoints": len(mses_m), "teams": len(teams),
                              "mse_market": float(np.mean(mses_m)), "mse_dc": float(np.mean(mses_d)),
                              "by_checkpoint_market": mses_m, "by_checkpoint_dc": mses_d,
                              "spearman_market": float(np.mean(spear_m)), "spearman_dc": float(np.mean(spear_d))})
    return units


def summarise(units):
    diff = np.array([u["mse_dc"] - u["mse_market"] for u in units])
    n = len(diff)
    se = float(diff.std(ddof=1) / np.sqrt(n)) if n > 1 else float("nan")
    return {
        "league_seasons": n, "team_seasons": int(sum(u["teams"] for u in units)),
        "mse_market": float(np.mean([u["mse_market"] for u in units])),
        "mse_dc": float(np.mean([u["mse_dc"] for u in units])),
        "rmse_market": float(np.sqrt(np.mean([u["mse_market"] for u in units]))),
        "rmse_dc": float(np.sqrt(np.mean([u["mse_dc"] for u in units]))),
        "dc_minus_market": float(diff.mean()), "se": se, "t": float(diff.mean() / se) if se and se == se else None,
        "p_one_sided": float(1 - norm.cdf(diff.mean() / se)) if se and se == se else None,
        "market_better_in": int((diff > 0).sum()),
        "spearman_market": float(np.mean([u["spearman_market"] for u in units])),
        "spearman_dc": float(np.mean([u["spearman_dc"] for u in units])),
        "by_checkpoint": {str(k): {"rmse_market": float(np.sqrt(np.mean([u["by_checkpoint_market"][i] for u in units if len(u["by_checkpoint_market"]) > i]))),
                                   "rmse_dc": float(np.sqrt(np.mean([u["by_checkpoint_dc"][i] for u in units if len(u["by_checkpoint_dc"]) > i])))}
                          for i, k in enumerate(CHECKPOINTS)},
        "units": [{k: v for k, v in u.items() if not k.startswith("by_")} for u in units],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--open-holdout", action="store_true")
    args = ap.parse_args()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    exp = sb.table("lab_experiments").select("*").eq("experiment_id", EXPERIMENT).single().execute().data
    code_ref = os.environ.get("GITHUB_SHA") or subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()

    raw, start = [], 0
    while True:
        page = sb.table("lab_f4_lines").select("*").order("match_id").range(start, start + 999).execute().data or []
        raw += page
        if len(page) < 1000:
            break
        start += 1000
    print(f"{len(raw)} priced matches")
    lines_by_league = {lg: [] for lg in LEAGUES}
    worst = 0.0
    for r in raw:
        lh, la, err = implied_goals(float(r["p_home"]), float(r["p_away"]), float(r["p_over"]))
        worst = max(worst, err)
        lines_by_league[r["league_id"]].append({"d": date.fromisoformat(r["match_date"][:10]), "h": r["home_team_id"], "a": r["away_team_id"], "lh": lh, "la": la})
    print(f"implied goals solved; worst probability residual {worst:.4f}")

    seasons = {s["season_id"]: s["start_year"] for s in sb.table("seasons").select("season_id,start_year").execute().data}
    matches_by_league = {}
    for lg in LEAGUES:
        ms = load_matches(sb, lg)
        for m in ms:
            m["yr"] = seasons.get(m["s"])
        matches_by_league[lg] = ms

    dc_cache = {}
    out = []
    tuning = {}
    for hl in HALF_LIVES:
        tuning[hl] = summarise(evaluate(lines_by_league, matches_by_league, exp["tuning_seasons"], hl, dc_cache))
        s = tuning[hl]
        print(f"tuning hl{hl}: RMSE market {s['rmse_market']:.2f} v DC {s['rmse_dc']:.2f}  (DC-market MSE {s['dc_minus_market']:.2f}, t {s['t']:.2f}, market better in {s['market_better_in']}/{s['league_seasons']})")
        out.append({"experiment_id": EXPERIMENT, "split": "tuning", "variant": f"hl{hl}", "n_matches": s["team_seasons"], "metrics": s, "code_ref": code_ref})
    best = min(HALF_LIVES, key=lambda hl: tuning[hl]["mse_market"])
    print(f"carried forward: half-life {best} days")

    splits = [("validation", [y for y in exp["validation_seasons"]])]
    if args.open_holdout:
        splits.append(("holdout", [y for y in exp["holdout_seasons"] if y <= 2025]))
    for split, yrs in splits:
        s = summarise(evaluate(lines_by_league, matches_by_league, yrs, best, dc_cache))
        s["half_life"] = best
        print(f"{split} hl{best}: RMSE market {s['rmse_market']:.2f} v DC {s['rmse_dc']:.2f}  (DC-market MSE {s['dc_minus_market']:.2f}, market better in {s['market_better_in']}/{s['league_seasons']}); by checkpoint {s['by_checkpoint']}")
        out.append({"experiment_id": EXPERIMENT, "split": split, "variant": f"hl{best}", "n_matches": s["team_seasons"], "metrics": s, "code_ref": code_ref})

    for row in sorted(out, key=lambda r: r["split"] == "holdout"):
        sb.table("lab_scorings").insert(row).execute()
    sb.table("lab_experiments").update({"variants_tried": len(HALF_LIVES), "status": "holdout_opened" if args.open_holdout else "validated"}).eq("experiment_id", EXPERIMENT).execute()


if __name__ == "__main__":
    main()
