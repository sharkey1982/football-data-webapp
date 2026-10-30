"""
Model Lab experiment P3_defcon_count (registered 30 Oct 2026, migration
20261030150000, before any scoring): the chance of a defensive contribution
(DEFCON, 2 FPL points) from a count model with the real threshold.

The 27 Sep 2026 experiment (docs/experiments.md) found that adding tackles to
the defender CBI rate inside the current exponential curve did nothing, and
said the next step was a count model using the real threshold (this one).

Per player-match (defenders, midfielders and forwards with 1+ minute):
  count  = FPL's defensive_contribution (defenders CBI + tackles, threshold 10;
           midfielders and forwards CBI + recoveries + tackles, threshold 12)
  rate90 = (sum w_j c_j + K mu_pos) / (sum w_j m_j / 90 + K) over the player's
           earlier appearances (both seasons), c_j counted with the TARGET
           match's position definition, w_j = 0.5 ^ (days before / H)
  mean   = rate90 x minutes / 90 x exp(beta_g x (share - mean share in the
           history)), share = the team's share of the match's market expected
           goals (closing 1X2 + over/under 2.5, independent Poisson)
  count ~ negative binomial (size phi_pos), P(DEFCON | m) = P(count >= T)
  P(DEFCON) = average over a minutes distribution: the player's last 10
           appearances plus 2 pseudo-appearances from the position's tuning
           minutes (conditional on playing: the scored population is 1+ minute)
Tuned on tuning only: K in K_GRID, H in H_GRID (25 variants, by tuning DEFCON
log loss); phi_pos (3) and beta_g (defenders; midfielders + forwards) by
maximum likelihood of the counts given actual minutes. Everything then frozen.

Benchmarks (same minutes inputs for all three):
  production  the live formula (fpl_defensive_contribution_projection_leaguewide):
              start x base x exp(0.28 (shrunk90 - prior90)) x min(1, xmins/60),
              cap 0.9, season-to-date events (defenders CBI only), with start
              and xmins from the same minutes distribution as P3
  naive       season-to-date hit rate shrunk to the position mean,
              (hits + k p_pos) / (apps + k), k in NAIVE_K chosen on tuning

Splits: tuning 2025/26 GW1-25, validation 2025/26 GW26-38 (reported, not
decisive), holdout 2026/27 GW1-8 (scored once, with --open-holdout).

Pass iff on the holdout (every outfield player-match with 1+ minute):
P3 beats the production formula on BOTH Brier and log loss AND
|mean predicted - actual| <= 0.02 for P3. Defenders reported separately.

Data: 2025/26 per-fixture FPL history from vaastav/Fantasy-Premier-League
(merged_gw.csv, players_raw.csv, teams.csv; read from GitHub), 2026/27 from
fpl_player_gameweeks.source_payload->'stats', closing lines from
market_closing_lines (Premier League, both seasons). Read once into a local
cache (a few plain selects); everything else runs in memory.

  python scripts/lab_p3_defcon.py [--open-holdout] [--cache DIR] [--no-write] [--check-data]
--check-data builds the rows and prints data checks only (no model, no
scores). Writes lab_scorings (P3_defcon_count) and analysis_results
(lab_p3_defcon) unless --no-write.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta

import numpy as np
from scipy.optimize import least_squares, minimize
from scipy.special import gammaln
from scipy.stats import nbinom, poisson

EXPERIMENT = "P3_defcon_count"
TUNE_SEASON, HOLD_SEASON = "2025", "2026"
SPLITS = {"tuning": (TUNE_SEASON, 1, 25), "validation": (TUNE_SEASON, 26, 38), "holdout": (HOLD_SEASON, 1, 8)}
K_GRID = [1, 3, 6, 10, 20]           # prior strength, in 90-minute matches
H_GRID = [60, 120, 240, 480, None]   # recency half-life in days (None: no decay)
NAIVE_K = [1, 2, 5, 10, 20]
N_MIN_HIST, MIN_PSEUDO = 10, 2.0     # minutes distribution: last 10 appearances + 2 pseudo
THRESH = {2: 10, 3: 12, 4: 12}
CAL_TOL = 0.02
CLIP = 1e-4
# Production constants (live view, 30 Oct 2026).
PROD = {2: (7.143, 0.255), 3: (7.107, 0.125), 4: (3.681, 0.01)}  # prior90, base rate
PROD_SLOPE, PROD_K_MIN, PROD_CAP = 0.28, 450.0, 0.9
VAASTAV = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2025-26/"
VAASTAV_FILES = ["gws/merged_gw.csv", "players_raw.csv", "teams.csv"]
NAME_ALIAS = {"Spurs": "Tottenham", "Man Utd": "Man United"}  # vaastav -> canonical
POS = {"DEF": 2, "MID": 3, "FWD": 4, "GK": 1}

QUERIES = {
    "pg": """select g.fpl_player_id, g.fpl_event_id, g.fpl_fixture_id, g.was_home, g.minutes, g.kickoff_time,
                    coalesce((g.source_payload->'stats'->>'starts')::int, 0) starts,
                    (g.source_payload->'stats'->>'clearances_blocks_interceptions')::int cbi,
                    (g.source_payload->'stats'->>'tackles')::int tackles,
                    (g.source_payload->'stats'->>'recoveries')::int recoveries,
                    (g.source_payload->'stats'->>'defensive_contribution')::int dc
               from fpl_player_gameweeks g where g.season_id = %(s)s and g.minutes > 0""",
    "players": "select fpl_player_id, element_type, fpl_code, web_name from fpl_players where season_id = %(s)s",
    "fixtures": """select fpl_fixture_id, canonical_fixture_id, fpl_event_id, kickoff_time, fpl_home_team_id, fpl_away_team_id, finished
                     from fpl_fixtures where season_id = %(s)s and fpl_event_id is not null""",
    "teams": "select fpl_team_id, canonical_team_id from fpl_teams where season_id = %(s)s",
    "lines": """select season_id, home_team_id, away_team_id, match_date, p_home, p_draw, p_away, p_over
                  from market_closing_lines where league_id = 1 and season_id in (%(s)s - 1, %(s)s)""",
    "canon": """select team_id, canonical_name from teams
                 where team_id in (select home_team_id from market_closing_lines where league_id = 1 and season_id = %(s)s - 1)""",
    "published": """select fpl_event_id, fixture_id, fpl_player_id, defensive_contribution_probability p, snapshot_at
                      from fpl_projection_snapshots
                     where season_id = %(s)s and snapshot_kind = 'pre_deadline' and model_version = 'leaguewide_v6'""",
}


# --------------------------------------------------------------------------- data

def load_data(cache: str) -> dict:
    os.makedirs(cache, exist_ok=True)
    for f in VAASTAV_FILES:
        path = os.path.join(cache, "vaastav_" + f.replace("/", "_"))
        if not os.path.exists(path):
            urllib.request.urlretrieve(VAASTAV + f, path)
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
                cols = [d.name for d in cur.description]
                with open(os.path.join(cache, f"{k}.csv"), "w", newline="") as fh:
                    w = csv.DictWriter(fh, fieldnames=cols)
                    w.writeheader()
                    for r in rows:
                        w.writerow({c: ("" if r[c] is None else r[c]) for c in cols})
                print(f"loaded {k}: {len(rows)} rows")
    out = {}
    for k in QUERIES:
        with open(os.path.join(cache, f"{k}.csv"), newline="") as fh:
            out[k] = list(csv.DictReader(fh))
    sha = {}
    for f in VAASTAV_FILES:
        path = os.path.join(cache, "vaastav_" + f.replace("/", "_"))
        with open(path, "rb") as fh:
            sha[f] = hashlib.sha256(fh.read()).hexdigest()[:16]
        with open(path, newline="", encoding="utf-8") as fh:
            out["v_" + f.split("/")[-1].split(".")[0]] = list(csv.DictReader(fh))
    out["sha"] = sha
    return out


def ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def market_lambdas(p_home: float, p_draw: float, p_away: float, p_over: float) -> tuple[float, float]:
    """Independent-Poisson expected goals matching 1X2 and over 2.5."""
    tot = p_home + p_draw + p_away
    ph, pa = p_home / tot, p_away / tot
    g = np.arange(11)

    def res(z):
        lh, la = np.exp(z)
        a, b = poisson.pmf(g, lh), poisson.pmf(g, la)
        m = np.outer(a, b)
        return [np.tril(m, -1).sum() - ph, np.triu(m, 1).sum() - pa,
                1 - sum(m[i, j] for i in range(3) for j in range(3 - i)) - p_over]
    z = least_squares(res, x0=[math.log(1.4), math.log(1.2)]).x
    return float(math.exp(z[0])), float(math.exp(z[1]))


def build_rows(data: dict) -> tuple[list[dict], dict]:
    """One row per outfield-or-GK appearance (1+ minute), both seasons."""
    checks: dict = {}
    # Market share of expected goals per (season, home canonical, away canonical).
    share: dict[tuple[str, str, str], float] = {}
    for ln in data["lines"]:
        if "" in (ln["p_home"], ln["p_draw"], ln["p_away"], ln["p_over"]):
            continue
        lh, la = market_lambdas(float(ln["p_home"]), float(ln["p_draw"]), float(ln["p_away"]), float(ln["p_over"]))
        season = TUNE_SEASON if ln["season_id"] == str(min(int(x["season_id"]) for x in data["lines"])) else HOLD_SEASON
        share[(season, ln["home_team_id"], ln["away_team_id"])] = lh / (lh + la)
    checks["market_lines"] = len(share)

    rows: list[dict] = []
    # ---- 2025/26 (vaastav)
    code_of = {p["id"]: p["code"] for p in data["v_players_raw"]}
    canon_by_name = {c["canonical_name"]: c["team_id"] for c in data["canon"]}
    vteam = {}
    for t in data["v_teams"]:
        nm = NAME_ALIAS.get(t["name"], t["name"])
        vteam[t["id"]] = canon_by_name.get(nm)
    vname = {t["name"]: t["id"] for t in data["v_teams"]}
    checks["vaastav_teams_unmapped"] = [t for t, c in vteam.items() if c is None]
    seen = set()
    dups = mism = nomkt = 0
    for r in data["v_merged_gw"]:
        if int(r["minutes"]) < 1:
            continue
        key = (r["element"], r["fixture"])
        if key in seen:
            dups += 1
            continue
        seen.add(key)
        pos = POS[r["position"]]
        own, opp = vteam.get(vname.get(r["team"])), vteam.get(r["opponent_team"])
        home = r["was_home"] == "True"
        hk, ak = (own, opp) if home else (opp, own)
        sh = share.get((TUNE_SEASON, hk, ak))
        if sh is None:
            nomkt += 1
        elif not home:
            sh = 1 - sh
        row = {"season": TUNE_SEASON, "gw": int(r["round"]), "ko": ts(r["kickoff_time"]), "fid": "v" + r["fixture"],
               "pid": int(r["element"]), "code": code_of.get(r["element"]), "pos": pos, "min": int(r["minutes"]),
               "start": int(r["starts"]), "cbi": int(r["clearances_blocks_interceptions"]), "tck": int(r["tackles"]),
               "rec": int(r["recoveries"]), "dc": int(r["defensive_contribution"]), "share": sh, "name": r["name"]}
        if pos != 1 and row["dc"] != count_for(row, pos):
            mism += 1
        rows.append(row)
    checks["vaastav_dup_rows_dropped"] = dups
    checks["vaastav_dc_mismatch_outfield"] = mism
    checks["vaastav_no_market"] = nomkt

    # ---- 2026/27 (database)
    canon = {t["fpl_team_id"]: t["canonical_team_id"] for t in data["teams"]}
    fx = {f["fpl_fixture_id"]: f for f in data["fixtures"]}
    pl = {p["fpl_player_id"]: p for p in data["players"]}
    mism = nomkt = nolink = 0
    for r in data["pg"]:
        f = fx.get(r["fpl_fixture_id"])
        p = pl.get(r["fpl_player_id"])
        if f is None or p is None:
            nolink += 1
            continue
        pos = int(p["element_type"])
        home = r["was_home"] == "True"
        sh = share.get((HOLD_SEASON, canon.get(f["fpl_home_team_id"]), canon.get(f["fpl_away_team_id"])))
        if sh is None:
            nomkt += 1
        elif not home:
            sh = 1 - sh
        row = {"season": HOLD_SEASON, "gw": int(r["fpl_event_id"]), "ko": ts(f["kickoff_time"]), "fid": "f" + r["fpl_fixture_id"],
               "canon_fid": f["canonical_fixture_id"], "pid": int(r["fpl_player_id"]), "code": p["fpl_code"] or None, "pos": pos,
               "min": int(r["minutes"]), "start": int(r["starts"]), "cbi": int(r["cbi"]), "tck": int(r["tackles"]),
               "rec": int(r["recoveries"]), "dc": int(r["dc"]), "share": sh, "name": p["web_name"]}
        if pos != 1 and row["dc"] != count_for(row, pos):
            mism += 1
        rows.append(row)
    checks["db_dc_mismatch_outfield"] = mism
    checks["db_no_market"] = nomkt
    checks["db_rows_unlinked"] = nolink
    codes25 = {r["code"] for r in rows if r["season"] == TUNE_SEASON}
    hold = [r for r in rows if r["season"] == HOLD_SEASON and r["pos"] != 1]
    checks["holdout_rows_with_2025_history_code"] = sum(1 for r in hold if r["code"] in codes25)
    checks["rows"] = {s: sum(1 for r in rows if r["season"] == s and r["pos"] != 1) for s in (TUNE_SEASON, HOLD_SEASON)}
    for r in rows:
        if r["code"] is None:
            r["code"] = f"{r['season']}-{r['pid']}"
    rows.sort(key=lambda r: r["ko"])
    return rows, checks


def count_for(r: dict, pos: int) -> int:
    return r["cbi"] + r["tck"] + (0 if pos == 2 else r["rec"])


def in_split(r: dict, split: str) -> bool:
    s, a, b = SPLITS[split]
    return r["season"] == s and a <= r["gw"] <= b and r["pos"] != 1


# --------------------------------------------------------------------- features

def attach_history(rows: list[dict]) -> None:
    """For each row, the indices of the player's earlier appearances (strictly before kick-off)."""
    by_code: dict[str, list[int]] = defaultdict(list)
    for i, r in enumerate(rows):
        prev = [j for j in by_code[r["code"]] if rows[j]["ko"] < r["ko"]]
        r["hist"] = prev
        by_code[r["code"]].append(i)


def position_priors(rows: list[dict]) -> dict:
    """Position means from tuning rows only: count per 90, hit rate, minutes pool, start share."""
    pri = {}
    tune = [r for r in rows if in_split(r, "tuning")]
    for pos in (2, 3, 4):
        rs = [r for r in tune if r["pos"] == pos]
        c = sum(r["dc"] for r in rs)
        m = sum(r["min"] for r in rs)
        vals, freq = np.unique([r["min"] for r in rs], return_counts=True)
        pri[pos] = {"mu90": c / m * 90, "hit": sum(r["dc"] >= THRESH[pos] for r in rs) / len(rs),
                    "pool_min": vals.astype(float), "pool_w": freq / freq.sum(),
                    "pool_start": sum(r["start"] for r in rs) / len(rs), "n": len(rs)}
    return pri


def minutes_mixture(rows: list[dict], r: dict, pri: dict) -> tuple[np.ndarray, np.ndarray, float]:
    """(minute values, weights, start share) conditional on appearing."""
    own = r["hist"][-N_MIN_HIST:]
    p = pri[r["pos"]]
    vals = np.concatenate([np.array([rows[j]["min"] for j in own], float), p["pool_min"]])
    w = np.concatenate([np.ones(len(own)), MIN_PSEUDO * p["pool_w"]])
    w = w / w.sum()
    start = (sum(rows[j]["start"] for j in own) + MIN_PSEUDO * p["pool_start"]) / (len(own) + MIN_PSEUDO)
    return vals, w, start


def rate_and_share(rows: list[dict], r: dict, K: float, H: float | None, pri: dict) -> tuple[float, float]:
    h = r["hist"]
    pos = r["pos"]
    mu = pri[pos]["mu90"]
    if not h:
        return mu, 0.5
    days = np.array([(r["ko"] - rows[j]["ko"]).total_seconds() / 86400 for j in h])
    w = np.ones(len(h)) if H is None else 0.5 ** (days / H)
    c = np.array([count_for(rows[j], pos) for j in h], float)
    m = np.array([rows[j]["min"] for j in h], float)
    rate = (np.sum(w * c) + K * mu) / (np.sum(w * m) / 90 + K)
    sh = np.array([rows[j]["share"] if rows[j]["share"] is not None else np.nan for j in h])
    ok = ~np.isnan(sh)
    wm = w[ok] * m[ok]
    sbar = float(np.sum(wm * sh[ok]) / np.sum(wm)) if wm.sum() > 0 else 0.5
    return float(rate), sbar


def nb_sf(T: int, mean: np.ndarray, phi: float) -> np.ndarray:
    """P(count >= T) for a negative binomial with this mean and size phi."""
    mean = np.maximum(mean, 1e-9)
    return nbinom.sf(T - 1, phi, phi / (phi + mean))


def nb_loglik(y: np.ndarray, mean: np.ndarray, phi: float) -> float:
    mean = np.maximum(mean, 1e-9)
    return float(np.sum(gammaln(y + phi) - gammaln(phi) - gammaln(y + 1) + phi * np.log(phi / (phi + mean))
                        + y * np.log(mean / (phi + mean))))


GROUP = {2: 0, 3: 1, 4: 1}  # beta groups: defenders; midfielders + forwards


def features(rows: list[dict], rs: list[dict], K: float, H: float | None, pri: dict) -> dict:
    out = {"rate": np.zeros(len(rs)), "dx": np.zeros(len(rs))}
    for i, r in enumerate(rs):
        rate, sbar = rate_and_share(rows, r, K, H, pri)
        out["rate"][i] = rate
        out["dx"][i] = 0.0 if r["share"] is None else r["share"] - sbar
    out["pos"] = np.array([r["pos"] for r in rs])
    out["min"] = np.array([r["min"] for r in rs], float)
    out["y"] = np.array([r["dc"] for r in rs], float)
    out["hit"] = np.array([float(r["dc"] >= THRESH[r["pos"]]) for r in rs])
    return out


def fit_nb(F: dict) -> dict:
    """phi per position and beta per group, by maximum likelihood of the counts given actual minutes."""
    g = np.array([GROUP[p] for p in F["pos"]])
    pidx = F["pos"] - 2

    def nll(th):
        phi = np.exp(th[:3])[pidx]
        beta = th[3:5][g]
        mean = F["rate"] * F["min"] / 90 * np.exp(beta * F["dx"])
        mean = np.maximum(mean, 1e-9)
        y = F["y"]
        return -float(np.sum(gammaln(y + phi) - gammaln(phi) + phi * np.log(phi / (phi + mean)) + y * np.log(mean / (phi + mean))))
    th = minimize(nll, x0=[math.log(5)] * 3 + [0.0, 0.0], method="L-BFGS-B",
                  bounds=[(math.log(0.2), math.log(500))] * 3 + [(-10, 10)] * 2).x
    return {"phi": {2: float(math.exp(th[0])), 3: float(math.exp(th[1])), 4: float(math.exp(th[2]))},
            "beta": {0: float(th[3]), 1: float(th[4])}}


def predict_p3(rows: list[dict], rs: list[dict], F: dict, par: dict, pri: dict) -> np.ndarray:
    out = np.zeros(len(rs))
    for i, r in enumerate(rs):
        vals, w, _ = minutes_mixture(rows, r, pri)
        mult = math.exp(par["beta"][GROUP[r["pos"]]] * F["dx"][i])
        out[i] = float(np.sum(w * nb_sf(THRESH[r["pos"]], F["rate"][i] * vals / 90 * mult, par["phi"][r["pos"]])))
    return out


def predict_production(rows: list[dict], rs: list[dict], pri: dict) -> np.ndarray:
    out = np.zeros(len(rs))
    for i, r in enumerate(rs):
        pos = r["pos"]
        prior90, base = PROD[pos]
        season = [rows[j] for j in r["hist"] if rows[j]["season"] == r["season"]]
        ev = sum(x["cbi"] if pos == 2 else x["cbi"] + x["rec"] + x["tck"] for x in season)
        mins = sum(x["min"] for x in season)
        shrunk = (ev + prior90 * 5) / (mins + PROD_K_MIN) * 90
        vals, w, start = minutes_mixture(rows, r, pri)
        xmins = float(np.sum(w * vals))
        out[i] = min(PROD_CAP, max(0.0, start * base * math.exp(PROD_SLOPE * (shrunk - prior90)) * min(1.0, xmins / 60)))
    return out


def predict_naive(rows: list[dict], rs: list[dict], k: float, pri: dict) -> np.ndarray:
    out = np.zeros(len(rs))
    for i, r in enumerate(rs):
        pos = r["pos"]
        season = [rows[j] for j in r["hist"] if rows[j]["season"] == r["season"]]
        hits = sum(count_for(x, pos) >= THRESH[pos] for x in season)
        out[i] = (hits + k * pri[pos]["hit"]) / (len(season) + k)
    return out


# ---------------------------------------------------------------------- scoring

def score(p: np.ndarray, y: np.ndarray) -> dict:
    n = len(y)
    if n == 0:
        return {"n": 0}
    pc = np.clip(p, CLIP, 1 - CLIP)
    return {"n": int(n), "brier": round(float(np.mean((p - y) ** 2)), 5),
            "log_loss": round(float(-np.mean(y * np.log(pc) + (1 - y) * np.log(1 - pc))), 5),
            "mean_pred": round(float(p.mean()), 4), "actual": round(float(y.mean()), 4)}


def score_by_pos(p: np.ndarray, y: np.ndarray, pos: np.ndarray) -> dict:
    out = {"all": score(p, y)}
    for k, v in (("defenders", 2), ("midfielders", 3), ("forwards", 4)):
        out[k] = score(p[pos == v], y[pos == v])
    return out


def paired(a: np.ndarray, b: np.ndarray, y: np.ndarray, cluster: list[str]) -> dict:
    """Mean of (a - y)^2 - (b - y)^2 and log loss difference, SE clustered by fixture."""
    out = {}
    ac, bc = np.clip(a, CLIP, 1 - CLIP), np.clip(b, CLIP, 1 - CLIP)
    ll = lambda q: -(y * np.log(q) + (1 - y) * np.log(1 - q))  # noqa: E731
    for name, d in (("brier", (a - y) ** 2 - (b - y) ** 2), ("log_loss", ll(ac) - ll(bc))):
        m = float(d.mean())
        g: dict[str, float] = defaultdict(float)
        for v, c in zip(d - m, cluster):
            g[c] += v
        G = len(g)
        se = math.sqrt(sum(x * x for x in g.values()) * G / (G - 1)) / len(d) if G > 1 else float("nan")
        out[name] = {"mean_diff": round(m, 5), "se": round(se, 5), "t": round(m / se, 2) if se else None}
    return out


def reliability(p: np.ndarray, y: np.ndarray) -> list:
    edges = [0, 0.05, 0.1, 0.2, 0.3, 0.5, 1.01]
    out = []
    for a, b in zip(edges[:-1], edges[1:]):
        m = (p >= a) & (p < b)
        if m.sum():
            out.append({"bin": f"{a}-{min(b, 1)}", "n": int(m.sum()), "mean_pred": round(float(p[m].mean()), 3),
                        "actual": round(float(y[m].mean()), 3)})
    return out


def tune(rows: list[dict], pri: dict) -> tuple[dict, dict]:
    tr = [r for r in rows if in_split(r, "tuning")]
    grid = {}
    best = None
    for K in K_GRID:
        for H in H_GRID:
            F = features(rows, tr, K, H, pri)
            par = fit_nb(F)
            p = predict_p3(rows, tr, F, par, pri)
            s = score(p, F["hit"])
            key = f"K{K}_H{H or 'inf'}"
            grid[key] = {"log_loss": s["log_loss"], "brier": s["brier"], "mean_pred": s["mean_pred"],
                         "phi": {k: round(v, 3) for k, v in par["phi"].items()},
                         "beta": {k: round(v, 3) for k, v in par["beta"].items()}}
            print(key, grid[key], flush=True)
            if best is None or s["log_loss"] < best[0]:
                best = (s["log_loss"], {"K": K, "H": H, **par})
    return best[1], grid


def tune_naive(rows: list[dict], pri: dict) -> tuple[float, dict]:
    tr = [r for r in rows if in_split(r, "tuning")]
    y = np.array([float(r["dc"] >= THRESH[r["pos"]]) for r in tr])
    res = {k: score(predict_naive(rows, tr, k, pri), y)["log_loss"] for k in NAIVE_K}
    return min(res, key=res.get), res


def illustrate(rows: list[dict], codes: dict[str, str], par: dict, pri: dict) -> dict:
    """Next-match probabilities from all data to date, neutral game state (share = history mean),
    for named players: P3 v the production formula with the same minutes inputs."""
    out = {}
    nxt = max(r["ko"] for r in rows) + timedelta(days=7)
    for name, code in codes.items():
        mine = [i for i, r in enumerate(rows) if r["code"] == code]
        if not mine:
            continue
        last = rows[mine[-1]]
        fake = dict(last)
        fake.update({"ko": nxt, "hist": mine, "share": None, "season": HOLD_SEASON})
        F = features(rows, [fake], par["K"], par["H"], pri)
        p3 = float(predict_p3(rows, [fake], F, par, pri)[0])
        prod = float(predict_production(rows, [fake], pri)[0])
        season = [rows[j] for j in mine if rows[j]["season"] == HOLD_SEASON]
        out[name] = {"pos": last["pos"], "rate90_p3": round(float(F["rate"][0]), 2),
                     "season_hits": f"{sum(count_for(x, last['pos']) >= THRESH[last['pos']] for x in season)} of {len(season)}",
                     "p3": round(p3, 3), "production_formula_same_minutes": round(prod, 3)}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--open-holdout", action="store_true")
    ap.add_argument("--cache", default="/tmp/p3_cache")
    ap.add_argument("--no-write", action="store_true")
    ap.add_argument("--check-data", action="store_true")
    args = ap.parse_args()

    data = load_data(args.cache)
    rows, checks = build_rows(data)
    checks["vaastav_sha256_16"] = data["sha"]
    print("data checks:", json.dumps(checks, default=str), flush=True)
    for k in ("vaastav_dc_mismatch_outfield", "db_dc_mismatch_outfield"):
        if checks[k]:
            sys.exit(f"{k} = {checks[k]}: the count definition does not match FPL's; not scoring")
    if checks["vaastav_teams_unmapped"]:
        sys.exit(f"unmapped vaastav teams {checks['vaastav_teams_unmapped']}")
    gws = {g for r in rows if r["season"] == HOLD_SEASON for g in [r["gw"]]}
    if args.open_holdout and not set(range(1, 9)) <= gws:
        sys.exit("2026/27 GW1-8 incomplete; not scoring")
    attach_history(rows)
    pri = position_priors(rows)
    print("position priors (tuning):", {p: {"mu90": round(v["mu90"], 3), "hit": round(v["hit"], 4), "n": v["n"],
                                           "start": round(v["pool_start"], 3)} for p, v in pri.items()})
    print("split sizes:", {s: sum(1 for r in rows if in_split(r, s)) for s in SPLITS})
    if args.check_data:
        return

    par, grid = tune(rows, pri)
    k_naive, naive_grid = tune_naive(rows, pri)
    print("chosen:", par, "naive k:", k_naive, naive_grid, flush=True)
    code_ref = os.environ.get("GITHUB_SHA", "local")
    summary = {"chosen": {"K": par["K"], "H": par["H"], "phi": par["phi"], "beta": par["beta"]}, "tuning_grid": grid,
               "naive_k": k_naive, "naive_grid": naive_grid, "data_checks": checks,
               "position_priors": {p: {"mu90": v["mu90"], "hit": v["hit"]} for p, v in pri.items()}, "splits": {}}
    scorings = []
    splits = ["tuning", "validation"] + (["holdout"] if args.open_holdout else [])
    pub = {}
    for p in data["published"]:
        if p["p"] == "":
            continue
        k = (int(p["fpl_event_id"]), p["fixture_id"], int(p["fpl_player_id"]))
        if k not in pub or p["snapshot_at"] > pub[k][0]:
            pub[k] = (p["snapshot_at"], float(p["p"]))
    for split in splits:
        rs = [r for r in rows if in_split(r, split)]
        F = features(rows, rs, par["K"], par["H"], pri)
        y, pos = F["hit"], F["pos"]
        preds = {"P3 (registered)": predict_p3(rows, rs, F, par, pri),
                 "production formula": predict_production(rows, rs, pri),
                 "naive season hit rate": predict_naive(rows, rs, k_naive, pri)}
        res = {k: score_by_pos(v, y, pos) for k, v in preds.items()}
        cl = [r["fid"] for r in rs]
        vs = {"P3_minus_production": paired(preds["P3 (registered)"], preds["production formula"], y, cl),
              "P3_minus_naive": paired(preds["P3 (registered)"], preds["naive season hit rate"], y, cl)}
        dm = pos == 2
        vs["defenders_P3_minus_production"] = paired(preds["P3 (registered)"][dm], preds["production formula"][dm], y[dm],
                                                     [c for c, d in zip(cl, dm) if d])
        rel = {k: reliability(v, y) for k, v in preds.items() if k != "naive season hit rate"}
        verdict = {}
        info = {}
        if split == "holdout":
            p3, pr = res["P3 (registered)"]["all"], res["production formula"]["all"]
            verdict = {"beats_production_brier": p3["brier"] < pr["brier"], "beats_production_log_loss": p3["log_loss"] < pr["log_loss"],
                       "calibration_gap": round(abs(p3["mean_pred"] - p3["actual"]), 4)}
            verdict["calibrated"] = verdict["calibration_gap"] <= CAL_TOL
            verdict["pass"] = verdict["beats_production_brier"] and verdict["beats_production_log_loss"] and verdict["calibrated"]
            # For information: the published pre-deadline value (unconditional on playing) on GW6-8 rows.
            idx = [i for i, r in enumerate(rs) if (r["gw"], r.get("canon_fid"), r["pid"]) in pub]
            if idx:
                ii = np.array(idx)
                pubp = np.array([pub[(rs[i]["gw"], rs[i]["canon_fid"], rs[i]["pid"])][1] for i in idx])
                info["published_leaguewide_v6_gw6_8"] = {"published": score(pubp, y[ii]),
                                                         "P3": score(preds["P3 (registered)"][ii], y[ii]),
                                                         "production formula (same minutes)": score(preds["production formula"][ii], y[ii])}
            per_gw = {}
            for g in range(1, 9):
                m = np.array([r["gw"] == g for r in rs])
                per_gw[g] = {k: score(v[m], y[m]) for k, v in preds.items()}
            info["per_gw"] = per_gw
        summary["splits"][split] = {"split": SPLITS[split], "results": res, "paired": vs, "reliability": rel, **verdict, **info}
        print(split, json.dumps(summary["splits"][split], default=str), flush=True)
        for label, m in res.items():
            metrics = dict(m)
            if label.startswith("P3"):
                metrics.update({"K": par["K"], "H": par["H"], "paired": vs, **verdict})
            if label.startswith("naive"):
                metrics["k"] = k_naive
            scorings.append({"experiment_id": EXPERIMENT, "split": split, "variant": label, "n_matches": m["all"]["n"],
                             "metrics": metrics, "code_ref": code_ref})
    if args.open_holdout:
        summary["pass"] = summary["splits"]["holdout"]["pass"]
        codes = {}
        for r in rows:
            if r["season"] == HOLD_SEASON and r["pid"] in (566, 60, 61):
                codes[f"{r['name']} ({r['pid']})"] = r["code"]
        summary["illustration_next_match_neutral_state"] = illustrate(rows, codes, par, pri)
        print("illustration:", json.dumps(summary["illustration_next_match_neutral_state"]))
        print("PASS" if summary["pass"] else "FAIL")
    if args.no_write:
        return
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    for row in sorted(scorings, key=lambda r: r["split"] == "holdout"):
        sb.table("lab_scorings").insert(json.loads(json.dumps(row, default=str))).execute()
    sb.table("lab_experiments").update({"variants_tried": len(K_GRID) * len(H_GRID),
                                        "status": "holdout_opened" if args.open_holdout else "validated"}) \
        .eq("experiment_id", EXPERIMENT).execute()
    sb.table("analysis_results").insert({"analysis_id": "lab_p3_defcon", "code_ref": code_ref,
                                         "result": json.loads(json.dumps(summary, default=str))}).execute()
    print("Saved lab_scorings and analysis_results lab_p3_defcon")


if __name__ == "__main__":
    main()
