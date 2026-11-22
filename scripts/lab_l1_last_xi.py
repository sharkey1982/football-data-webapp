"""
Model Lab experiment L1_last_xi_changes (registered 22 Nov 2026, migration
20261122223000, before any scoring): start probability built from the side's
last league XI, then the reasons each player drops out, then who replaces him.

Chris, 22 Nov 2026: "If selecting the same team as last week is more accurate
- should team selection approach change to starting with previous team sheets
and identifying most likely players to be replaced somehow?" (GW9-11 so far:
the naive last XI beat the published model on starters right in each
gameweek: 186 v 180, 191 v 183, 159 v 152 of 198 with one game to play.)

Model, per side and fixture (all inputs known before the deadline; the data
and point-in-time features are X1's, scripts/lab_x1_start_model.py):
  1. Keep: every player who started the side's last league game keeps his
     place with probability r (goalkeeper r_gk), times his FPL chance of
     playing at the deadline (0 if out), times e if he went off before 60
     minutes last time (not flagged), times c if the side played a cup or
     European game 2-5 days before.
  2. Vacancies: each kept player's shortfall (1 - keep) is a vacancy in his
     position (GK / DEF / MID / FWD); missing last-XI players (left, no row)
     are outfield vacancies.
  3. Replace: a position's vacancies go to the side's other players in that
     position, in proportion to w = chance x (start rate over his last 5
     available games + a), capped at 0.95; whatever a position can't fill
     goes to every other outfield candidate by the same weights.
  Five parameters (r, r_gk, e, c, a), chosen on tuning by Brier from a grid.

Splits (gameweeks of 2026/27): tuning GW2-8, validation GW9-10 (reported,
not decisive), holdout GW11 (scored once, --open-holdout; refuses until every
GW11 side has 11 starts).

Adopt iff, on the holdout, over every player in the published pre-deadline
snapshot whose side played once that gameweek: (1) L1 beats the published
model on BOTH Brier and log loss, AND (2) L1's predicted XIs get at least as
many starters right as the naive last XI.

  python scripts/lab_l1_last_xi.py [--open-holdout] [--cache DIR] [--no-write]
Writes lab_scorings (experiment L1_last_xi_changes) and analysis_results
(lab_l1_last_xi) unless --no-write.
"""
from __future__ import annotations

import argparse
import itertools
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
import lab_x1_start_model as x1  # noqa: E402

EXPERIMENT = "L1_last_xi_changes"
SPLITS = {"tuning": (2, 8), "validation": (9, 10), "holdout": (11, 11)}
GRID = {
    "r": [0.80, 0.84, 0.88, 0.92, 0.95],
    "r_gk": [0.90, 0.95, 0.98],
    "e": [0.7, 0.85, 1.0],
    "c": [0.8, 0.9, 1.0],
    "a": [0.02, 0.05, 0.15],
}
CAP = 0.95
POS = {"1": "GK", "2": "DEF", "3": "MID", "4": "FWD"}


def add_context(rows: list[dict], data: dict) -> None:
    """Adds each row's position and the minutes he played in the side's last
    league game (point in time: the last finished game before kick-off)."""
    pos = {int(p["fpl_player_id"]): POS.get(p["element_type"], "MID") for p in data["players"]}
    ko = {int(f["fpl_fixture_id"]): x1.ts(f["kickoff_time"]) for f in data["fixtures"] if f["kickoff_time"]}
    fin = {int(f["fpl_fixture_id"]) for f in data["fixtures"] if f["finished"] == "True"}
    games = defaultdict(list)
    for f in data["fixtures"]:
        if f["kickoff_time"]:
            games[int(f["fpl_home_team_id"])].append(int(f["fpl_fixture_id"]))
            games[int(f["fpl_away_team_id"])].append(int(f["fpl_fixture_id"]))
    for t in games:
        games[t].sort(key=lambda g: ko[g])
    mins = {(int(r["fpl_player_id"]), int(r["fpl_fixture_id"])): int(r["minutes"] or 0) for r in data["pg"]}
    for r in rows:
        r["pos"] = pos.get(r["pid"], "MID")
        past = [g for g in games[r["team"]] if ko[g] < ko[r["fid"]] and g in fin]
        r["last_min"] = mins.get((r["pid"], past[-1]), 0) if past else 0


def predict_l1(rows: list[dict], prm: dict) -> dict[tuple[int, int], float]:
    by_side: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for r in rows:
        by_side[(r["fid"], r["team"])].append(r)
    out = {}
    for side in by_side.values():
        keep, vac = {}, defaultdict(float)
        last_xi = [r for r in side if r["started_last"] > 0]
        for r in last_xi:
            k = prm["r_gk"] if r["pos"] == "GK" else prm["r"]
            k *= r["chance"]
            if r["last_min"] < 60 and r["chance"] >= 1.0:
                k *= prm["e"]
            if r["cup_midweek"] > 0:
                k *= prm["c"]
            keep[r["pid"]] = k
            vac[r["pos"]] += 1 - k
        missing = 11 - len(last_xi)
        if missing > 0:
            if not any(r["pos"] == "GK" for r in last_xi):
                vac["GK"] += 1
                missing -= 1
            vac["OUT"] += max(0, missing)
        cands = [r for r in side if r["started_last"] == 0]
        w = {r["pid"]: r["chance"] * (r["start_rate5"] + prm["a"]) for r in cands}
        p = {r["pid"]: 0.0 for r in cands}
        spill = vac.pop("OUT", 0.0)
        for pos_, v in vac.items():
            group = [r for r in cands if r["pos"] == pos_]
            tot = sum(w[r["pid"]] for r in group)
            if tot <= 0:
                if pos_ != "GK":
                    spill += v
                continue
            for r in group:
                p[r["pid"]] += v * w[r["pid"]] / tot
        # Anything above the cap, and unfillable outfield places, go to every outfield candidate.
        for r in cands:
            if p[r["pid"]] > CAP:
                spill += p[r["pid"]] - CAP
                p[r["pid"]] = CAP
        if spill > 1e-9:
            pool = [r for r in cands if r["pos"] != "GK" and p[r["pid"]] < CAP]
            tot = sum(w[r["pid"]] for r in pool)
            if tot > 0:
                for r in pool:
                    p[r["pid"]] = min(CAP, p[r["pid"]] + spill * w[r["pid"]] / tot)
        for r in side:
            v = keep.get(r["pid"], p.get(r["pid"], 0.0))
            out[(r["pid"], r["fid"])] = min(0.99, max(0.005, v))
    return out


def tune(rows: list[dict]) -> tuple[dict, list]:
    keys = list(GRID)
    results = []
    for combo in itertools.product(*(GRID[k] for k in keys)):
        prm = dict(zip(keys, combo))
        pred = predict_l1(rows, prm)
        m = x1.brier_ll([(pred[(r["pid"], r["fid"])], r["y"]) for r in rows])
        results.append((m["brier"], m["log_loss"], prm))
    results.sort(key=lambda t: (t[0], t[1]))
    return results[0][2], results[:5]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--open-holdout", action="store_true")
    ap.add_argument("--cache", default="/tmp/l1_cache")
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    data = x1.load_data(args.cache)
    rows = [r for r in x1.build_rows(data) if r["single"] and r["n_past"] > 0]
    add_context(rows, data)
    last_gw = SPLITS["holdout"][1] if args.open_holdout else SPLITS["validation"][1]
    for g in range(2, last_gw + 1):
        starts = sum(r["y"] for r in rows if r["gw"] == g)
        sides = len({(r["fid"], r["team"]) for r in rows if r["gw"] == g})
        if starts != 11 * sides:
            sys.exit(f"GW{g}: {starts} starts for {sides} sides; line-ups incomplete, not scoring")
    splits = ["tuning", "validation"] + (["holdout"] if args.open_holdout else [])
    in_split = {s: [r for r in rows if SPLITS[s][0] <= r["gw"] <= SPLITS[s][1]] for s in SPLITS}
    print("split sizes", {s: len(v) for s, v in in_split.items()})

    prm, top5 = tune(in_split["tuning"])
    print("chosen", prm, "top5 on tuning (brier, log loss):", [(b, l, p) for b, l, p in top5])
    pa, pb = x1.naive_probs(in_split["tuning"])

    pub: dict[tuple[int, str, int], tuple[str, float]] = {}
    for p in data["published"]:
        if p["start_probability"] == "":
            continue
        k = (int(p["fpl_event_id"]), p["fixture_id"], int(p["fpl_player_id"]))
        if k not in pub or p["snapshot_at"] > pub[k][0]:
            pub[k] = (p["snapshot_at"], float(p["start_probability"]))

    code_ref = os.environ.get("GITHUB_SHA", "local")
    summary = {"params": prm, "grid": GRID, "top5_tuning": [[b, l, p] for b, l, p in top5],
               "naive_p": [round(pa, 4), round(pb, 4)], "splits": {}}
    scorings = []
    for split in splits:
        rs = in_split[split]
        l1 = predict_l1(rs, prm)
        nv = {(r["pid"], r["fid"]): (pa if r["started_last"] > 0 else pb) for r in rs}
        # Validation and holdout are scored over the published snapshot's players (it exists from
        # GW7); tuning over every row, with no published comparison.
        with_pub = [r for r in rs if (r["gw"], r["canon"], r["pid"]) in pub] if split != "tuning" else []
        cur = {(r["pid"], r["fid"]): pub[(r["gw"], r["canon"], r["pid"])][1] for r in with_pub}
        if split != "tuning" and not with_pub:
            sys.exit(f"{split}: no published snapshot rows")
        scored = with_pub if split != "tuning" else rs
        res = {"L1 (registered)": x1.evaluate(scored, l1),
               "naive: same XI as last league game": x1.evaluate(scored, nv, naive_xi=True)}
        if with_pub:
            res["published model (leaguewide_v6)"] = x1.evaluate(scored, cur)
        per_gw = {}
        for g in range(SPLITS[split][0], SPLITS[split][1] + 1):
            sg = [r for r in scored if r["gw"] == g]
            if not sg:
                continue
            per_gw[g] = {"L1": x1.evaluate(sg, l1), "naive": x1.evaluate(sg, nv, naive_xi=True)}
            if with_pub:
                per_gw[g]["published"] = x1.evaluate(sg, cur)
        verdict = {}
        if with_pub:
            a, c, n = res["L1 (registered)"], res["published model (leaguewide_v6)"], res["naive: same XI as last league game"]
            verdict = {"paired_brier_l1_minus_published": x1.paired_brier(scored, l1, cur),
                       "beats_published_on_both": a["brier"] < c["brier"] and a["log_loss"] < c["log_loss"],
                       "starters_margin_over_naive": a["starters_right"] - n["starters_right"],
                       "starters_margin_over_published": a["starters_right"] - c["starters_right"]}
            verdict["passes_rule"] = verdict["beats_published_on_both"] and verdict["starters_margin_over_naive"] >= 0
        summary["splits"][split] = {"gws": SPLITS[split], "results": res, "per_gw": per_gw, **verdict}
        print(split, json.dumps(summary["splits"][split], default=str))
        for label, m in res.items():
            scorings.append({"experiment_id": EXPERIMENT, "split": split, "variant": label, "n_matches": m["n"],
                             "metrics": m | ({"params": prm} | verdict if label.startswith("L1") else {}), "code_ref": code_ref})
    if args.open_holdout:
        summary["adopt"] = summary["splits"]["holdout"]["passes_rule"]
        print("PASS: ADOPT" if summary["adopt"] else "FAIL: DO NOT ADOPT")
    if args.no_write:
        return
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    for row in sorted(scorings, key=lambda r: r["split"] == "holdout"):
        sb.table("lab_scorings").insert(row).execute()
    n_variants = 1
    for v in GRID.values():
        n_variants *= len(v)
    sb.table("lab_experiments").update({"variants_tried": n_variants, "status": "holdout_opened" if args.open_holdout else "validated"}) \
        .eq("experiment_id", EXPERIMENT).execute()
    sb.table("analysis_results").insert({"analysis_id": "lab_l1_last_xi", "code_ref": code_ref, "result": summary}).execute()
    print("Saved lab_scorings and analysis_results lab_l1_last_xi")


if __name__ == "__main__":
    main()
