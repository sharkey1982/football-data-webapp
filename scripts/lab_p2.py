#!/usr/bin/env python3
# ============================================================================
# scripts/lab_p2.py
#
# Experiment P2 (registered in lab_experiments before this ran): given that a
# player starts, how does his match end -- off before 60 minutes (band 0),
# off at 60-84 (band 1), or 85+ (band 2)?
#
# Model: recency-weighted counts of the player's own previous starts in each
# band (half-life h starts), blended with his position's band shares as a
# Dirichlet prior of strength k. Walk-forward: each start is predicted from
# earlier starts only. Baselines: B1 position shares; B0 (appearance points
# only) the current projection rule, 2 points for every starter.
#
#   python scripts/lab_p2.py                  # tuning (16 variants) + validation
#   python scripts/lab_p2.py --holdout-only   # the one holdout look, with the
#                                             # variant chosen on tuning
# ============================================================================

import argparse
import math
import os
import subprocess

import numpy as np
from scipy.stats import norm

EXPERIMENT = "P2_minutes_exit_bands"
YEAR = {9: 2022, 10: 2023, 11: 2024, 12: 2025, 13: 2026}
KS = (2, 5, 10, 20)
HS = (10, 20, 40, None)
PRIOR_YEARS = (2022, 2023)


def band(minutes):
    return 0 if minutes < 60 else 1 if minutes < 85 else 2


def page(sb, table, cols, filters, order):
    out, start = [], 0
    while True:
        q = sb.table(table).select(cols)
        for kind, col, val in filters:
            q = getattr(q, kind)(col, val)
        for col in order:   # a unique ordering, or offset paging can skip or repeat rows
            q = q.order(col)
        rows = q.range(start, start + 999).execute().data or []
        out += rows
        if len(rows) < 1000:
            return out
        start += 1000


def load_starts(sb):
    """Every recorded start: {code, pos, year, gw, fx, band}, in match order."""
    pos = {}
    for r in page(sb, "fpl_player_season_totals", "season_id,fpl_code,element_type", [("gte", "season_id", 9)], ["season_id", "fpl_code"]):
        pos[(r["season_id"], r["fpl_code"])] = r["element_type"]
    starts = []
    for r in page(sb, "fpl_player_gameweek_history", "season_id,fpl_code,gameweek,fixture_id,minutes",
                  [("gte", "season_id", 9), ("eq", "starts", 1)], ["season_id", "fpl_code", "gameweek", "fixture_id"]):
        p = pos.get((r["season_id"], r["fpl_code"]))
        if p:
            starts.append({"code": r["fpl_code"], "pos": p, "year": YEAR[r["season_id"]], "gw": r["gameweek"],
                           "fx": r["fixture_id"] or 0, "band": band(r["minutes"])})
    players = {r["fpl_player_id"]: r for r in page(sb, "fpl_players", "fpl_player_id,fpl_code,element_type", [("eq", "season_id", 13)], ["fpl_player_id"])}
    for r in page(sb, "fpl_player_gameweeks", "fpl_player_id,fpl_event_id,fpl_fixture_id,minutes,source_payload",
                  [("eq", "season_id", 13)], ["fpl_player_id", "fpl_fixture_id"]):
        s = (r.get("source_payload") or {}).get("stats") or {}
        pl = players.get(r["fpl_player_id"])
        if s.get("starts") == 1 and pl and pl.get("fpl_code") and pl.get("element_type"):
            starts.append({"code": pl["fpl_code"], "pos": pl["element_type"], "year": 2026, "gw": r["fpl_event_id"],
                           "fx": r["fpl_fixture_id"] or 0, "band": band(r["minutes"])})
    starts.sort(key=lambda s: (s["year"], s["gw"], s["fx"]))
    return starts


def position_priors(starts):
    counts = {}
    for s in starts:
        if s["year"] in PRIOR_YEARS:
            c = counts.setdefault(s["pos"], [0, 0, 0])
            c[s["band"]] += 1
    return {p: np.array(c, float) / sum(c) for p, c in counts.items()}


def predict(starts, priors, k, h):
    """Walk-forward band probabilities for every start (list aligned with starts)."""
    history, preds = {}, []
    for s in starts:
        prior = priors[s["pos"]]
        prev = history.get(s["code"], [])
        n = len(prev)
        if n:
            ages = np.arange(n - 1, -1, -1, dtype=float)
            w = np.ones(n) if h is None else 0.5 ** (ages / h)
            counts = np.array([w[np.array(prev) == b].sum() for b in range(3)])
            p = (counts + k * prior) / (w.sum() + k)
        else:
            p = prior.copy()
        preds.append(p)
        history.setdefault(s["code"], []).append(s["band"])
    return preds


def clustered(diff, cl):
    n, mean = len(diff), float(diff.mean())
    groups = {}
    for v, c in zip(diff - mean, cl):
        groups[c] = groups.get(c, 0.0) + v
    g = len(groups)
    se = math.sqrt(sum(x * x for x in groups.values()) * g / (g - 1)) / n
    return mean, se, (mean / se if se > 0 else 0.0)


def score(starts, preds, priors, years):
    idx = [i for i, s in enumerate(starts) if s["year"] in years]
    y = np.array([starts[i]["band"] for i in idx])
    pm = np.clip(np.array([preds[i] for i in idx]), 1e-9, 1)
    pb = np.clip(np.array([priors[starts[i]["pos"]] for i in idx]), 1e-9, 1)
    cl = [f'{starts[i]["year"]}|{starts[i]["gw"]}' for i in idx]
    ll_m, ll_b = -np.log(pm[np.arange(len(y)), y]), -np.log(pb[np.arange(len(y)), y])
    gain, se, t = clustered(ll_b - ll_m, cl)
    actual_app = np.where(y == 0, 1.0, 2.0)
    app_m = 1 * pm[:, 0] + 2 * (1 - pm[:, 0])
    app_b1 = 1 * pb[:, 0] + 2 * (1 - pb[:, 0])
    se_m, se_b0, se_b1 = (app_m - actual_app) ** 2, (2 - actual_app) ** 2, (app_b1 - actual_app) ** 2
    app_gain, _, app_t = clustered(se_b0 - se_m, cl)
    by_pos = {}
    for p in sorted({starts[i]["pos"] for i in idx}):
        m = np.array([starts[i]["pos"] == p for i in idx])
        by_pos[str(p)] = {"starts": int(m.sum()), "logloss_model": float(ll_m[m].mean()), "logloss_position": float(ll_b[m].mean()),
                          "share_off_before_60": float((y[m] == 0).mean())}
    return {
        "starts": len(idx), "logloss_model": float(ll_m.mean()), "logloss_position": float(ll_b.mean()),
        "gain_v_position": gain, "se": se, "t": t, "p_one_sided": float(1 - norm.cdf(t)),
        "app_sq_err_model": float(se_m.mean()), "app_sq_err_current_rule": float(se_b0.mean()), "app_sq_err_position": float(se_b1.mean()),
        "app_gain_v_current_rule": app_gain, "app_t": app_t,
        "band_shares": [float((y == b).mean()) for b in range(3)], "by_position": by_pos,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--holdout-only", action="store_true")
    args = ap.parse_args()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    exp = sb.table("lab_experiments").select("*").eq("experiment_id", EXPERIMENT).single().execute().data
    code_ref = os.environ.get("GITHUB_SHA") or subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()

    starts = load_starts(sb)
    priors = position_priors(starts)
    print(f"{len(starts)} starts; position priors {({p: [round(x, 3) for x in v] for p, v in priors.items()})}")
    name = lambda k, h: f"k{k}_h{'inf' if h is None else h}"

    out = []
    if args.holdout_only:
        tuned = sb.table("lab_scorings").select("variant,metrics").eq("experiment_id", EXPERIMENT).eq("split", "tuning").execute().data
        if not tuned:
            raise SystemExit("No tuning results stored: run without --holdout-only first.")
        best_name = min(tuned, key=lambda r: r["metrics"]["logloss_model"])["variant"]
        best = next((k, h) for k in KS for h in HS if name(k, h) == best_name)
        splits = [("holdout", exp["holdout_seasons"])]
    else:
        tuning = {}
        for k in KS:
            for h in HS:
                m = score(starts, predict(starts, priors, k, h), priors, exp["tuning_seasons"])
                tuning[(k, h)] = m
                print(f"tuning {name(k, h)}: logloss {m['logloss_model']:.4f} v position {m['logloss_position']:.4f} (t {m['t']:.1f})")
                out.append({"experiment_id": EXPERIMENT, "split": "tuning", "variant": name(k, h), "n_matches": m["starts"], "metrics": m, "code_ref": code_ref})
        best = min(tuning, key=lambda kh: tuning[kh]["logloss_model"])
        splits = [("validation", exp["validation_seasons"])]
    print(f"variant carried forward: {name(*best)}")
    preds = predict(starts, priors, *best)
    for split, years in splits:
        m = score(starts, preds, priors, years)
        m["variant"] = name(*best)
        print(split, {k: (round(v, 4) if isinstance(v, float) else v) for k, v in m.items() if k != "by_position"})
        out.append({"experiment_id": EXPERIMENT, "split": split, "variant": name(*best), "n_matches": m["starts"], "metrics": m, "code_ref": code_ref})

    for row in out:
        sb.table("lab_scorings").insert(row).execute()
    sb.table("lab_experiments").update({"variants_tried": len(KS) * len(HS),
                                        "status": "holdout_opened" if args.holdout_only else "validated"}).eq("experiment_id", EXPERIMENT).execute()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        for line in traceback.format_exc().splitlines():
            print(f"::error::{line}")
        raise
