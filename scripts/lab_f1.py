#!/usr/bin/env python3
# ============================================================================
# scripts/lab_f1.py
#
# Experiment F1 (registered in lab_experiments before this ran): does the
# Dixon-Coles model add information to the betting market?
#
# Log-linear pool per match: p_k proportional to q_k^a * d_k^b (k = H, D, A),
# q = market (Avg line, basic de-vig -- the F0 benchmark), d = walk-forward
# Dixon-Coles forecast made before kick-off. a and b are fitted by maximum
# likelihood on the TUNING seasons only, then held fixed.
#
# Scored as paired per-match log-loss differences (market minus pool, so
# positive = pool better), with standard errors clustered by matchday
# (league x date). Two variants: against the closing line and the opening
# line. Pass rule (registered): b > 0 with t > 2 on the holdout and the gain
# the same sign on validation; Holm-adjusted for the 2 variants.
#
# The sealed holdout is scored only with --open-holdout, and the database
# refuses a second holdout scoring for the experiment (lab_guard_holdout).
#
#   python scripts/lab_f1.py                 # tuning + validation
#   python scripts/lab_f1.py --open-holdout  # adds the one holdout look
# ============================================================================

import argparse
import json
import os
import subprocess

import numpy as np
from scipy.optimize import minimize
from scipy.stats import norm

EXPERIMENT = "F1_market_dc_pool"
RES = {"H": 0, "D": 1, "A": 2}


def load(sb):
    rows, start = [], 0
    while True:
        page = (sb.table("lab_f1_dataset").select("*").order("match_id").range(start, start + 999).execute().data or [])
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


def arrays(rows, line):
    q = np.array([[r[f"{line}_home"], r[f"{line}_draw"], r[f"{line}_away"]] for r in rows], float)
    d = np.array([[r["dc_home"], r["dc_draw"], r["dc_away"]] for r in rows], float)
    y = np.array([RES[r["result"]] for r in rows])
    cl = np.array([f'{r["league_id"]}|{r["match_date"][:10]}' for r in rows])
    return np.clip(q, 1e-9, 1), np.clip(d, 1e-9, 1), y, cl


def pool(q, d, a, b):
    lp = a * np.log(q) + b * np.log(d)
    lp -= lp.max(axis=1, keepdims=True)
    p = np.exp(lp)
    return p / p.sum(axis=1, keepdims=True)


def logloss(p, y):
    return -np.log(p[np.arange(len(y)), y])


def rps(p, y):
    o = np.zeros_like(p)
    o[np.arange(len(y)), y] = 1
    cp, co = np.cumsum(p, 1)[:, :2], np.cumsum(o, 1)[:, :2]
    return ((cp - co) ** 2).sum(1) / 2


def clustered(diff, cl):
    """Mean of per-match differences with a matchday-clustered standard error."""
    n = len(diff)
    mean = diff.mean()
    groups = {}
    for v, c in zip(diff - mean, cl):
        groups[c] = groups.get(c, 0.0) + v
    g = len(groups)
    se = np.sqrt(sum(s * s for s in groups.values()) * g / (g - 1)) / n
    return float(mean), float(se), float(mean / se) if se > 0 else 0.0, g


def fit(q, d, y):
    f = lambda w: logloss(pool(q, d, w[0], w[1]), y).mean()
    r = minimize(f, x0=[1.0, 0.0], method="Nelder-Mead", options={"xatol": 1e-6, "fatol": 1e-9, "maxiter": 2000})
    return float(r.x[0]), float(r.x[1])


def score(q, d, y, cl, a, b):
    pm, pp = q / q.sum(1, keepdims=True), pool(q, d, a, b)
    llm, llp, lld = logloss(pm, y), logloss(pp, y), logloss(d / d.sum(1, keepdims=True), y)
    gain, se, t, g = clustered(llm - llp, cl)
    dc_gap, dc_se, dc_t, _ = clustered(lld - llm, cl)
    return {
        "a": a, "b": b,
        "logloss_market": float(llm.mean()), "logloss_pool": float(llp.mean()), "logloss_dc": float(lld.mean()),
        "rps_market": float(rps(pm, y).mean()), "rps_pool": float(rps(pp, y).mean()),
        "gain_pool_vs_market": gain, "gain_se": se, "gain_t": t, "p_one_sided": float(1 - norm.cdf(t)),
        "dc_minus_market": dc_gap, "dc_minus_market_t": dc_t, "matchdays": g,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--open-holdout", action="store_true")
    args = ap.parse_args()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    exp = sb.table("lab_experiments").select("*").eq("experiment_id", EXPERIMENT).single().execute().data
    sealed = set(exp["holdout_seasons"])
    rows = load(sb)
    code_ref = os.environ.get("GITHUB_SHA") or subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    split_of = lambda yr: "tuning" if yr in exp["tuning_seasons"] else "validation" if yr in exp["validation_seasons"] else "holdout" if yr in sealed else None
    by_split = {}
    for r in rows:
        s = split_of(r["start_year"])
        if s:
            by_split.setdefault(s, []).append(r)
    print({k: len(v) for k, v in by_split.items()})

    out = []
    for line in ("close", "open"):
        variant = f"vs_{line}"
        q, d, y, cl = arrays(by_split["tuning"], line)
        a, b = fit(q, d, y)  # fitted on tuning only; never refitted
        for split in ("tuning", "validation") + (("holdout",) if args.open_holdout else ()):
            if split not in by_split:
                continue
            m = score(*arrays(by_split[split], line), a, b)
            m["seasons"] = sorted({r["start_year"] for r in by_split[split]})
            out.append({"experiment_id": EXPERIMENT, "split": split, "variant": variant, "n_matches": len(by_split[split]),
                        "metrics": m, "code_ref": code_ref})
            print(split, variant, json.dumps({k: round(v, 5) if isinstance(v, float) else v for k, v in m.items()}))

    # Holdout rows last, after tuning and validation are stored.
    for row in sorted(out, key=lambda r: r["split"] == "holdout"):
        sb.table("lab_scorings").insert(row).execute()
    sb.table("lab_experiments").update({"variants_tried": 2, "status": "holdout_opened" if args.open_holdout else "validated"}).eq("experiment_id", EXPERIMENT).execute()


if __name__ == "__main__":
    main()
