#!/usr/bin/env python3
# ============================================================================
# scripts/backtest_depth_recency.py
#
# Backtest (10 Oct 2026): should recent matches count for more in a
# player's start record?
#
# Found 10 Oct (Chris): Arsenal's J.Timber (ranked 1st at right-back) was
# projected 44% to start and Ben White (2nd) 53%. Timber played no minutes
# in GW1-3 while White started; FPL's data (from 13 Sep) shows Timber fit,
# so those three matches count as "fit and not picked" and wear his
# first-choice floor down to 0.44. But Timber came on at half-time for
# White in GW4 and started GW5 with White unused -- the most recent
# selections point the other way. "The history of a player starting while
# someone is injured may be influencing the projections too much."
#
# Rule fixed BEFORE scoring: each earlier team match counts with weight
# 0.5 ^ (matches since / 3) -- a half-life of three matches -- in both
# the start rate (starts + last season's rate) / (available + 1) and the
# first-choice floor (starts + 0.85 x 3) / (available + 3). Applied to the
# depth chart's inputs only. Everything else as now (K = 3, tied ranks by
# start rate).
# Adopt iff the half-life of 3 beats the current (unweighted) record on
# BOTH Brier score and log loss over every outfield depth-chart
# player-match, GW3 to the last finished gameweek. Half-lives 1, 2, 5 and
# 10 reported for information only.
#
# Same point-in-time inputs and caveat as backtest_depth_floor.py (the
# pecking order is today's).
#
# Writes analysis_results 'depth_recency_backtest'.
#   python scripts/backtest_depth_recency.py
# ============================================================================

from __future__ import annotations

import json
import math
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
import fpl_depth_chart as dc  # noqa: E402
from backtest_depth_floor import SQL, score  # noqa: E402

# The per-match history the main query counts from (its "games" CTE).
GAMES_SQL = SQL[: SQL.index("), prev as (")] + ")\nselect fpl_player_id, kickoff_time, st, avail from games"

VARIANTS: list[tuple[str, float | None]] = [("current (no decay)", None), ("half-life 3 (registered)", 3.0),
                                           ("half-life 1", 1.0), ("half-life 2", 2.0), ("half-life 5", 5.0), ("half-life 10", 10.0)]


def weighted_counts(history: list[tuple], kickoff, half_life: float | None) -> tuple[float, float]:
    """(starts, available) from matches before `kickoff`, newest weighted 1."""
    before = sorted((h for h in history if h[0] < kickoff), key=lambda h: h[0], reverse=True)
    starts = avail = 0.0
    for age, (_, st, av) in enumerate(before):
        w = 1.0 if half_life is None else 0.5 ** (age / half_life)
        starts += w * (1 if st > 0 else 0)
        avail += w * (1 if av else 0)
    return starts, avail


def run(rows: list[dict], history: dict[int, list[tuple]], half_life: float | None) -> dict[tuple, float]:
    dc.RANK1_SEED_MATCHES = 3.0
    by_side: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        by_side[(r["fixture_id"], r["team_id"])].append(r)
    out: dict[tuple, float] = {}
    for (fid, tid), grp in by_side.items():
        players = []
        for r in grp:
            pid = int(r["fpl_player_id"])
            starts, avail = weighted_counts(history.get(pid, []), r["kickoff_time"], half_life)
            prior = float(r["prior_rate"]) if r["prior_rate"] is not None else 0.20
            rate = min(0.97, (starts + prior) / (avail + 1.0))
            players.append(dc.Player(
                fpl_player_id=pid, role=r["tactical_role"], depth_rank=int(r["depth_rank"] or 3),
                availability=float(r["availability"]), rate=rate,
                first_choice=None if r["start_if_fit"] is None else float(r["start_if_fit"]),
                element_type=int(r["element_type"]), starts=starts, available=avail))
        for pid, (s, _g, _rank) in dc.allocate(players, grp[0]["formation"] or None).items():
            out[(fid, tid, pid)] = s
    return out


def main() -> None:
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as con, con.cursor(row_factory=dict_row) as cur:
        cur.execute("select public.fpl_current_season_id() s")
        season = cur.fetchone()["s"]
        cur.execute("select max(fpl_event_id) g from fpl_fixtures where season_id = %s and finished", (season,))
        last_gw = int(cur.fetchone()["g"])
        params = {"s": season, "g0": 3, "g1": last_gw}
        # The main query needs each row's kick-off for the weighting.
        cur.execute(SQL.replace("select s.gw, s.fixture_id,", "select s.gw, s.kickoff_time, s.fixture_id,", 1), params)
        rows = cur.fetchall()
        cur.execute(GAMES_SQL, params)
        games = cur.fetchall()
    history: dict[int, list[tuple]] = defaultdict(list)
    for g in games:
        history[int(g["fpl_player_id"])].append((g["kickoff_time"], int(g["st"] or 0), bool(g["avail"])))
    print(f"GW3-{last_gw}: {len(rows)} player-matches, {sum(r['started'] > 0 for r in rows)} starts")

    key = lambda r: (r["fixture_id"], r["team_id"], int(r["fpl_player_id"]))
    actual = {key(r): int(r["started"] > 0) for r in rows}
    rank1 = {key(r) for r in rows if (r["depth_rank"] or 3) <= 1}

    # Sanity check: the unweighted path must reproduce the production inputs.
    for r in rows[:50]:
        s, a = weighted_counts(history.get(int(r["fpl_player_id"]), []), r["kickoff_time"], None)
        assert (s, a) == (float(r["starts_before"]), float(r["avail_before"])), (r["fpl_player_id"], s, a, r["starts_before"], r["avail_before"])

    results, preds = [], {}
    for label, h in VARIANTS:
        pred = run(rows, history, h)
        preds[label] = pred
        res = {"variant": label, "half_life": h,
               "all": score([(pred.get(k, 0.0), y) for k, y in actual.items()]),
               "first_choice": score([(pred.get(k, 0.0), actual[k]) for k in rank1]),
               "by_gw": {gw: score([(pred.get(key(r), 0.0), actual[key(r)]) for r in rows if r["gw"] == gw]) for gw in range(3, last_gw + 1)}}
        results.append(res)
        print(label, json.dumps(res["all"]), "first choice", json.dumps(res["first_choice"]))

    base, reg = results[0]["all"], results[1]["all"]
    adopt = reg["brier"] < base["brier"] and reg["log_loss"] < base["log_loss"]
    a, b = preds[VARIANTS[0][0]], preds[VARIANTS[1][0]]
    diffs = [((b.get(k, 0) - y) ** 2 - (a.get(k, 0) - y) ** 2) for k, y in actual.items()]
    n = len(diffs)
    mean = sum(diffs) / n
    sd = math.sqrt(sum((d - mean) ** 2 for d in diffs) / (n - 1))
    summary = {"gws": [3, last_gw], "player_matches": n,
               "rule": "earlier matches weighted 0.5^(matches since / 3) in the depth chart's start rate and first-choice floor",
               "decision_rule": "adopt iff half-life 3 beats no decay on both Brier and log loss over all outfield depth-chart player-matches, GW3 to last finished",
               "results": results, "paired_brier_diff": {"mean": round(mean, 6), "se": round(sd / math.sqrt(n), 6)}, "adopt": adopt}
    print("ADOPT" if adopt else "DO NOT ADOPT", json.dumps(summary["paired_brier_diff"]))

    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    sb.table("analysis_results").insert({"analysis_id": "depth_recency_backtest", "code_ref": os.environ.get("GITHUB_SHA", "local"),
                                         "result": summary}).execute()
    print("Saved analysis_results depth_recency_backtest")


if __name__ == "__main__":
    main()
