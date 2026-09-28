#!/usr/bin/env python3
# ============================================================================
# scripts/analysis_squad_variance.py
#
# One-off analysis (not a registered experiment; changes nothing on the
# site). Two questions from Chris, 28 Sep 2026:
#
#  gw      How variable is a gameweek, really, versus picking "optimally"?
#          Simulates the next gameweek N_WORLDS times with linked outcomes
#          (team goals drive goals, assists, clean sheets and goals conceded;
#          minutes drawn from start probability and exit bands), scores:
#            - the xPts-optimal XI + captain, and the next 49 best XIs,
#            - a "template" XI (most-owned), a differential XI (<10% owned),
#          and a simulated field of N_FIELD managers picked by ownership, to
#          estimate each squad's chance of a top-1% / top-10% gameweek. The
#          field is re-scored in every world, so when the popular captain
#          hauls, the whole field rises too.
#
#  season  Set-and-forget, 2025/26: the best possible fixed XI + captain
#          (budget 100.0 at start prices, a valid 15-man squad with the
#          cheapest bench), then the next-best distinct XIs in order, to
#          count how many were within 1/2/3/5% of the best.
#
# Results go to analysis_results (analysis_id squad_variance_gw /
# set_and_forget_2025).
#
#   python scripts/analysis_squad_variance.py --part gw|season|both
# ============================================================================

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

import numpy as np
import pulp

N_WORLDS = 10000
N_FIELD = 2000
N_ALTERNATIVES = 50
SEASON_ENUM_LIMIT = 400
SEASON_ENUM_SECONDS = 1500
QUOTA = {1: 2, 2: 5, 3: 5, 4: 3}
XI_MIN = {1: 1, 2: 3, 3: 2, 4: 1}
XI_MAX = {1: 1, 2: 5, 3: 5, 4: 3}
GOAL_PTS = {1: 10, 2: 6, 3: 5, 4: 4}
CS_PTS = {1: 4, 2: 4, 3: 1, 4: 0}
BAND_SHARE = np.array([47.0 / 90, 72.7 / 90, 1.0])   # off before 60 / 60-84 / 85+
SUB_SHARE = 18.2 / 90


def page(sb, table, cols, filters, order):
    out, start = [], 0
    while True:
        q = sb.table(table).select(cols)
        for kind, col, val in filters:
            q = getattr(q, kind)(col, val)
        for col in order:
            q = q.order(col)
        rows = q.range(start, start + 999).execute().data or []
        out += rows
        if len(rows) < 1000:
            return out
        start += 1000


# ---------------------------------------------------------------- selection

def solve(players, score, budget, xi_only=None, cuts=(), bench_weight=0.05, time_limit=60):
    """Best 15-man squad (budget, 3 per club, quotas) maximising score over the XI plus captain
    (captain scored twice). xi_only: player indices allowed in the XI. cuts: XIs to exclude.
    Returns (xi, captain, squad) as index lists, or None."""
    n = len(players)
    prob = pulp.LpProblem("squad", pulp.LpMaximize)
    x = [pulp.LpVariable(f"x{i}", cat="Binary") for i in range(n)]
    y = [pulp.LpVariable(f"y{i}", cat="Binary") for i in range(n)]
    c = [pulp.LpVariable(f"c{i}", cat="Binary") for i in range(n)]
    prob += pulp.lpSum(score[i] * (y[i] + c[i]) + bench_weight * score[i] * (x[i] - y[i]) for i in range(n))
    prob += pulp.lpSum(players[i]["cost"] * x[i] for i in range(n)) <= budget
    for pos, q in QUOTA.items():
        idx = [i for i in range(n) if players[i]["pos"] == pos]
        prob += pulp.lpSum(x[i] for i in idx) == q
        prob += pulp.lpSum(y[i] for i in idx) >= XI_MIN[pos]
        prob += pulp.lpSum(y[i] for i in idx) <= XI_MAX[pos]
    for team in {p["team"] for p in players}:
        prob += pulp.lpSum(x[i] for i in range(n) if players[i]["team"] == team) <= 3
    prob += pulp.lpSum(y) == 11
    prob += pulp.lpSum(c) == 1
    for i in range(n):
        prob += y[i] <= x[i]
        prob += c[i] <= y[i]
        if xi_only is not None and i not in xi_only:
            prob += y[i] == 0
    for xi in cuts:
        prob += pulp.lpSum(y[i] for i in xi) <= 10
    status = prob.solve(pulp.PULP_CBC_CMD(msg=False, timeLimit=time_limit))
    if pulp.LpStatus[status] != "Optimal":
        return None
    xi = [i for i in range(n) if y[i].value() > 0.5]
    cap = next(i for i in range(n) if c[i].value() > 0.5)
    squad = [i for i in range(n) if x[i].value() > 0.5]
    return xi, cap, squad


# ---------------------------------------------------------------- gameweek

def load_gameweek(sb):
    season = sb.rpc("fpl_current_season_id").execute().data
    gws = sb.table("fpl_gameweeks").select("fpl_event_id,deadline_time").eq("season_id", season).gt("deadline_time", datetime.now(timezone.utc).isoformat()).order("deadline_time").limit(1).execute().data
    event = gws[0]["fpl_event_id"]
    fx = [r["canonical_fixture_id"] for r in sb.table("fpl_fixtures").select("canonical_fixture_id").eq("season_id", season).eq("fpl_event_id", event).execute().data]
    fixtures = {f["fixture_id"]: f for f in sb.table("fixtures").select(
        "fixture_id,home_team_id,away_team_id,predicted_home_goals,predicted_away_goals,market_home_goals,market_away_goals").in_("fixture_id", fx).execute().data}
    proj = page(sb, "fpl_player_projections",
                "fixture_id,fpl_player_id,start_probability,sub_appearance_probability,expected_goals,expected_assists,expected_saves,"
                "defensive_contribution_probability,expected_bonus,xpts_cards_own_goals,xpts_penalties,expected_fpl_points",
                [("eq", "model_version", "leaguewide_v6"), ("in_", "fixture_id", fx)], ["fixture_id", "fpl_player_id"])
    meta = {p["fpl_player_id"]: p for p in page(sb, "fpl_players", "fpl_player_id,web_name,element_type,now_cost,selected_by_percent,canonical_team_id",
                                                [("eq", "season_id", season)], ["fpl_player_id"])}
    bands = {b["fpl_player_id"]: b for b in page(sb, "fpl_player_exit_bands", "fpl_player_id,p_off_before_60,p_off_60_84,p_full",
                                                 [("eq", "season_id", season)], ["fpl_player_id"])}
    players = []
    for r in proj:
        m, f = meta.get(r["fpl_player_id"]), fixtures.get(r["fixture_id"])
        if not m or not f or m["element_type"] not in QUOTA:
            continue
        home = m["canonical_team_id"] == f["home_team_id"]
        lh = f["market_home_goals"] if f["market_home_goals"] is not None else f["predicted_home_goals"]
        la = f["market_away_goals"] if f["market_away_goals"] is not None else f["predicted_away_goals"]
        b = bands.get(r["fpl_player_id"]) or {"p_off_before_60": 0, "p_off_60_84": 0, "p_full": 1}
        num = lambda v: float(v or 0)
        players.append({
            "id": r["fpl_player_id"], "name": m["web_name"], "pos": m["element_type"], "cost": int(m["now_cost"]),
            "own": num(m["selected_by_percent"]), "team": m["canonical_team_id"], "fixture": r["fixture_id"], "home": home,
            "lam_for": float(lh if home else la), "lam_against": float(la if home else lh),
            "p_start": min(max(num(r["start_probability"]), 0), 1), "p_sub": min(max(num(r["sub_appearance_probability"]), 0), 1),
            "xg": num(r["expected_goals"]), "xa": num(r["expected_assists"]), "xsaves": num(r["expected_saves"]),
            "p_dc": num(r["defensive_contribution_probability"]), "bonus": num(r["expected_bonus"]),
            "flat": num(r["xpts_cards_own_goals"]) + num(r["xpts_penalties"]), "xpts": num(r["expected_fpl_points"]),
            "bands": np.array([num(b["p_off_before_60"]), num(b["p_off_60_84"]), num(b["p_full"])]),
        })
    return event, fixtures, players


def simulate(players, fixtures, n_worlds, rng):
    """Points matrix (worlds x players), linked through each fixture's simulated goals."""
    fx_ids = sorted(fixtures)
    fx_index = {f: k for k, f in enumerate(fx_ids)}
    goals = {}
    for f in fx_ids:
        fr = fixtures[f]
        lh = fr["market_home_goals"] if fr["market_home_goals"] is not None else fr["predicted_home_goals"]
        la = fr["market_away_goals"] if fr["market_away_goals"] is not None else fr["predicted_away_goals"]
        goals[f] = (rng.poisson(float(lh), n_worlds), rng.poisson(float(la), n_worlds))
    pts = np.zeros((n_worlds, len(players)), dtype=np.float32)
    for j, p in enumerate(players):
        gh, ga = goals[p["fixture"]]
        g_for, g_against = (gh, ga) if p["home"] else (ga, gh)
        u = rng.random(n_worlds)
        started = u < p["p_start"]
        p_sub_given_not = p["p_sub"] / max(1e-9, 1 - p["p_start"]) if p["p_start"] < 1 else 0
        sub = (~started) & (rng.random(n_worlds) < min(1.0, p_sub_given_not))
        bw = p["bands"] / p["bands"].sum() if p["bands"].sum() > 0 else np.array([0, 0, 1.0])
        band = rng.choice(3, size=n_worlds, p=bw)
        share = np.where(started, BAND_SHARE[band], np.where(sub, SUB_SHARE, 0.0))
        exp_share = p["p_start"] * float((bw * BAND_SHARE).sum()) + p["p_sub"] * SUB_SHARE
        rel = share / exp_share if exp_share > 0 else np.zeros(n_worlds)
        app = np.where(started, np.where(band == 0, 1, 2), np.where(sub, 1, 0))
        # Each team goal: this player scores / assists it with his share of the team's goals,
        # scaled by his minutes this world relative to expectation.
        r_goal = np.clip(p["xg"] / max(p["lam_for"], 1e-6) * rel, 0, 0.95)
        r_ast = np.clip(p["xa"] / max(p["lam_for"], 1e-6) * rel, 0, 0.95)
        scored = rng.binomial(g_for, r_goal)
        assisted = rng.binomial(g_for, r_ast)
        conceded_on = rng.binomial(g_against, np.clip(share, 0, 1))
        cs = (share >= 60 / 90) & (conceded_on == 0)
        s = app + scored * GOAL_PTS[p["pos"]] + assisted * 3 + cs * CS_PTS[p["pos"]]
        if p["pos"] in (1, 2):
            s = s - conceded_on // 2
        if p["pos"] == 1:
            saves = rng.poisson(p["xsaves"] * rel)
            s = s + saves // 3
        s = s + 2 * (rng.random(n_worlds) < np.clip(p["p_dc"] * rel, 0, 1))
        s = s + p["bonus"] * rel + p["flat"] * rel
        pts[:, j] = s
    return pts


def squad_points(pts, xi, cap):
    return pts[:, xi].sum(axis=1) + pts[:, cap]


def sample_field(players, n_field, rng):
    """Field XIs picked by ownership (position quotas, 3 per club; budget ignored); captain = best xPts in the XI."""
    by_pos = {pos: [i for i, p in enumerate(players) if p["pos"] == pos and p["own"] > 0] for pos in QUOTA}
    formations = [(3, 4, 3), (3, 5, 2), (4, 4, 2), (4, 3, 3), (5, 3, 2), (4, 5, 1), (5, 4, 1)]
    weights = np.array([0.30, 0.20, 0.15, 0.15, 0.08, 0.07, 0.05])
    field = []
    while len(field) < n_field:
        d, m, f = formations[rng.choice(len(formations), p=weights)]
        xi, clubs, ok = [], {}, True
        for pos, k in ((1, 1), (2, d), (3, m), (4, f)):
            pool = by_pos[pos]
            w = np.array([players[i]["own"] for i in pool])
            picks = rng.choice(pool, size=k, replace=False, p=w / w.sum())
            xi += list(picks)
        for i in xi:
            clubs[players[i]["team"]] = clubs.get(players[i]["team"], 0) + 1
            ok &= clubs[players[i]["team"]] <= 3
        if ok:
            cap = max(xi, key=lambda i: players[i]["xpts"])
            field.append((xi, cap))
    return field


def run_gameweek(sb, rng):
    event, fixtures, players = load_gameweek(sb)
    print(f"GW{event}: {len(players)} player-fixtures, {len(fixtures)} fixtures")
    # One entry per player (a double gameweek would need summing; GW6 is single).
    xpts = [p["xpts"] for p in players]
    t0 = time.time()
    opt = solve(players, xpts, 1000)
    alts, cuts = [opt], [opt[0]]
    while len(alts) < N_ALTERNATIVES:
        s = solve(players, xpts, 1000, cuts=cuts)
        if not s:
            break
        alts.append(s)
        cuts.append(s[0])
    print(f"{len(alts)} XIs in {time.time() - t0:.0f}s")
    template = solve(players, [p["own"] for p in players], 1000)
    diff_pool = {i for i, p in enumerate(players) if p["own"] < 10}
    differential = solve(players, xpts, 1000, xi_only=diff_pool)

    pts = simulate(players, fixtures, N_WORLDS, rng)
    calib = float(pts.mean(axis=0).sum() / max(sum(xpts), 1e-9))
    field = sample_field(players, N_FIELD, rng)
    field_scores = np.stack([squad_points(pts, xi, cap) for xi, cap in field], axis=1)   # worlds x field
    top1 = np.percentile(field_scores, 99, axis=1)
    top10 = np.percentile(field_scores, 90, axis=1)
    median = np.percentile(field_scores, 50, axis=1)

    def describe(label, sq):
        xi, cap, _ = sq
        s = squad_points(pts, xi, cap)
        return {
            "label": label, "xpts": round(sum(xpts[i] for i in xi) + xpts[cap], 2), "sim_mean": round(float(s.mean()), 2),
            "p10": float(np.percentile(s, 10)), "p50": float(np.percentile(s, 50)), "p90": float(np.percentile(s, 90)),
            "sd": round(float(s.std()), 1),
            "p_top1": round(float((s >= top1).mean()), 4), "p_top10": round(float((s >= top10).mean()), 4),
            "p_beat_median": round(float((s > median).mean()), 4),
            "avg_ownership_xi": round(float(np.mean([players[i]["own"] for i in xi])), 1),
            "captain": players[cap]["name"], "xi": [players[i]["name"] for i in xi],
        }

    squads = [describe("optimal", opt), describe("template (most owned)", template), describe("differential (<10% owned)", differential)]
    alt_stats = [describe(f"alternative {k + 1}", a) for k, a in enumerate(alts)]
    means = [a["xpts"] for a in alt_stats]
    # How often each of the top-50 XIs actually finishes best among them.
    alt_matrix = np.stack([squad_points(pts, a[0], a[1]) for a in alts], axis=1)
    winner = np.bincount(alt_matrix.argmax(axis=1), minlength=len(alts)) / N_WORLDS
    result = {
        "gameweek": event, "worlds": N_WORLDS, "field_size": N_FIELD, "simulator_calibration_ratio": round(calib, 3),
        "field": {"median_mean": round(float(median.mean()), 1), "top10_mean": round(float(top10.mean()), 1),
                  "top1_mean": round(float(top1.mean()), 1), "top1_p10_p90": [float(np.percentile(top1, 10)), float(np.percentile(top1, 90))]},
        "squads": squads,
        "alternatives": {"count": len(alt_stats), "xpts_best": means[0], "xpts_50th": means[-1],
                         "xpts_spread": round(means[0] - means[-1], 2),
                         "sim_sd_typical": float(np.median([a["sd"] for a in alt_stats])),
                         "optimal_finishes_best_share": round(float(winner[0]), 4),
                         "max_finishes_best_share": round(float(winner.max()), 4),
                         "p_top1_range": [min(a["p_top1"] for a in alt_stats), max(a["p_top1"] for a in alt_stats)],
                         "rows": [{k: a[k] for k in ("label", "xpts", "sim_mean", "sd", "p_top1", "avg_ownership_xi", "captain")} for a in alt_stats]},
    }
    return result


# ---------------------------------------------------------------- season

def run_season(sb):
    rows = page(sb, "fpl_player_season_totals", "fpl_code,web_name,element_type,team_name,start_cost,total_points",
                [("eq", "season_id", 12)], ["fpl_code"])
    players = [{"name": r["web_name"], "pos": r["element_type"], "team": r["team_name"], "cost": int(r["start_cost"]),
                "pts": float(r["total_points"] or 0)} for r in rows if r["element_type"] in QUOTA and r["start_cost"]]
    score = [p["pts"] for p in players]
    t0 = time.time()
    best = solve(players, score, 1000, bench_weight=0.0)
    total = lambda s: sum(score[i] for i in s[0]) + score[s[1]]
    top = total(best)
    found, cuts = [total(best)], [best[0]]
    first = {"xi": [players[i]["name"] for i in best[0]], "captain": players[best[1]]["name"], "points": top,
             "cost": sum(players[i]["cost"] for i in best[2]) / 10}
    while len(found) < SEASON_ENUM_LIMIT and time.time() - t0 < SEASON_ENUM_SECONDS:
        s = solve(players, score, 1000, cuts=cuts, bench_weight=0.0)
        if not s:
            break
        found.append(total(s))
        cuts.append(s[0])
        if total(s) < 0.95 * top:
            break
    found = np.array(found)
    within = {f"{p}%": int((found >= top * (1 - p / 100)).sum()) for p in (1, 2, 3, 5)}
    capped = len(found) >= SEASON_ENUM_LIMIT or time.time() - t0 >= SEASON_ENUM_SECONDS
    return {"season": "2025/26", "players": len(players), "best": first, "xis_enumerated": int(len(found)),
            "enumeration_capped": bool(capped), "lowest_enumerated": float(found.min()),
            "within_of_best": within, "seconds": round(time.time() - t0)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", choices=["gw", "season", "both"], default="both")
    args = ap.parse_args()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    code_ref = os.environ.get("GITHUB_SHA") or subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    rng = np.random.default_rng(20260928)
    if args.part in ("gw", "both"):
        r = run_gameweek(sb, rng)
        print({k: v for k, v in r.items() if k not in ("alternatives",)})
        sb.table("analysis_results").insert({"analysis_id": "squad_variance_gw", "code_ref": code_ref, "result": r}).execute()
    if args.part in ("season", "both"):
        r = run_season(sb)
        print(r)
        sb.table("analysis_results").insert({"analysis_id": "set_and_forget_2025", "code_ref": code_ref, "result": r}).execute()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        for line in traceback.format_exc().splitlines():
            print(f"::error::{line}")
        raise
