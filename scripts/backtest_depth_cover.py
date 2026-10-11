#!/usr/bin/env python3
# ============================================================================
# scripts/backtest_depth_cover.py
#
# Backtest (11 Oct 2026): who takes a place when nobody named for it is fit?
#
# Found 11 Oct (Chris): Liverpool's Danns, an academy striker fit for six
# matches with no minutes, was 90% to start against Man City because Isak
# and Ekitike were out and he was the only fit player listed at striker.
# "It is more likely that established attacking midfielders will be used."
# (Koumas, a midfielder, led the line.)
#
# Rules fixed BEFORE scoring (fpl_depth_chart flags, both off in production):
#   A  DEEP_BACKUP_BY_RATE: a backup ranked 3rd or lower takes an open
#      place with his own start rate (capped at 0.9) instead of 0.9 -- as
#      players listed only as DEF/MID/FWD already do. Rank-2 backups and
#      admin "first choice when fit" settings unchanged.
#   B  NEIGHBOUR_COVER: the places a line still expects to be open after its
#      own players are shared in full among fit players from the
#      neighbouring positions (AM/LW/RW for the striker; holding midfield
#      for the back line), in proportion to availability x start rate,
#      nobody above his availability.
# Registered: A and B together.
# Adopt iff A+B beats the current rules on BOTH Brier score and log loss
# over every outfield depth-chart player-match, GW3 to the last finished
# gameweek. A alone and B alone are reported for information only (they
# do not decide anything).
#
# Inputs as production: start record weighted 0.5^(matches since / 3)
# (backtest_depth_recency.py), K = 3, tied ranks by start rate. Same
# point-in-time caveat as backtest_depth_floor.py: the pecking order is
# today's (not versioned), including the 10-11 Oct screenshot corrections,
# for every variant alike.
#
# Writes analysis_results 'depth_cover_backtest'.
#   python scripts/backtest_depth_cover.py
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
from backtest_depth_recency import GAMES_SQL, weighted_counts  # noqa: E402

VARIANTS: list[tuple[str, bool, bool]] = [("current", False, False), ("A+B (registered)", True, True),
                                          ("A only", True, False), ("B only", False, True)]
HALF_LIFE = 3.0


def run(rows: list[dict], history: dict[int, list[tuple]], deep: bool, cover: bool) -> dict[tuple, float]:
    dc.RANK1_SEED_MATCHES = 3.0
    dc.TIE_WEIGHT_BY_RATE = True
    dc.DEEP_BACKUP_BY_RATE, dc.NEIGHBOUR_COVER = deep, cover
    by_side: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        by_side[(r["fixture_id"], r["team_id"])].append(r)
    out: dict[tuple, float] = {}
    try:
        for (fid, tid), grp in by_side.items():
            players = []
            for r in grp:
                pid = int(r["fpl_player_id"])
                starts, avail = weighted_counts(history.get(pid, []), r["kickoff_time"], HALF_LIFE)
                prior = float(r["prior_rate"]) if r["prior_rate"] is not None else 0.20
                rate = min(0.97, (starts + prior) / (avail + 1.0))
                players.append(dc.Player(
                    fpl_player_id=pid, role=r["tactical_role"], depth_rank=int(r["depth_rank"] or 3),
                    availability=float(r["availability"]), rate=rate,
                    first_choice=None if r["start_if_fit"] is None else float(r["start_if_fit"]),
                    element_type=int(r["element_type"]), starts=starts, available=avail))
            for pid, (s, _g, _rank) in dc.allocate(players, grp[0]["formation"] or None).items():
                out[(fid, tid, pid)] = s
    finally:
        dc.DEEP_BACKUP_BY_RATE, dc.NEIGHBOUR_COVER = False, False
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
    role = {key(r): (r["tactical_role"] or "").upper() for r in rows}
    deep = {k for k, r in ((key(r), r) for r in rows) if (r["depth_rank"] or 3) >= 3 and role[k] in dc.ROLE_GROUP}
    neighbours = {k for k in actual if dc.ROLE_GROUP.get(role[k]) in ("AM", "LW", "RW", "PIV")}

    results, preds = [], {}
    for label, a, b in VARIANTS:
        pred = run(rows, history, a, b)
        preds[label] = pred
        res = {"variant": label,
               "all": score([(pred.get(k, 0.0), y) for k, y in actual.items()]),
               "deep_backups": score([(pred.get(k, 0.0), actual[k]) for k in deep]) if deep else None,
               "neighbour_positions": score([(pred.get(k, 0.0), actual[k]) for k in neighbours]) if neighbours else None,
               "by_gw": {gw: score([(pred.get(key(r), 0.0), actual[key(r)]) for r in rows if r["gw"] == gw]) for gw in range(3, last_gw + 1)}}
        results.append(res)
        print(label, json.dumps(res["all"]), "deep", json.dumps(res["deep_backups"]))

    base, reg = results[0]["all"], results[1]["all"]
    adopt = reg["brier"] < base["brier"] and reg["log_loss"] < base["log_loss"]
    a, b = preds["current"], preds["A+B (registered)"]
    diffs = [((b.get(k, 0) - y) ** 2 - (a.get(k, 0) - y) ** 2) for k, y in actual.items()]
    n = len(diffs)
    mean = sum(diffs) / n
    sd = math.sqrt(sum((d - mean) ** 2 for d in diffs) / (n - 1))
    movers = sorted(((b.get(k, 0) - a.get(k, 0), k) for k in actual), key=lambda t: abs(t[0]), reverse=True)[:20]
    summary = {"gws": [3, last_gw], "player_matches": n,
               "rule": "A: rank-3+ backups take an open place at their start rate; B: a line's leftover open places shared among neighbouring positions (AM/LW/RW -> CF; PIV -> back line) by availability x rate",
               "decision_rule": "adopt iff A+B beats current on both Brier and log loss over all outfield depth-chart player-matches, GW3 to last finished; A only / B only for information",
               "results": results, "paired_brier_diff": {"mean": round(mean, 6), "se": round(sd / math.sqrt(n), 6)}, "adopt": adopt,
               "biggest_moves": [{"fixture_id": k[0], "team_id": k[1], "fpl_player_id": k[2], "change": round(d, 3),
                                  "current": round(a.get(k, 0), 3), "new": round(b.get(k, 0), 3), "started": actual[k]} for d, k in movers]}
    print("ADOPT" if adopt else "DO NOT ADOPT", json.dumps(summary["paired_brier_diff"]))

    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    sb.table("analysis_results").insert({"analysis_id": "depth_cover_backtest", "code_ref": os.environ.get("GITHUB_SHA", "local"),
                                         "result": summary}).execute()
    print("Saved analysis_results depth_cover_backtest")


if __name__ == "__main__":
    main()
