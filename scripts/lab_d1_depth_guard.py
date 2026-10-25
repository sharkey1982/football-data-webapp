#!/usr/bin/env python3
# ============================================================================
# scripts/lab_d1_depth_guard.py
#
# Model Lab experiment D1_depth_guard (registered in lab_experiments before
# this ran; supabase/migrations/20261025250000_lab_d1_register.sql).
#
# Chris, 25 Oct 2026: "we need a better way to avoid very low down picks
# getting put into the model outputs as it ruins credibility". Man Utd GW8:
# Zirkzee (fallback CF, no starts all season) published 90% to start because
# a fallback CF rank 1 (Sesko, out) made a second striker's place.
#
# Rules (fpl_depth_chart.py, D1 block):
#   1 FALLBACK_NO_PLACES: fallback-only roles don't create places.
#   2 BACKUP_SEED_MATCHES = K: a backup's take rate (starts + 0.9 K) /
#     (available + K), capped at 0.9, instead of a flat 0.9.
#   3 PLAUSIBILITY_CAP = 0.40: a start chance >= 0.60 for a player who
#     started <= 1 of his last 5 team matches while available (available
#     for >= 2 of them), and is not a hand-set first choice, is cut to 0.40.
#
# Splits (gameweeks of 2026/27; all inside the sealed 2026/27 holdout
# season, so each split is scored once and the holdout once only):
#   tuning GW3-5 (K chosen from 1, 2, 3, 5, 10 by Brier of the combined
#   rule), validation GW6 (reported), holdout GW7-8 (scored once, after GW8
#   has finished; the script refuses before then).
# Pecking order: the frozen copy 'depth_deep_backup_gw7' (taken 11 Oct,
#   before the GW7 deadline), so the holdout can't see later line-ups.
#   Tuning and validation use the same copy (taken after them: a small leak
#   in the old rule's favour as much as the new one's, as in earlier depth
#   backtests). Role/rank sources come from today's table (they are not
#   versioned); only a handful of ranks were set by hand since 11 Oct.
# Other inputs point in time, production settings (start record half-life
#   3, first-choice K 3, ties by rate), allocate() as in production.
# Decision: adopt iff the combined rule (1+2+3, tuned K) beats the current
#   model on BOTH Brier and log loss over every outfield depth-chart
#   player-match in the holdout. Each rule alone, starters right (top 10
#   outfield per club) and the "same XI as his last league game" baseline
#   are reported for information.
#
#   python scripts/lab_d1_depth_guard.py [--open-holdout]
# Writes lab_scorings (experiment D1_depth_guard) and analysis_results
# 'lab_d1_depth_guard'.
# ============================================================================

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
import fpl_depth_chart as dc  # noqa: E402
from backtest_depth_floor import SQL as BASE_SQL, score  # noqa: E402
from backtest_depth_recency import GAMES_SQL, weighted_counts  # noqa: E402

EXPERIMENT = "D1_depth_guard"
SNAPSHOT = "depth_deep_backup_gw7"
SPLITS = {"tuning": (3, 5), "validation": (6, 6), "holdout": (7, 8)}
K_GRID = [1.0, 2.0, 3.0, 5.0, 10.0]
HALF_LIFE = 3.0
CAP = 0.40

LIVE_JOIN = "join team_player_tactical_defaults d on d.season_id = %(s)s and d.team_id = s.team_id"
FROZEN_JOIN = ("join fpl_pecking_order_snapshots d on d.label = %(label)s and d.season_id = %(s)s and d.team_id = s.team_id\n"
               "  left join team_player_tactical_defaults ds on ds.season_id = %(s)s and ds.team_id = s.team_id and ds.fpl_player_id = d.fpl_player_id")
assert LIVE_JOIN in BASE_SQL and "       g.st started\n" in BASE_SQL
SQL = (BASE_SQL.replace(LIVE_JOIN, FROZEN_JOIN)
       .replace("select s.gw, s.fixture_id,", "select s.gw, s.kickoff_time, s.fixture_id,", 1)
       .replace("       g.st started\n", "       g.st started, ds.source_name role_source, ds.depth_rank_source rank_source\n", 1))


def last_n(history: list[tuple], kickoff, n: int) -> tuple[float, float]:
    """Starts while available, and matches available, over his last n team matches before kickoff."""
    before = sorted((h for h in history if h[0] < kickoff), key=lambda h: h[0], reverse=True)[:n]
    return float(sum(1 for _, st, av in before if av and st > 0)), float(sum(1 for _, _st, av in before if av))


def run(rows: list[dict], history: dict, fallback: bool, k: float | None, cap: float | None) -> tuple[dict, int]:
    saved = (dc.FALLBACK_NO_PLACES, dc.BACKUP_SEED_MATCHES, dc.PLAUSIBILITY_CAP, dc.RANK1_SEED_MATCHES, dc.TIE_WEIGHT_BY_RATE)
    dc.FALLBACK_NO_PLACES, dc.BACKUP_SEED_MATCHES, dc.PLAUSIBILITY_CAP = fallback, k, cap
    dc.RANK1_SEED_MATCHES, dc.TIE_WEIGHT_BY_RATE = 3.0, True
    by_side: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        by_side[(r["fixture_id"], r["team_id"])].append(r)
    out: dict[tuple, float] = {}
    capped = 0
    try:
        for (fid, tid), grp in by_side.items():
            players = []
            for r in grp:
                pid = int(r["fpl_player_id"])
                hist = history.get(pid, [])
                starts, avail = weighted_counts(hist, r["kickoff_time"], HALF_LIFE)
                prior = float(r["prior_rate"]) if r["prior_rate"] is not None else 0.20
                rate = min(0.97, (starts + prior) / (avail + 1.0))
                s5, a5 = last_n(hist, r["kickoff_time"], dc.PLAUS_WINDOW)
                players.append(dc.Player(
                    fpl_player_id=pid, role=r["tactical_role"], depth_rank=int(r["depth_rank"] or 3),
                    availability=float(r["availability"]), rate=rate,
                    first_choice=None if r["start_if_fit"] is None else float(r["start_if_fit"]),
                    element_type=int(r["element_type"]), starts=starts, available=avail,
                    role_source=r["role_source"], rank_source=r["rank_source"], starts_last=s5, avail_last=a5))
            res = dc.allocate(players, grp[0]["formation"] or None)
            res, flags = dc.apply_plausibility(players, res)
            capped += sum(1 for f in flags if f["capped"])
            for pid, val in res.items():
                out[(fid, tid, pid)] = val[0]
    finally:
        dc.FALLBACK_NO_PLACES, dc.BACKUP_SEED_MATCHES, dc.PLAUSIBILITY_CAP, dc.RANK1_SEED_MATCHES, dc.TIE_WEIGHT_BY_RATE = saved
    return out, capped


def starters_right(rows: list[dict], pred: dict) -> dict:
    """Top 10 outfield (depth-chart players) per club v the actual starters among them."""
    by_side: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        by_side[(r["fixture_id"], r["team_id"])].append(r)
    right = total = 0
    for (fid, tid), grp in by_side.items():
        actual = {int(r["fpl_player_id"]) for r in grp if (r["started"] or 0) > 0}
        top = sorted(grp, key=lambda r: -pred.get((fid, tid, int(r["fpl_player_id"])), 0.0))[:10]
        right += sum(1 for r in top if int(r["fpl_player_id"]) in actual)
        total += len(actual)
    return {"right": right, "actual_starters": total, "rate": round(right / total, 4) if total else None}


def last_xi(rows: list[dict], history: dict) -> dict:
    """Naive baseline: he starts iff he started his club's previous league match."""
    pred = {}
    for r in rows:
        before = sorted((h for h in history.get(int(r["fpl_player_id"]), []) if h[0] < r["kickoff_time"]), key=lambda h: h[0])
        pred[(r["fixture_id"], r["team_id"], int(r["fpl_player_id"]))] = 1.0 if before and before[-1][1] > 0 else 0.0
    return pred


def evaluate(rows: list[dict], pred: dict) -> dict:
    key = lambda r: (r["fixture_id"], r["team_id"], int(r["fpl_player_id"]))
    m = score([(pred.get(key(r), 0.0), int((r["started"] or 0) > 0)) for r in rows])
    m["starters"] = starters_right(rows, pred)
    m["by_gw"] = {int(gw): score([(pred.get(key(r), 0.0), int((r["started"] or 0) > 0)) for r in rows if r["gw"] == gw])
                  | {"starters": starters_right([r for r in rows if r["gw"] == gw], pred)}
                  for gw in sorted({r["gw"] for r in rows})}
    return m


def paired(rows: list[dict], a: dict, b: dict) -> dict:
    key = lambda r: (r["fixture_id"], r["team_id"], int(r["fpl_player_id"]))
    d = [((b.get(key(r), 0) - y) ** 2 - (a.get(key(r), 0) - y) ** 2) for r in rows for y in [int((r["started"] or 0) > 0)]]
    n = len(d)
    mean = sum(d) / n
    sd = math.sqrt(sum((x - mean) ** 2 for x in d) / (n - 1)) if n > 1 else 0.0
    return {"mean": round(mean, 6), "se": round(sd / math.sqrt(n), 6) if n else None}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--open-holdout", action="store_true")
    args = ap.parse_args()
    import psycopg
    from psycopg.rows import dict_row

    splits = ["tuning", "validation"] + (["holdout"] if args.open_holdout else [])
    with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as con, con.cursor(row_factory=dict_row) as cur:
        cur.execute("select public.fpl_current_season_id() s")
        season = cur.fetchone()["s"]
        g1 = max(SPLITS[s][1] for s in splits)
        cur.execute("select count(*) filter (where not finished) open, count(*) n from fpl_fixtures where season_id = %s and fpl_event_id between 3 and %s",
                    (season, g1))
        c = cur.fetchone()
        if c["open"] > 0:
            sys.exit(f"GW3-{g1} not all finished ({c['open']} of {c['n']} fixtures open); run again once they are.")
        cur.execute("select count(*) n from fpl_pecking_order_snapshots where label = %s", (SNAPSHOT,))
        if cur.fetchone()["n"] == 0:
            sys.exit(f"Pecking-order snapshot {SNAPSHOT} missing")
        params = {"s": season, "g0": 3, "g1": g1, "label": SNAPSHOT}
        cur.execute(SQL, params)
        rows = cur.fetchall()
        cur.execute(GAMES_SQL, params)
        games = cur.fetchall()
    history: dict[int, list[tuple]] = defaultdict(list)
    for g in games:
        history[int(g["fpl_player_id"])].append((g["kickoff_time"], int(g["st"] or 0), bool(g["avail"])))
    in_split = {s: [r for r in rows if SPLITS[s][0] <= r["gw"] <= SPLITS[s][1]] for s in splits}
    print({s: len(v) for s, v in in_split.items()}, "player-matches")

    # K from tuning only (combined rule, Brier).
    tune = in_split["tuning"]
    k_scores = {}
    for k in K_GRID:
        p, _ = run(tune, history, True, k, CAP)
        k_scores[k] = evaluate(tune, p)["brier"]
    k_best = min(K_GRID, key=lambda k: (k_scores[k], k))
    print("K on tuning (Brier):", k_scores, "->", k_best)

    variants = [("current", False, None, None), ("D1 combined (registered)", True, k_best, CAP),
                ("rule 1 only: fallback no places", True, None, None), (f"rule 2 only: backup K={k_best}", False, k_best, None),
                ("rule 3 only: cap 0.40", False, None, CAP)]
    code_ref = os.environ.get("GITHUB_SHA", "local")
    scorings, summary = [], {"k_grid_tuning_brier": k_scores, "k": k_best, "splits": {}}
    for split in splits:
        rs = in_split[split]
        preds, res = {}, {}
        for label, fb, k, cap in variants:
            preds[label], n_capped = run(rs, history, fb, k, cap)
            res[label] = evaluate(rs, preds[label]) | {"capped": n_capped}
        res["baseline: same XI as last league match"] = evaluate(rs, last_xi(rs, history))
        cur_m, new_m = res["current"], res["D1 combined (registered)"]
        verdict = {"paired_brier_combined_minus_current": paired(rs, preds["current"], preds["D1 combined (registered)"]),
                   "beats_current_on_both": new_m["brier"] < cur_m["brier"] and new_m["log_loss"] < cur_m["log_loss"]}
        summary["splits"][split] = {"gws": SPLITS[split], "player_matches": len(rs), "results": res, **verdict}
        print(split, json.dumps({lbl: {"brier": m["brier"], "log_loss": m["log_loss"], "starters": m["starters"]} for lbl, m in res.items()}))
        print(split, json.dumps(verdict))
        for label, m in res.items():
            scorings.append({"experiment_id": EXPERIMENT, "split": split, "variant": label, "n_matches": len(rs),
                             "metrics": m | ({"k": k_best} if "combined" in label else {}) | (verdict if "combined" in label else {}),
                             "code_ref": code_ref})
    if args.open_holdout:
        summary["adopt"] = summary["splits"]["holdout"]["beats_current_on_both"]
        print("ADOPT" if summary["adopt"] else "DO NOT ADOPT")

    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    for row in sorted(scorings, key=lambda r: r["split"] == "holdout"):
        sb.table("lab_scorings").insert(row).execute()
    sb.table("lab_experiments").update({"variants_tried": len(K_GRID), "status": "holdout_opened" if args.open_holdout else "validated"}) \
        .eq("experiment_id", EXPERIMENT).execute()
    sb.table("analysis_results").insert({"analysis_id": "lab_d1_depth_guard", "code_ref": code_ref, "result": summary}).execute()
    print("Saved lab_scorings and analysis_results lab_d1_depth_guard")


if __name__ == "__main__":
    main()
