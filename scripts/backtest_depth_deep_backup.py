#!/usr/bin/env python3
# ============================================================================
# scripts/backtest_depth_deep_backup.py
#
# Registered backtest (11 Oct 2026): rule A alone -- a backup ranked 3rd or
# lower takes an open place at his own start rate (capped at 0.9) instead
# of 0.9 (fpl_depth_chart.DEEP_BACKUP_BY_RATE).
#
# Background: backtest_depth_cover.py registered A and B together; the pair
# failed (log loss worse). A alone was better on both measures there, but
# it was not the registered rule and that data has now been seen, so A is
# registered on its own here and scored only on gameweeks not yet played.
#
# Rule fixed BEFORE scoring:
#   Data: GW7 and GW8 of 2026/27, every outfield depth-chart player-match.
#   Pecking order: the frozen copy 'depth_deep_backup_gw7'
#   (fpl_pecking_order_snapshots, taken 11 Oct before the GW7 deadline),
#   so later line-ups can't leak in. Other inputs point in time, production
#   settings (start record half-life 3, K 3, ties by rate).
#   Adopt iff A beats the current rule on BOTH Brier score and log loss.
#   Run once, after every GW7 and GW8 fixture has finished; the script
#   refuses to run before then.
#
# Writes analysis_results 'depth_deep_backup_backtest'.
#   python scripts/backtest_depth_deep_backup.py
# ============================================================================

from __future__ import annotations

import json
import math
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from backtest_depth_floor import SQL as BASE_SQL, score  # noqa: E402
from backtest_depth_recency import GAMES_SQL  # noqa: E402
from backtest_depth_cover import run  # noqa: E402

GW_FROM, GW_TO = 7, 8
SNAPSHOT = "depth_deep_backup_gw7"
LIVE_JOIN = "join team_player_tactical_defaults d on d.season_id = %(s)s and d.team_id = s.team_id"
FROZEN_JOIN = "join fpl_pecking_order_snapshots d on d.label = %(label)s and d.season_id = %(s)s and d.team_id = s.team_id"
assert LIVE_JOIN in BASE_SQL
SQL = BASE_SQL.replace(LIVE_JOIN, FROZEN_JOIN).replace("select s.gw, s.fixture_id,", "select s.gw, s.kickoff_time, s.fixture_id,", 1)


def main() -> None:
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as con, con.cursor(row_factory=dict_row) as cur:
        cur.execute("select public.fpl_current_season_id() s")
        season = cur.fetchone()["s"]
        cur.execute("select count(*) filter (where not finished) open, count(*) n from fpl_fixtures where season_id = %s and fpl_event_id between %s and %s",
                    (season, GW_FROM, GW_TO))
        c = cur.fetchone()
        if c["n"] == 0 or c["open"] > 0:
            sys.exit(f"GW{GW_FROM}-{GW_TO} not finished ({c['open']} of {c['n']} fixtures open); the registered test runs once, afterwards.")
        cur.execute("select count(*) n from fpl_pecking_order_snapshots where label = %s", (SNAPSHOT,))
        if cur.fetchone()["n"] == 0:
            sys.exit(f"Pecking-order snapshot {SNAPSHOT} missing")
        params = {"s": season, "g0": GW_FROM, "g1": GW_TO, "label": SNAPSHOT}
        cur.execute(SQL, params)
        rows = cur.fetchall()
        cur.execute(GAMES_SQL, params)
        games = cur.fetchall()
    history: dict[int, list[tuple]] = defaultdict(list)
    for g in games:
        history[int(g["fpl_player_id"])].append((g["kickoff_time"], int(g["st"] or 0), bool(g["avail"])))
    print(f"GW{GW_FROM}-{GW_TO}: {len(rows)} player-matches, {sum(r['started'] > 0 for r in rows)} starts")

    key = lambda r: (r["fixture_id"], r["team_id"], int(r["fpl_player_id"]))
    actual = {key(r): int(r["started"] > 0) for r in rows}
    deep = {key(r) for r in rows if (r["depth_rank"] or 3) >= 3}

    cur_p = run(rows, history, False, False)
    new_p = run(rows, history, True, False)
    results = []
    for label, pred in (("current", cur_p), ("A: deep backups at their start rate (registered)", new_p)):
        results.append({"variant": label,
                        "all": score([(pred.get(k, 0.0), y) for k, y in actual.items()]),
                        "deep_backups": score([(pred.get(k, 0.0), actual[k]) for k in deep]) if deep else None,
                        "by_gw": {gw: score([(pred.get(key(r), 0.0), actual[key(r)]) for r in rows if r["gw"] == gw]) for gw in (GW_FROM, GW_TO)}})
        print(label, json.dumps(results[-1]["all"]))
    base, reg = results[0]["all"], results[1]["all"]
    adopt = reg["brier"] < base["brier"] and reg["log_loss"] < base["log_loss"]
    diffs = [((new_p.get(k, 0) - y) ** 2 - (cur_p.get(k, 0) - y) ** 2) for k, y in actual.items()]
    n = len(diffs)
    mean = sum(diffs) / n
    sd = math.sqrt(sum((d - mean) ** 2 for d in diffs) / (n - 1))
    summary = {"gws": [GW_FROM, GW_TO], "snapshot": SNAPSHOT, "player_matches": n,
               "rule": "backups ranked 3rd or lower take an open place at their start rate (cap 0.9) instead of 0.9",
               "decision_rule": "adopt iff A beats current on both Brier and log loss over all outfield depth-chart player-matches, GW7-8, frozen pecking order",
               "results": results, "paired_brier_diff": {"mean": round(mean, 6), "se": round(sd / math.sqrt(n), 6)}, "adopt": adopt}
    print("ADOPT" if adopt else "DO NOT ADOPT", json.dumps(summary["paired_brier_diff"]))

    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    sb.table("analysis_results").insert({"analysis_id": "depth_deep_backup_backtest", "code_ref": os.environ.get("GITHUB_SHA", "local"),
                                         "result": summary}).execute()
    print("Saved analysis_results depth_deep_backup_backtest")


if __name__ == "__main__":
    main()
