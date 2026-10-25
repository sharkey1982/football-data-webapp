"""
Model Lab experiment X1_start_model (registered 25 Oct 2026, migration
20261025280000, before any scoring): a player's chance to start, from his
playing record and the FPL flag at the deadline.

Chris, 25 Oct 2026: "we need to work on our own player position projecting".

Splits (gameweeks of 2026/27): tuning GW2-5, validation GW6 (reported, not
decisive), holdout GW7-8 (scored once, with --open-holdout).

Model: logistic regression on the features in FEATURES, L2 strength chosen on
tuning (leave-one-gameweek-out Brier), then every side's probabilities shifted
on the logit scale so they sum to 11. Predicted XI = the top goalkeeper and the
top 10 outfield players.

Benchmarks: the published model (fpl_deadline_player_horizon, pre_deadline,
GW7-8 only) and the naive "same XI as the last league game".

Adopt iff, on the holdout, over every player in the published pre-deadline
snapshot whose side played once that gameweek: X1 beats the published model on
BOTH Brier and log loss AND X1's XIs get >= 9 more starters right than the
naive last XI.

Database load: the data is read once with a few plain selects (no correlated
subqueries) into a local cache directory; everything else runs in memory.

Found while building, before scoring: FPL flag snapshots (fpl_player_snapshots)
start on 13 Sep, after the GW4 deadline. For GW2-4 the deadline flag is unknown
and is treated as "no flag" (flag_known = 0 marks those rows), and earlier
matches with no snapshot count as available.

  python scripts/lab_x1_start_model.py [--open-holdout] [--cache DIR] [--no-write]
Writes lab_scorings (experiment X1_start_model) and analysis_results
(lab_x1_start_model) unless --no-write.
"""
from __future__ import annotations

import argparse
import bisect
import csv
import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta

import numpy as np
from scipy.optimize import minimize

EXPERIMENT = "X1_start_model"
SPLITS = {"tuning": (2, 5), "validation": (6, 6), "holdout": (7, 8)}
PASS_MARGIN_STARTERS = 9
C_GRID = [0.01, 0.03, 0.1, 0.3, 1.0, 3.0]  # L2 penalty strength (lambda)
OUT_STATUSES = {"i", "s", "u", "n"}
FEATURES = [
    "started_last",        # started the side's previous league game
    "start_rate5",         # starts / available matches, last 5 side games
    "avail5",              # available matches of the last 5 (0-5) / 5
    "min_share3",          # minutes / 270 over the last 3 side games
    "chance",              # FPL chance at the deadline: 1 fit, 0 out, chance/100 if doubtful
    "out_flag",            # FPL status i/s/u/n at the deadline
    "flag_known",          # a flag snapshot exists before the deadline
    "cup_midweek",         # side played a cup/European game 2-5 days before
    "cup_x_started_last",  # interaction
    "gk",                  # goalkeeper
    "season_start_rate",   # starts / side games so far this season
]

# --------------------------------------------------------------------------- data

QUERIES = {
    "fixtures": """select fpl_fixture_id, canonical_fixture_id, fpl_event_id, kickoff_time, fpl_home_team_id, fpl_away_team_id, finished
                     from fpl_fixtures where season_id = %(s)s and fpl_event_id is not null""",
    "pg": """select fpl_player_id, fpl_event_id, fpl_fixture_id, was_home, minutes,
                    coalesce((source_payload->'stats'->>'starts')::int, 0) starts
               from fpl_player_gameweeks where season_id = %(s)s""",
    "players": "select fpl_player_id, element_type from fpl_players where season_id = %(s)s",
    "gameweeks": "select fpl_event_id, deadline_time from fpl_gameweeks where season_id = %(s)s",
    "snapshots": """select fpl_player_id, captured_at, status, chance_of_playing_next_round chance
                      from fpl_player_snapshots where season_id = %(s)s""",
    "teams": "select fpl_team_id, canonical_team_id from fpl_teams where season_id = %(s)s",
    "cups": """select home_team_id, away_team_id, kickoff_date from fixtures
                where league_id between 6 and 11 and kickoff_date between '2026-07-01' and '2027-06-30'""",
    "published": """select fpl_event_id, fixture_id, fpl_player_id, start_probability, snapshot_at
                      from fpl_deadline_player_horizon
                     where season_id = %(s)s and snapshot_kind = 'pre_deadline' and fixture_event_id = fpl_event_id""",
}


def load_data(cache: str) -> dict[str, list[dict]]:
    """Read every table once into CSV files in `cache`; later runs read the CSVs."""
    os.makedirs(cache, exist_ok=True)
    missing = [k for k in QUERIES if not os.path.exists(os.path.join(cache, f"{k}.csv"))]
    if missing:
        import psycopg
        from psycopg.rows import dict_row
        with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as con, con.cursor(row_factory=dict_row) as cur:
            cur.execute("select public.fpl_current_season_id() s")
            season = cur.fetchone()["s"]
            for k in missing:
                cur.execute(QUERIES[k], {"s": season})
                rows = cur.fetchall()
                with open(os.path.join(cache, f"{k}.csv"), "w", newline="") as fh:
                    cols = [d.name for d in cur.description]
                    w = csv.DictWriter(fh, fieldnames=cols)
                    w.writeheader()
                    for r in rows:
                        w.writerow({c: ("" if r[c] is None else r[c]) for c in cols})
                print(f"loaded {k}: {len(rows)} rows")
    out = {}
    for k in QUERIES:
        with open(os.path.join(cache, f"{k}.csv"), newline="") as fh:
            out[k] = list(csv.DictReader(fh))
    return out


def ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# ----------------------------------------------------------------------- features

def build_rows(data: dict[str, list[dict]]) -> list[dict]:
    """One row per (player, fixture) for every squad player (an FPL row exists
    for each), with point-in-time features and the actual start."""
    deadline = {int(g["fpl_event_id"]): ts(g["deadline_time"]) for g in data["gameweeks"]}
    gk = {int(p["fpl_player_id"]) for p in data["players"] if p["element_type"] == "1"}
    canon = {int(t["fpl_team_id"]): t["canonical_team_id"] for t in data["teams"]}
    fx = {}
    for f in data["fixtures"]:
        if not f["kickoff_time"]:
            continue
        fx[int(f["fpl_fixture_id"])] = {"gw": int(f["fpl_event_id"]), "ko": ts(f["kickoff_time"]),
                                        "h": int(f["fpl_home_team_id"]), "a": int(f["fpl_away_team_id"]),
                                        "canon": f["canonical_fixture_id"], "finished": f["finished"] == "True"}
    team_games: dict[int, list[int]] = defaultdict(list)  # fpl team -> fixtures by kickoff
    for fid, f in fx.items():
        team_games[f["h"]].append(fid)
        team_games[f["a"]].append(fid)
    for t in team_games:
        team_games[t].sort(key=lambda fid: fx[fid]["ko"])
    games_per_gw: dict[tuple[int, int], int] = defaultdict(int)
    for f in fx.values():
        games_per_gw[(f["h"], f["gw"])] += 1
        games_per_gw[(f["a"], f["gw"])] += 1

    pg: dict[tuple[int, int], dict] = {}
    for r in data["pg"]:
        pg[(int(r["fpl_player_id"]), int(r["fpl_fixture_id"]))] = {"min": int(r["minutes"] or 0), "st": int(r["starts"] or 0),
                                                                    "home": r["was_home"] == "True"}

    snaps: dict[int, list[tuple]] = defaultdict(list)
    for s in data["snapshots"]:
        snaps[int(s["fpl_player_id"])].append((ts(s["captured_at"]), s["status"], None if s["chance"] == "" else float(s["chance"])))
    for p in snaps:
        snaps[p].sort(key=lambda x: x[0])
    snap_keys = {p: [x[0] for x in v] for p, v in snaps.items()}

    def flag_at(pid: int, when: datetime):
        v = snaps.get(pid)
        if not v:
            return None
        i = bisect.bisect_right(snap_keys[pid], when) - 1
        return v[i] if i >= 0 else None

    cups: dict[str, list] = defaultdict(list)
    for c in data["cups"]:
        d = datetime.fromisoformat(c["kickoff_date"]).date()
        cups[c["home_team_id"]].append(d)
        cups[c["away_team_id"]].append(d)

    rows = []
    for (pid, fid), rec in pg.items():
        f = fx.get(fid)
        if f is None:
            continue
        team = f["h"] if rec["home"] else f["a"]
        dl = deadline[f["gw"]]
        past = [g for g in team_games[team] if fx[g]["ko"] < f["ko"] and fx[g]["finished"]]
        last5, last3 = past[-5:], past[-3:]
        started_last = pg.get((pid, past[-1]), {}).get("st", 0) if past else 0
        st5 = av5 = 0
        for g in last5:
            fl = flag_at(pid, deadline[fx[g]["gw"]])
            p_rec = pg.get((pid, g))
            if p_rec is None:  # not in the squad then
                continue
            available = fl is None or fl[1] not in OUT_STATUSES
            if available:
                av5 += 1
                st5 += p_rec["st"]
        min3 = sum(pg.get((pid, g), {}).get("min", 0) for g in last3)
        season_st = sum(pg.get((pid, g), {}).get("st", 0) for g in past)
        fl = flag_at(pid, dl)
        if fl is None:
            chance, out, known = 1.0, 0, 0
        else:
            status, ch = fl[1], fl[2]
            out = int(status in OUT_STATUSES)
            chance = 0.0 if out else (ch / 100.0 if status == "d" and ch is not None else (0.75 if status == "d" else 1.0))
            known = 1
        kd = f["ko"].date()
        cup = int(any(kd - timedelta(days=5) <= d <= kd - timedelta(days=2) for d in cups.get(canon.get(team, ""), [])))
        rows.append({
            "pid": pid, "fid": fid, "canon": f["canon"], "gw": f["gw"], "team": team,
            "single": games_per_gw[(team, f["gw"])] == 1, "n_past": len(past),
            "y": int(rec["st"] > 0), "is_gk": pid in gk,
            "started_last": float(started_last),
            "start_rate5": st5 / av5 if av5 else 0.0,
            "avail5": av5 / 5.0,
            "min_share3": min3 / 270.0,
            "chance": chance, "out_flag": float(out), "flag_known": float(known),
            "cup_midweek": float(cup), "cup_x_started_last": float(cup * started_last),
            "gk": float(pid in gk),
            "season_start_rate": season_st / len(past) if past else 0.0,
        })
    return rows


# -------------------------------------------------------------------------- model

def matrix(rows: list[dict], features: list[str]) -> np.ndarray:
    return np.array([[r[f] for f in features] for r in rows], dtype=float)


def fit_logistic(X: np.ndarray, y: np.ndarray, lam: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """L2-penalised logistic regression on standardised features (intercept not
    penalised). Returns (weights on standardised features incl. intercept, mean, sd)."""
    mu, sd = X.mean(0), X.std(0)
    sd[sd == 0] = 1.0
    Z = np.hstack([np.ones((len(X), 1)), (X - mu) / sd])
    n = len(y)

    def f(w):
        z = Z @ w
        ll = np.sum(np.logaddexp(0, z) - y * z) / n
        return ll + 0.5 * lam * np.sum(w[1:] ** 2) / n * 100

    def g(w):
        p = 1 / (1 + np.exp(-(Z @ w)))
        grad = Z.T @ (p - y) / n
        grad[1:] += lam * w[1:] / n * 100
        return grad

    w = minimize(f, np.zeros(Z.shape[1]), jac=g, method="L-BFGS-B").x
    return w, mu, sd


def logits(X: np.ndarray, model) -> np.ndarray:
    w, mu, sd = model
    return w[0] + ((X - mu) / sd) @ w[1:]


def normalise_to(z: np.ndarray, total: float = 11.0) -> np.ndarray:
    """Shift logits by one constant so the probabilities sum to `total` (bisection)."""
    if len(z) <= total:
        return np.full(len(z), 0.99)
    lo, hi = -30.0, 30.0
    for _ in range(80):
        mid = (lo + hi) / 2
        s = np.sum(1 / (1 + np.exp(-(z + mid))))
        lo, hi = (mid, hi) if s < total else (lo, mid)
    return 1 / (1 + np.exp(-(z + (lo + hi) / 2)))


def predict(rows: list[dict], model, features: list[str]) -> dict[tuple[int, int], float]:
    by_side: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, r in enumerate(rows):
        by_side[(r["fid"], r["team"])].append(i)
    z = logits(matrix(rows, features), model)
    out = {}
    for idx in by_side.values():
        p = normalise_to(z[idx])
        for i, pi in zip(idx, p):
            out[(rows[i]["pid"], rows[i]["fid"])] = float(pi)
    return out


def logit(p: float) -> float:
    p = min(0.999, max(0.001, p))
    return math.log(p / (1 - p))


# ------------------------------------------------------------------------ scoring

def brier_ll(pairs: list[tuple[float, int]]) -> dict:
    n = len(pairs)
    if n == 0:
        return {"n": 0, "brier": None, "log_loss": None}
    brier = sum((p - y) ** 2 for p, y in pairs) / n
    ll = -sum(y * math.log(min(0.99, max(0.01, p))) + (1 - y) * math.log(1 - min(0.99, max(0.01, p))) for p, y in pairs) / n
    return {"n": n, "brier": round(brier, 5), "log_loss": round(ll, 5)}


def pick_xi(cands: list[tuple[int, float, bool]]) -> set[int]:
    """Top goalkeeper + top 10 outfield by probability. cands = (pid, p, is_gk)."""
    gks = sorted([c for c in cands if c[2]], key=lambda c: -c[1])[:1]
    out = sorted([c for c in cands if not c[2]], key=lambda c: -c[1])[:10]
    return {c[0] for c in gks + out}


def evaluate(rows: list[dict], pred: dict, naive_xi: bool = False) -> dict:
    """Brier/log loss over rows; starters right per side (predicted XI from the rows' players)."""
    pairs = [(pred[(r["pid"], r["fid"])], r["y"]) for r in rows]
    by_side: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for r in rows:
        by_side[(r["fid"], r["team"])].append(r)
    right = 0
    for side in by_side.values():
        actual = {r["pid"] for r in side if r["y"]}
        if naive_xi:
            xi = {r["pid"] for r in side if r["started_last"] > 0}
        else:
            xi = pick_xi([(r["pid"], pred[(r["pid"], r["fid"])], r["is_gk"]) for r in side])
        right += len(xi & actual)
    return brier_ll(pairs) | {"starters_right": right, "sides": len(by_side), "of": 11 * len(by_side)}


def naive_probs(tune: list[dict]) -> tuple[float, float]:
    a = [r["y"] for r in tune if r["started_last"] > 0]
    b = [r["y"] for r in tune if r["started_last"] == 0]
    return sum(a) / len(a), sum(b) / len(b)


def paired_brier(rows: list[dict], a: dict, b: dict) -> dict:
    d = [(a[(r["pid"], r["fid"])] - r["y"]) ** 2 - (b[(r["pid"], r["fid"])] - r["y"]) ** 2 for r in rows]
    n = len(d)
    m = sum(d) / n
    se = math.sqrt(sum((x - m) ** 2 for x in d) / (n - 1) / n) if n > 1 else float("nan")
    return {"mean_diff": round(m, 5), "se": round(se, 5), "t": round(m / se, 2) if se else None}


def choose_lambda(tune: list[dict], features: list[str]) -> tuple[float, dict]:
    gws = sorted({r["gw"] for r in tune})
    scores = {}
    for lam in C_GRID:
        pairs = []
        for g in gws:
            tr = [r for r in tune if r["gw"] != g]
            te = [r for r in tune if r["gw"] == g]
            m = fit_logistic(matrix(tr, features), np.array([r["y"] for r in tr], float), lam)
            p = predict(te, m, features)
            pairs += [(p[(r["pid"], r["fid"])], r["y"]) for r in te]
        scores[lam] = brier_ll(pairs)["brier"]
    best = min(C_GRID, key=lambda l: (scores[l], -l))
    return best, scores


# --------------------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--open-holdout", action="store_true")
    ap.add_argument("--cache", default="/tmp/x1_cache")
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    data = load_data(args.cache)
    rows = [r for r in build_rows(data) if r["single"] and r["n_past"] > 0]
    splits = ["tuning", "validation"] + (["holdout"] if args.open_holdout else [])
    in_split = {s: [r for r in rows if SPLITS[s][0] <= r["gw"] <= SPLITS[s][1]] for s in SPLITS}
    for g in range(2, (8 if args.open_holdout else 6) + 1):
        starts = sum(r["y"] for r in rows if r["gw"] == g)
        sides = len({(r["fid"], r["team"]) for r in rows if r["gw"] == g})
        if starts != 11 * sides:
            sys.exit(f"GW{g}: {starts} starts for {sides} sides; line-ups incomplete, not scoring")
    print({s: len(v) for s, v in in_split.items()}, "player-fixtures")

    tune = in_split["tuning"]
    lam, lam_scores = choose_lambda(tune, FEATURES)
    print("lambda on tuning (leave-one-GW-out Brier):", lam_scores, "->", lam)
    model = fit_logistic(matrix(tune, FEATURES), np.array([r["y"] for r in tune], float), lam)
    coef = {f: round(float(w), 4) for f, w in zip(["intercept"] + FEATURES, model[0])}
    print("standardised coefficients:", coef)
    pa, pb = naive_probs(tune)
    print(f"naive: P(start | started last) {pa:.3f}, P(start | did not) {pb:.3f}")

    # Published model, latest pre-deadline snapshot per gameweek.
    pub: dict[tuple[int, str, int], tuple[str, float]] = {}
    for p in data["published"]:
        k = (int(p["fpl_event_id"]), p["fixture_id"], int(p["fpl_player_id"]))
        if p["start_probability"] == "":
            continue
        if k not in pub or p["snapshot_at"] > pub[k][0]:
            pub[k] = (p["snapshot_at"], float(p["start_probability"]))

    code_ref = os.environ.get("GITHUB_SHA", "local")
    summary = {"lambda": lam, "lambda_tuning_brier": lam_scores, "coefficients_standardised": coef,
               "naive_p": [round(pa, 4), round(pb, 4)], "splits": {}}
    scorings = []
    for split in splits:
        rs = in_split[split]
        x1 = predict(rs, model, FEATURES)
        nv = {(r["pid"], r["fid"]): (pa if r["started_last"] > 0 else pb) for r in rs}
        res = {}
        if split == "holdout":
            scored = [r for r in rs if (r["gw"], r["canon"], r["pid"]) in pub]
            cur = {(r["pid"], r["fid"]): pub[(r["gw"], r["canon"], r["pid"])][1] for r in scored}
            blend_z = {k: (logit(x1[k]) + logit(cur[k])) / 2 for k in cur}
            blend = {}
            sides = defaultdict(list)
            for r in scored:
                sides[(r["fid"], r["team"])].append((r["pid"], r["fid"]))
            for keys in sides.values():
                p = normalise_to(np.array([blend_z[k] for k in keys]))
                blend.update({k: float(v) for k, v in zip(keys, p)})
            res["published model (leaguewide_v6)"] = evaluate(scored, cur)
        else:
            scored = rs
        res["naive: same XI as last league game"] = evaluate(scored, nv, naive_xi=True)
        res["X1 (registered)"] = evaluate(scored, x1)
        if split == "holdout":
            res["blend X1 + published (information)"] = evaluate(scored, blend)
        # Feature importance: refit without each feature, Brier rise on this split.
        drop = {}
        if split != "holdout":
            for f in FEATURES:
                feats = [x for x in FEATURES if x != f]
                m2 = fit_logistic(matrix(tune, feats), np.array([r["y"] for r in tune], float), lam)
                p2 = predict(rs, m2, feats)
                drop[f] = round(brier_ll([(p2[(r["pid"], r["fid"])], r["y"]) for r in rs])["brier"] - res["X1 (registered)"]["brier"], 5)
        per_gw = {}
        for g in range(SPLITS[split][0], SPLITS[split][1] + 1):
            sg = [r for r in scored if r["gw"] == g]
            per_gw[g] = {"X1": evaluate(sg, x1), "naive": evaluate(sg, nv, naive_xi=True)}
            if split == "holdout":
                per_gw[g]["published"] = evaluate(sg, cur)
        verdict = {}
        if split == "holdout":
            x, c, n = res["X1 (registered)"], res["published model (leaguewide_v6)"], res["naive: same XI as last league game"]
            verdict = {"paired_brier_x1_minus_published": paired_brier(scored, x1, cur),
                       "beats_published_on_both": x["brier"] < c["brier"] and x["log_loss"] < c["log_loss"],
                       "starters_margin_over_naive": x["starters_right"] - n["starters_right"],
                       "rows_in_published_snapshot": len(scored), "rows_x1_universe": len(rs)}
            verdict["adopt"] = verdict["beats_published_on_both"] and verdict["starters_margin_over_naive"] >= PASS_MARGIN_STARTERS
        summary["splits"][split] = {"gws": SPLITS[split], "results": res, "per_gw": per_gw,
                                    "drop_one_feature_brier_rise": drop, **verdict}
        print(split, json.dumps(summary["splits"][split], default=str))
        for label, m in res.items():
            scorings.append({"experiment_id": EXPERIMENT, "split": split, "variant": label, "n_matches": m["n"],
                             "metrics": m | ({"lambda": lam} if label.startswith("X1") else {}) | (verdict if label.startswith("X1") else {}),
                             "code_ref": code_ref})
    if args.open_holdout:
        summary["adopt"] = summary["splits"]["holdout"]["adopt"]
        print("ADOPT" if summary["adopt"] else "DO NOT ADOPT")
    if args.no_write:
        return
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    for row in sorted(scorings, key=lambda r: r["split"] == "holdout"):
        sb.table("lab_scorings").insert(row).execute()
    sb.table("lab_experiments").update({"variants_tried": len(C_GRID), "status": "holdout_opened" if args.open_holdout else "validated"}) \
        .eq("experiment_id", EXPERIMENT).execute()
    sb.table("analysis_results").insert({"analysis_id": "lab_x1_start_model", "code_ref": code_ref, "result": summary}).execute()
    print("Saved lab_scorings and analysis_results lab_x1_start_model")


if __name__ == "__main__":
    main()
