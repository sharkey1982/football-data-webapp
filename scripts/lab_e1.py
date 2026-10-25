#!/usr/bin/env python3
# ============================================================================
# scripts/lab_e1.py
#
# Experiment E1 (registered in lab_experiments before this ran): is the
# Dixon-Coles model, at production settings (dc_v1_1), good enough to show
# for La Liga, the Bundesliga, Serie A, Ligue 1 and the Scottish Premiership?
# Chris, 25 Oct 2026: test those leagues; only leagues where the model is
# roughly as good as the market go live.
#
# Data: football-data.co.uk season files (SP1, D1, I1, F1, SC0), 2017/18 to
# date -- results for the fits and the Avg closing 1X2 line (AvgCH/D/A,
# basic de-vig: the F0 benchmark) for scoring. Read straight from the files:
# the database holds no odds for these leagues (history_backfill_europe.py
# loads results only), and nothing here writes odds or fits to it. Clubs are
# identified by football-data.co.uk's own names, which are stable across a
# league's files.
#
# Model: walk-forward, as model_experiment.py (fit() there, variant hl180_s0,
# which reproduces dc_v1_1): fit as at each 7-day step on the 730 days before
# it, predict the next 7 days. A match is scored when both clubs have 10+
# matches in the window (newly promoted clubs early in a season are skipped:
# production estimates them from the division below, which is not loaded for
# these countries) and the file has its Avg closing line.
#
# Baseline: the league's home/draw/away frequencies over its tuning seasons.
#
# Scored per league and split: mean log loss and 3-way Brier of the model,
# the market and the baseline; paired per-match differences with standard
# errors clustered by matchday (league x date).
#
#   python scripts/lab_e1.py                 # tuning + validation
#   python scripts/lab_e1.py --open-holdout  # adds the one holdout look
# ============================================================================

import argparse
import json
import os
import subprocess
import sys
from datetime import date, timedelta

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from history_backfill import decode, fd_url, fetch, iso_date, parse_fd  # noqa: E402
from model_experiment import fit, probs_1x2  # noqa: E402

EXPERIMENT = "E1_dc_europe"
LEAGUES = {"SP1": "La Liga", "D1": "Bundesliga", "I1": "Serie A", "F1": "Ligue 1", "SC0": "Scottish Premiership"}
FIRST_YEAR = 2017  # two seasons of history before the first tuning season
HALF_LIFE, SHRINK, STEP_DAYS = 180.0, 0.0, 7
RES = {"H": 0, "D": 1, "A": 2}
GAP_LIMIT = 0.025   # registered: model log loss no more than this behind the market
T_LIMIT = 2.58      # registered: model beats the baseline with t above this (5 leagues)


def num(v):
    try:
        x = float(v)
        return x if x > 1.0 else None
    except (TypeError, ValueError):
        return None


def load_league(code, last_year):
    """All played matches 2017/18 onwards from the season files."""
    out = []
    for y in range(FIRST_YEAR, last_year + 1):
        try:
            _, rows = parse_fd(decode(fetch(fd_url(code, y))))
        except RuntimeError as e:
            print(f"{code} {y}: {e}")
            continue
        for r in rows:
            d = iso_date(r.get("Date"))
            if not d or r.get("FTHG", "") == "" or r.get("FTAG", "") == "" or r.get("FTR") not in RES:
                continue
            ch, cd, ca = num(r.get("AvgCH")), num(r.get("AvgCD")), num(r.get("AvgCA"))
            out.append({"d": date.fromisoformat(d), "y": y, "h": r["HomeTeam"].strip(), "a": r["AwayTeam"].strip(),
                        "hg": int(float(r["FTHG"])), "ag": int(float(r["FTAG"])), "res": RES[r["FTR"]],
                        "odds": (ch, cd, ca) if ch and cd and ca else None})
    out.sort(key=lambda m: (m["d"], m["h"]))
    return out


def walk_forward(matches, years):
    """Dixon-Coles forecasts for the matches of the given season start years."""
    preds = []
    for y in years:
        season = [m for m in matches if m["y"] == y]
        if not season:
            continue
        d, last = season[0]["d"] - timedelta(days=1), season[-1]["d"]
        while d < last:
            nxt = [m for m in season if d < m["d"] <= d + timedelta(days=STEP_DAYS)]
            if nxt:
                f = fit(matches, d, HALF_LIFE, SHRINK)
                if f is not None:
                    idx, att, dfn, ha, rho = f
                    for m in nxt:
                        if m["h"] in idx and m["a"] in idx:
                            lh = float(np.exp(ha + att[idx[m["h"]]] - dfn[idx[m["a"]]]))
                            la = float(np.exp(att[idx[m["a"]]] - dfn[idx[m["h"]]]))
                            preds.append((m, probs_1x2(lh, la, rho)))
            d += timedelta(days=STEP_DAYS)
    return preds


def clustered(diff, cl):
    n = len(diff)
    mean = diff.mean()
    groups = {}
    for v, c in zip(diff - mean, cl):
        groups[c] = groups.get(c, 0.0) + v
    g = len(groups)
    se = np.sqrt(sum(s * s for s in groups.values()) * g / (g - 1)) / n if g > 1 else float("nan")
    return float(mean), float(se), float(mean / se) if se and se > 0 else 0.0


def score(rows, base):
    """rows: (match, dc probs) with odds. Returns the metrics dict."""
    y = np.array([m["res"] for m, _ in rows])
    dc = np.clip(np.array([p for _, p in rows], float), 1e-12, 1)
    dc /= dc.sum(1, keepdims=True)
    q = np.array([[1 / o for o in m["odds"]] for m, _ in rows], float)
    margin = q.sum(1) - 1
    mk = q / q.sum(1, keepdims=True)  # basic de-vig
    bl = np.tile(base, (len(y), 1))
    cl = np.array([f'{m["d"]}' for m, _ in rows])
    onehot = np.zeros_like(dc)
    onehot[np.arange(len(y)), y] = 1
    ll = lambda p: -np.log(p[np.arange(len(y)), y])
    br = lambda p: ((p - onehot) ** 2).sum(1)
    lld, llm, llb = ll(dc), ll(mk), ll(bl)
    gap, gap_se, gap_t = clustered(lld - llm, cl)          # positive = model behind the market
    vb, vb_se, vb_t = clustered(llb - lld, cl)             # positive = model better than baseline
    bgap, _, bgap_t = clustered(br(dc) - br(mk), cl)
    return {
        "logloss_dc": float(lld.mean()), "logloss_market": float(llm.mean()), "logloss_baseline": float(llb.mean()),
        "brier_dc": float(br(dc).mean()), "brier_market": float(br(mk).mean()), "brier_baseline": float(br(bl).mean()),
        "dc_minus_market": gap, "dc_minus_market_se": gap_se, "dc_minus_market_t": gap_t,
        "baseline_minus_dc": vb, "baseline_minus_dc_se": vb_se, "baseline_minus_dc_t": vb_t,
        "brier_dc_minus_market": bgap, "brier_dc_minus_market_t": bgap_t,
        "mean_overround": float(margin.mean()), "matchdays": int(len(set(cl))),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--open-holdout", action="store_true")
    args = ap.parse_args()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    exp = sb.table("lab_experiments").select("*").eq("experiment_id", EXPERIMENT).single().execute().data
    tuning, validation, holdout = exp["tuning_seasons"], exp["validation_seasons"], exp["holdout_seasons"]
    code_ref = os.environ.get("GITHUB_SHA") or subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    splits = [("tuning", tuning), ("validation", validation)] + ([("holdout", holdout)] if args.open_holdout else [])
    last_year = max(y for _, ys in splits for y in ys)

    out = []
    for code, name in LEAGUES.items():
        matches = load_league(code, last_year)
        tun = [m for m in matches if m["y"] in tuning]
        base = np.bincount([m["res"] for m in tun], minlength=3) / max(1, len(tun))
        for split, years in splits:
            in_split = [m for m in matches if m["y"] in years]
            preds = walk_forward(matches, years)
            rows = [(m, p) for m, p in preds if m["odds"]]
            if len(rows) < 50:
                print(f"{code} {split}: only {len(rows)} scoreable matches; skipped")
                continue
            met = score(rows, base)
            met.update({"league": name, "code": code, "seasons": sorted(set(years)), "matches_in_split": len(in_split),
                        "forecast": len(preds), "scored": len(rows), "baseline_hda": [round(float(b), 4) for b in base]})
            if split == "holdout":
                met["passes_baseline"] = met["baseline_minus_dc_t"] > T_LIMIT
                met["passes_gap"] = met["dc_minus_market"] <= GAP_LIMIT
            out.append({"experiment_id": EXPERIMENT, "split": split, "variant": code, "n_matches": len(rows),
                        "metrics": met, "code_ref": code_ref})
            print(split, code, json.dumps({k: round(v, 5) if isinstance(v, float) else v for k, v in met.items()}))

    # Holdout rows last, after tuning and validation are stored.
    for row in sorted(out, key=lambda r: r["split"] == "holdout"):
        sb.table("lab_scorings").insert(row).execute()
    sb.table("lab_experiments").update({"variants_tried": 1, "status": "holdout_opened" if args.open_holdout else "validated"}) \
        .eq("experiment_id", EXPERIMENT).execute()


if __name__ == "__main__":
    main()
