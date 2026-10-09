#!/usr/bin/env python3
# ============================================================================
# scripts/analysis_transfer_captaincy.py
#
# One-off analysis (changes nothing on the site), 9 Oct 2026: does the
# "one captain or two?" article's conclusion survive transfers?
#
# The article held one squad for all ten gameweeks. Here the squad can
# change each week under FPL's transfer rules: one free transfer a week,
# up to five banked, 4 points for each extra. Week one's squad is free (as
# after a wildcard). Prices are fixed at today's (no price changes, no
# selling-price rule). Same scoring as the site's optimiser: each week's
# best legal XI plus the captain's points again (bench scores nothing).
#
# Exact MILP (pulp + native HiGHS). To keep the multi-week problem
# tractable the pool is cut to plausible picks (by total, by value, by
# each single week, plus cheap bench players, plus anyone forced in); the
# fixed-squad optimum on the cut pool is checked against the full pool.
#
# Every scenario is solved fixed (no transfers) and with transfers, on the
# same projections, so the comparison is like for like.
#
# Writes analysis_results 'transfer_captaincy'.
#   python scripts/analysis_transfer_captaincy.py --from 6 --to 15
# ============================================================================

from __future__ import annotations

import argparse
import json
import os
import time
from collections import defaultdict

import pulp

QUOTA = {1: 2, 2: 5, 3: 5, 4: 3}
XI_MIN = {1: 1, 2: 3, 3: 2, 4: 1}
XI_MAX = {1: 1, 2: 5, 3: 5, 4: 3}
HIT = 4
MAX_BANK = 5
EPS = 1e-6
IDS = {"Haaland": 411, "Saka": 12, "B.Fernandes": 426, "Palmer": 154}


def load(frm: int, to: int):
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    data = sb.rpc("get_fpl_optimizer_candidates_json", {"p_from_matchweek": frm, "p_to_matchweek": to}).execute().data
    rows = json.loads(data) if isinstance(data, str) else data
    snap = sb.rpc("get_fpl_projection_snapshot", {"p_season_id": 13, "p_league_id": 1, "p_model_version": "leaguewide_v6",
                                                   "p_scenario_key": "baseline", "p_from_matchweek": frm, "p_to_matchweek": to}).execute().data
    weeks = list(range(frm, to + 1))
    players: dict[int, dict] = {}
    for r in rows:
        pid, w = int(r["fpl_player_id"]), int(r["matchweek"])
        p = players.setdefault(pid, {"id": pid, "name": r["web_name"], "team": int(r["team_id"]), "pos": int(r["fpl_position"]),
                                     "price": float(r["price_m"]), "xp": {k: 0.0 for k in weeks}, "app": {k: 0.0 for k in weeks}})
        p["xp"][w] += float(r["expected_fpl_points"])
        p["app"][w] = min(1.0, float(r["start_probability"] or 0) + float(r["sub_appearance_probability"] or 0))
    for p in players.values():
        p["total"] = sum(p["xp"].values())
    snap_at = (snap[0] if isinstance(snap, list) and snap else snap or {}).get("max_generated_at") if snap else None
    return weeks, list(players.values()), len(rows), snap_at


def cut_pool(players: list[dict], weeks: list[int], force: set[int]) -> list[dict]:
    keep: set[int] = set(force)
    for pos in (1, 2, 3, 4):
        ps = [p for p in players if p["pos"] == pos]
        keep |= {p["id"] for p in sorted(ps, key=lambda p: -p["total"])[:40]}
        keep |= {p["id"] for p in sorted(ps, key=lambda p: -p["total"] / p["price"])[:25]}
        for w in weeks:
            keep |= {p["id"] for p in sorted(ps, key=lambda p: -p["xp"][w])[:10]}
        cheap = [p for p in ps if sum(p["app"].values()) / len(weeks) >= 0.75]
        keep |= {p["id"] for p in sorted(cheap, key=lambda p: p["price"])[:6]}
        keep |= {p["id"] for p in sorted(ps, key=lambda p: p["price"])[:4]}
    return [p for p in players if p["id"] in keep]


def solve(pool: list[dict], weeks: list[int], budget: float, include: set[int], exclude: set[int], transfers: bool,
          time_limit: int, gap: float) -> dict:
    prob = pulp.LpProblem("squad", pulp.LpMaximize)
    I = [p["id"] for p in pool]
    P = {p["id"]: p for p in pool}
    x = {(i, t): pulp.LpVariable(f"x_{i}_{t}", cat="Binary") for i in I for t in weeks}
    s = {(i, t): pulp.LpVariable(f"s_{i}_{t}", cat="Binary") for i in I for t in weeks}
    c = {(i, t): pulp.LpVariable(f"c_{i}_{t}", cat="Binary") for i in I for t in weeks}
    later = weeks[1:]
    tin = {(i, t): pulp.LpVariable(f"in_{i}_{t}", cat="Binary") for i in I for t in later}
    ft = {t: pulp.LpVariable(f"ft_{t}", 0, MAX_BANK, cat="Integer") for t in later}
    used = {t: pulp.LpVariable(f"u_{t}", 0, MAX_BANK, cat="Integer") for t in later}
    hits = {t: pulp.LpVariable(f"h_{t}", 0, None, cat="Integer") for t in later}

    prob += (pulp.lpSum(P[i]["xp"][t] * (s[i, t] + c[i, t]) for i in I for t in weeks)
             - HIT * pulp.lpSum(hits.values())
             - EPS * pulp.lpSum(P[i]["price"] * x[i, t] for i in I for t in weeks))
    clubs = defaultdict(list)
    for i in I:
        clubs[P[i]["team"]].append(i)
    for t in weeks:
        prob += pulp.lpSum(x[i, t] for i in I) == 15
        prob += pulp.lpSum(P[i]["price"] * x[i, t] for i in I) <= budget
        for pos in (1, 2, 3, 4):
            ids = [i for i in I if P[i]["pos"] == pos]
            prob += pulp.lpSum(x[i, t] for i in ids) == QUOTA[pos]
            prob += pulp.lpSum(s[i, t] for i in ids) >= XI_MIN[pos]
            prob += pulp.lpSum(s[i, t] for i in ids) <= XI_MAX[pos]
        for ids in clubs.values():
            if len(ids) > 3:
                prob += pulp.lpSum(x[i, t] for i in ids) <= 3
        prob += pulp.lpSum(s[i, t] for i in I) == 11
        prob += pulp.lpSum(c[i, t] for i in I) == 1
        for i in I:
            prob += s[i, t] <= x[i, t]
            prob += c[i, t] <= s[i, t]
            if i in include:
                prob += x[i, t] == 1
            if i in exclude:
                prob += x[i, t] == 0
    for k, t in enumerate(later):
        prev = weeks[k]
        n = pulp.lpSum(tin[i, t] for i in I)
        for i in I:
            prob += tin[i, t] >= x[i, t] - x[i, prev]
        if not transfers:
            prob += n == 0
        prob += used[t] <= ft[t]
        prob += used[t] <= n
        prob += hits[t] >= n - used[t]
        if k == 0:
            prob += ft[t] == 1
        else:
            pt = later[k - 1]
            prob += ft[t] <= ft[pt] - used[pt] + 1
    t0 = time.time()
    solver = pulp.HiGHS(msg=False, timeLimit=time_limit, gapRel=gap)
    status = prob.solve(solver)
    secs = round(time.time() - t0, 1)
    # pulp reports "Optimal" even when HiGHS stopped at the time limit with a
    # feasible solution: read HiGHS's own status and gap.
    hm = getattr(prob, "solverModel", None) or getattr(solver, "solverModel", None)
    highs_status, mip_gap = None, None
    if hm is not None:
        highs_status = hm.modelStatusToString(hm.getModelStatus())
        mip_gap = round(float(hm.getInfo().mip_gap), 5)
    val = lambda v: (v.value() or 0)
    squad = {t: [i for i in I if val(x[i, t]) > 0.5] for t in weeks}
    out = {"status": pulp.LpStatus[status], "highs_status": highs_status, "mip_gap": mip_gap, "seconds": secs, "gap_target": gap}
    xi_pts = sum(P[i]["xp"][t] for i in I for t in weeks if val(s[i, t]) > 0.5)
    cap_pts = sum(P[i]["xp"][t] for i in I for t in weeks if val(c[i, t]) > 0.5)
    hit_pts = HIT * sum(round(val(h)) for h in hits.values())
    weekly = []
    for k, t in enumerate(weeks):
        cap = next(i for i in I if val(c[i, t]) > 0.5)
        ins = [P[i]["name"] for i in I if t in later and val(tin[i, t]) > 0.5]
        outs = [P[i]["name"] for i in squad[weeks[k - 1]] if k > 0 and i not in squad[t]] if k > 0 else []
        weekly.append({"gw": t, "captain": P[cap]["name"], "captain_points": round(P[cap]["xp"][t], 2),
                       "transfers_in": ins, "transfers_out": outs, "hits": round(val(hits[t])) if t in later else 0,
                       "premiums": sorted(P[i]["name"] for i in squad[t] if P[i]["price"] >= 9.0),
                       "cost": round(sum(P[i]["price"] for i in squad[t]), 1)})
    caps = defaultdict(int)
    for w in weekly:
        caps[w["captain"]] += 1
    out.update({"total": round(xi_pts + cap_pts - hit_pts, 2), "xi_points": round(xi_pts, 2), "captain_points": round(cap_pts, 2),
                "hit_points": hit_pts, "transfers": sum(len(w["transfers_in"]) for w in weekly), "captains": dict(caps),
                "start_squad": sorted(P[i]["name"] for i in squad[weeks[0]]), "weekly": weekly})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="frm", type=int, default=6)
    ap.add_argument("--to", type=int, default=15)
    ap.add_argument("--time-limit", type=int, default=480)
    ap.add_argument("--gap", type=float, default=0.005)
    a = ap.parse_args()
    weeks, players, nrows, snap = load(a.frm, a.to)
    haaland = IDS["Haaland"]
    premiums = {p["id"] for p in players if p["price"] >= 9.0 and p["id"] != haaland}
    force_all = set(IDS.values())
    pool = cut_pool(players, weeks, force_all)
    print(f"{nrows} rows, {len(players)} players, pool {len(pool)}; projections {snap}")

    # Pool check: fixed-squad optimum, full pool v cut pool.
    full_fixed = solve(players, weeks, 100, set(), set(), False, a.time_limit, 1e-6)
    cut_fixed = solve(pool, weeks, 100, set(), set(), False, a.time_limit, 1e-6)
    print(f"fixed optimum: full pool {full_fixed['total']} ({full_fixed['status']}), cut pool {cut_fixed['total']}")

    scenarios = [
        ("free", "Optimiser chooses", set(), set()),
        ("haaland_saka", "Haaland + Saka held", {haaland, IDS["Saka"]}, set()),
        ("haaland_bruno", "Haaland + Bruno held", {haaland, IDS["B.Fernandes"]}, set()),
        ("haaland_alone", "Haaland, never a £9m+ partner", {haaland}, premiums),
        ("no_haaland", "Never Haaland", set(), {haaland}),
    ]
    results = []
    for key, label, inc, exc in scenarios:
        for transfers in (False, True):
            r = solve(pool, weeks, 100, inc, exc, transfers, a.time_limit, a.gap if transfers else 1e-6)
            r.update({"key": key, "label": label, "transfers_allowed": transfers})
            print(f"{key} transfers={transfers}: {r['total']} ({r['highs_status']}, gap {r['mip_gap']}, {r['seconds']}s, {r['transfers']} transfers, captains {r['captains']})")
            results.append(r)
    summary = {"weeks": weeks, "projection_snapshot": snap, "rows": nrows, "players": len(players), "pool": len(pool),
               "pool_check": {"full_pool_fixed": full_fixed["total"], "cut_pool_fixed": cut_fixed["total"],
                              "full_pool_squad": full_fixed["start_squad"]},
               "rules": "1 free transfer a week from week 2, up to 5 banked, -4 per extra; week 1 squad free; prices fixed; bench scores 0",
               "results": results}
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    sb.table("analysis_results").insert({"analysis_id": "transfer_captaincy", "code_ref": os.environ.get("GITHUB_SHA", "local"),
                                         "result": summary}).execute()
    print("Saved analysis_results transfer_captaincy")


if __name__ == "__main__":
    main()
