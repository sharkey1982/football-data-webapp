#!/usr/bin/env python3
# ============================================================================
# scripts/backtest_depth_ties.py
#
# Backtest (10 Oct 2026): players sharing a rank on a club's pecking order --
# equal shares, or shares weighted by each player's own start rate?
#
# Found 10 Oct (Chris): Arsenal's three 2nd-choice midfielders (Lewis-Skelly,
# Zubimendi, Bruno G.) each had 43% to start, and Match
# Projections showed Zubimendi alongside Rice although Lewis-Skelly had
# started 4 of 5.
#
# Rule fixed BEFORE scoring: within a tied rank, the places that reach the
# tier are shared in proportion to ready x start rate (the same start rate
# the depth chart already uses: (starts + last season's rate) / (available
# matches + 1)), capped at each player's chance of a place being open; the
# tier's total is unchanged. (fpl_depth_chart.TIE_WEIGHT_BY_RATE.)
# Adopt iff it beats equal shares on BOTH Brier score and log loss over
# every outfield depth-chart player-match, GW3 to the last finished
# gameweek. Players in tied tiers reported for information.
#
# Same point-in-time inputs and caveat as backtest_depth_floor.py (the
# pecking order is today's; it isn't versioned). K = 3 (current) for both.
#
# Writes analysis_results 'depth_ties_backtest'.
#   python scripts/backtest_depth_ties.py
# ============================================================================

from __future__ import annotations

import json
import math
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
import fpl_depth_chart as dc  # noqa: E402
from backtest_depth_floor import SQL, run_variant, score  # noqa: E402


def main() -> None:
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as con, con.cursor(row_factory=dict_row) as cur:
        cur.execute("select public.fpl_current_season_id() s")
        season = cur.fetchone()["s"]
        cur.execute("select max(fpl_event_id) g from fpl_fixtures where season_id = %s and finished", (season,))
        last_gw = int(cur.fetchone()["g"])
        cur.execute(SQL, {"s": season, "g0": 3, "g1": last_gw})
        rows = cur.fetchall()
    print(f"GW3-{last_gw}: {len(rows)} player-matches, {sum(r['started'] > 0 for r in rows)} starts")

    key = lambda r: (r["fixture_id"], r["team_id"], int(r["fpl_player_id"]))
    actual = {key(r): int(r["started"] > 0) for r in rows}

    # Players whose rank is shared with a team-mate in the same role group.
    tiers: dict[tuple, list] = defaultdict(list)
    for r in rows:
        g = dc.ROLE_GROUP.get((r["tactical_role"] or "").upper())
        if g:
            tiers[(r["fixture_id"], r["team_id"], g, r["depth_rank"] or 3)].append(key(r))
    tied = {k for ks in tiers.values() if len(ks) > 1 for k in ks}

    preds = {}
    results = []
    for label, flag in (("equal shares (current)", False), ("weighted by start rate (registered)", True)):
        dc.TIE_WEIGHT_BY_RATE = flag
        pred = run_variant(rows, 3.0)
        preds[label] = pred
        res = {"variant": label,
               "all": score([(pred.get(k, 0.0), y) for k, y in actual.items()]),
               "tied_players": score([(pred.get(k, 0.0), actual[k]) for k in tied]) if tied else None,
               "by_gw": {gw: score([(pred.get(key(r), 0.0), actual[key(r)]) for r in rows if r["gw"] == gw]) for gw in range(3, last_gw + 1)}}
        results.append(res)
        print(label, json.dumps(res["all"]), "tied", json.dumps(res["tied_players"]))

    base, reg = results[0]["all"], results[1]["all"]
    adopt = reg["brier"] < base["brier"] and reg["log_loss"] < base["log_loss"]
    a, b = preds["equal shares (current)"], preds["weighted by start rate (registered)"]
    diffs = [((b.get(k, 0) - y) ** 2 - (a.get(k, 0) - y) ** 2) for k, y in actual.items()]
    n = len(diffs)
    mean = sum(diffs) / n
    sd = math.sqrt(sum((d - mean) ** 2 for d in diffs) / (n - 1))
    summary = {"gws": [3, last_gw], "player_matches": n, "tied_player_matches": len(tied),
               "rule": "tied ranks share the tier's places in proportion to ready x start rate (capped); tier total unchanged",
               "decision_rule": "adopt iff weighted beats equal shares on both Brier and log loss over all outfield depth-chart player-matches, GW3 to last finished",
               "results": results, "paired_brier_diff": {"mean": round(mean, 6), "se": round(sd / math.sqrt(n), 6)}, "adopt": adopt}
    print("ADOPT" if adopt else "DO NOT ADOPT", json.dumps(summary["paired_brier_diff"]))

    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    sb.table("analysis_results").insert({"analysis_id": "depth_ties_backtest", "code_ref": os.environ.get("GITHUB_SHA", "local"),
                                         "result": summary}).execute()
    print("Saved analysis_results depth_ties_backtest")


if __name__ == "__main__":
    main()
