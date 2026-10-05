#!/usr/bin/env python3
# ============================================================================
# scripts/nfl_projector_lab.py
#
# NFL Model Lab, experiment NP1 (registered in
# supabase/migrations/20261005100000_lab_nfl_projector_register.sql before it
# was scored): a weekly fantasy-points projection v the player's season-to-date
# average.
#
#   P0  season-to-date mean PPR points before the week (week 1 or no game yet
#       this season: previous-season mean).
#   NP1 base x (T / T_base)^a x opp^b, where
#         base   = recency-weighted mean of the player's earlier games (this and
#                  last season; half-life h games; last season's games x w),
#                  shrunk to his position mean with k pseudo-games;
#         T      = his team's market-implied points for this game
#                  (total/2 +/- spread/2);
#         T_base = the same weighted mean of T over the games behind `base`, so
#                  a player on a usually-high-scoring team is not double counted;
#         opp    = the opponent's weighted points allowed to the position over
#                  its earlier games, shrunk to the league mean with m
#                  pseudo-games, as a ratio of the league mean.
#
# Splits: tuning 2019-2023, validation 2024, sealed holdout 2025 + 2026.
# 2018 is history only.
#
#   python scripts/nfl_projector_lab.py                 tune + validate
#   python scripts/nfl_projector_lab.py --open-holdout  score the holdout ONCE
#   python scripts/nfl_projector_lab.py --data-dir DIR  use cached CSVs
#
# Without --open-holdout the holdout seasons are never scored.
# ============================================================================

import argparse
import itertools
import json
import os
import sys

import numpy as np
import pandas as pd

TUNING = list(range(2019, 2024))
VALIDATION = [2024]
HOLDOUT = [2025, 2026]
FIRST = 2018
LAST = 2026

GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
PLAYER_WEEK_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.csv"

POSITIONS = ["QB", "RB", "WR", "TE", "K"]
TOP_N = {"QB": 24, "RB": 48, "WR": 60, "TE": 24, "K": 20}
L = 24  # earlier games kept per player / team
OPP_HALF_LIFE = 8.0  # team-games

GRID = {
    "h": [2.0, 4.0, 6.0, 8.0, 12.0, 1e9],
    "w": [0.3, 0.6, 1.0],
    "k": [0.0, 1.0, 3.0],
    "a": [0.0, 0.5, 0.75, 1.0, 1.25],
    "b": [0.0, 0.25, 0.5, 0.75, 1.0],
    "m": [4.0, 8.0, 16.0],
}


def col(df, name):
    return pd.to_numeric(df[name], errors="coerce").fillna(0) if name in df else 0


def points(df: pd.DataFrame) -> pd.DataFrame:
    """The site's scoring (nfl.points_std; +0.5 / +1 a reception)."""
    fum = col(df, "sack_fumbles_lost") + col(df, "rushing_fumbles_lost") + col(df, "receiving_fumbles_lost")
    fg039 = col(df, "fg_made_0_19") + col(df, "fg_made_20_29") + col(df, "fg_made_30_39")
    fg50 = col(df, "fg_made_50_59") + col(df, "fg_made_60_")
    std = (
        col(df, "passing_yards") * 0.04 + col(df, "passing_tds") * 4 - col(df, "passing_interceptions") * 2
        + (col(df, "rushing_yards") + col(df, "receiving_yards")) * 0.1
        + (col(df, "rushing_tds") + col(df, "receiving_tds") + col(df, "special_teams_tds")) * 6
        + (col(df, "passing_2pt_conversions") + col(df, "rushing_2pt_conversions") + col(df, "receiving_2pt_conversions")) * 2
        - fum * 2
        + fg039 * 3 + col(df, "fg_made_40_49") * 4 + fg50 * 5 - col(df, "fg_missed")
        + col(df, "pat_made") - col(df, "pat_missed")
    )
    rec = col(df, "receptions")
    df["std"] = std.round(2)
    df["half"] = (std + 0.5 * rec).round(2)
    df["ppr"] = (std + rec).round(2)
    return df


def load(data_dir: str | None, first: int | None = None, last: int | None = None):
    first = FIRST if first is None else first
    last = LAST if last is None else last
    def read(name, url):
        path = os.path.join(data_dir, name) if data_dir else None
        if path and os.path.exists(path):
            return pd.read_csv(path, low_memory=False)
        print(f"downloading {url}", file=sys.stderr)
        return pd.read_csv(url, low_memory=False)

    games = read("games.csv", GAMES_URL)
    games = games[(games.season >= first) & (games.season <= last) & (games.game_type == "REG")]
    frames = [read(f"pw_{s}.csv", PLAYER_WEEK_URL.format(season=s)) for s in range(first, last + 1)]
    pw = pd.concat(frames, ignore_index=True)
    pw = pw[pw.season_type == "REG"].copy()
    return games, prepare(pw)


def prepare(pw: pd.DataFrame) -> pd.DataFrame:
    pw["pos"] = pw.position.replace({"FB": "RB"})
    pw = pw[pw.pos.isin(POSITIONS)].copy()
    return points(pw)


def implied_totals(games: pd.DataFrame) -> pd.DataFrame:
    g = games.dropna(subset=["spread_line", "total_line"])
    home = pd.DataFrame({"game_id": g.game_id, "team": g.home_team, "opp": g.away_team, "T": g.total_line / 2 + g.spread_line / 2})
    away = pd.DataFrame({"game_id": g.game_id, "team": g.away_team, "opp": g.home_team, "T": g.total_line / 2 - g.spread_line / 2})
    return pd.concat([home, away], ignore_index=True)


def history_matrix(keys, order_cols, values: dict, df: pd.DataFrame, key_col: str):
    """For each row of df (sorted by key then time) the previous L rows of the same
    key within this and the previous season: arrays [n, L] of values, the age in
    games (1 = last game) and a previous-season flag. NaN where missing."""
    df = df.sort_values([key_col] + order_cols).reset_index(drop=True)
    n = len(df)
    out = {k: np.full((n, L), np.nan) for k in values}
    prev = np.zeros((n, L), dtype=bool)
    valid = np.zeros((n, L), dtype=bool)
    keyv = df[key_col].to_numpy()
    seas = df.season.to_numpy()
    arrs = {k: df[v].to_numpy(dtype=float) for k, v in values.items()}
    start = 0
    for i in range(n):
        if i > 0 and keyv[i] != keyv[i - 1]:
            start = i
        lo = max(start, i - L)
        for j_age, j in enumerate(range(i - 1, lo - 1, -1)):
            if seas[j] < seas[i] - 1:
                break
            valid[i, j_age] = True
            prev[i, j_age] = seas[j] < seas[i]
            for k in values:
                out[k][i, j_age] = arrs[k][j]
    return df, out, prev, valid


def build(games, pw):
    tt = implied_totals(games)
    pw = pw.merge(tt[["game_id", "team", "T"]], on=["game_id", "team"], how="left")
    match = pw["T"].notna().mean()
    print(f"implied-total join: {match:.1%} of player-weeks", file=sys.stderr)
    # Week order inside a season.
    pw = pw.sort_values(["player_id", "season", "week"]).reset_index(drop=True)
    pw["T_fill"] = pw["T"].fillna(22.0)

    # Player history.
    pw, ph, pprev, pvalid = history_matrix(None, ["season", "week"], {"pts": "ppr", "half": "half", "std": "std", "T": "T_fill"}, pw, "player_id")

    # P0: season-to-date mean, else previous-season mean.
    cur = pvalid & ~pprev
    prv = pvalid & pprev
    with np.errstate(invalid="ignore", divide="ignore"):
        p0 = {}
        for f in ("pts", "half", "std"):
            a = np.where(cur, ph[f], 0).sum(1) / cur.sum(1)
            b = np.where(prv, ph[f], 0).sum(1) / prv.sum(1)
            p0[f] = np.where(cur.sum(1) > 0, a, b)

    # Points allowed by each defence to each position, per team-game.
    allowed = pw.groupby(["season", "week", "game_id", "opponent_team", "pos"], as_index=False)[["ppr", "half", "std"]].sum()
    allowed = allowed.rename(columns={"opponent_team": "defence"})
    full = []
    for pos in POSITIONS:
        a = allowed[allowed.pos == pos]
        # team-games where the position scored nothing still count as 0.
        tg = pw[["season", "week", "game_id", "opponent_team"]].drop_duplicates().rename(columns={"opponent_team": "defence"})
        a = tg.merge(a, on=["season", "week", "game_id", "defence"], how="left")
        a["pos"] = pos
        a[["ppr", "half", "std"]] = a[["ppr", "half", "std"]].fillna(0)
        full.append(a)
    allowed = pd.concat(full, ignore_index=True)
    allowed["key"] = allowed.defence + "|" + allowed.pos
    allowed, oh, oprev, ovalid = history_matrix(None, ["season", "week"], {"ppr": "ppr"}, allowed, "key")
    # League mean allowed per position over earlier team-games (this + last season).
    allowed["lg"] = np.nan
    for pos in POSITIONS:
        sub = allowed[allowed.pos == pos].sort_values(["season", "week"])
        means = {}
        for (s, wk), _ in sub.groupby(["season", "week"]):
            win = sub[((sub.season == s) & (sub.week < wk)) | (sub.season == s - 1)]
            means[(s, wk)] = win.ppr.mean() if len(win) else np.nan
        idx = allowed.pos == pos
        allowed.loc[idx, "lg"] = [means.get((s, wk), np.nan) for s, wk in zip(allowed.loc[idx, "season"], allowed.loc[idx, "week"])]

    # Align each player-week with his opponent's defence-history row.
    akey = pd.Series(np.arange(len(allowed)), index=pd.MultiIndex.from_arrays([allowed.game_id, allowed.defence, allowed.pos]))
    ix = akey.reindex(pd.MultiIndex.from_arrays([pw.game_id, pw.opponent_team, pw.pos])).to_numpy()
    ok = ~np.isnan(ix)
    ix = np.where(ok, ix, 0).astype(int)

    data = {
        "df": pw,
        "ph": ph, "pprev": pprev, "pvalid": pvalid,
        "p0": p0,
        "opp_vals": np.where(ok[:, None], oh["ppr"][ix], np.nan),
        "opp_prev": np.where(ok[:, None], oprev[ix], False),
        "opp_valid": np.where(ok[:, None], ovalid[ix], False),
        "lg": np.where(ok, allowed.lg.to_numpy()[ix], np.nan),
    }
    return data


def eval_mask(data, seasons):
    df = data["df"]
    m = df.season.isin(seasons).to_numpy() & df["T"].notna().to_numpy() & data["pvalid"].any(1) & ~np.isnan(data["p0"]["pts"]) & ~np.isnan(data["lg"])
    # Top N at each position by P0 within the week (pre-game information only).
    rank = pd.Series(np.where(m, data["p0"]["pts"], -np.inf)).groupby([df.season, df.week, df.pos]).rank(ascending=False, method="first")
    top = df.pos.map(TOP_N).to_numpy()
    return m & (rank.to_numpy() <= top)


def pos_means(data):
    """Position mean PPR per appearance over the previous season (prior for shrinkage)."""
    df = data["df"]
    pm = df.groupby(["season", "pos"]).ppr.mean()
    return np.array([pm.get((s - 1, p), pm.get((s, p), 8.0)) for s, p in zip(df.season, df.pos)])


def project(data, prm, mu, field="pts", parts=False):
    ph, pprev, pvalid = data["ph"], data["pprev"], data["pvalid"]
    ages = np.arange(L)[None, :]
    wt = np.where(pvalid, 0.5 ** (ages / prm["h"]) * np.where(pprev, prm["w"], 1.0), 0.0)
    x = np.nan_to_num(ph[field])
    sw = wt.sum(1)
    base = ((wt * x).sum(1) + prm["k"] * mu) / (sw + prm["k"])
    tbase = (wt * np.nan_to_num(ph["T"], nan=22.0)).sum(1) / np.maximum(sw, 1e-9)
    T = data["df"]["T"].to_numpy()
    env = np.where(np.isnan(T) | (tbase <= 0), 1.0, (T / np.maximum(tbase, 1e-9)) ** prm["a"])
    ow = np.where(data["opp_valid"], 0.5 ** (ages / OPP_HALF_LIFE) * np.where(data["opp_prev"], prm["w"], 1.0), 0.0)
    lg = data["lg"]
    opp_avg = ((ow * np.nan_to_num(data["opp_vals"])).sum(1) + prm["m"] * lg) / (ow.sum(1) + prm["m"])
    opp = np.where(lg > 0, opp_avg / lg, 1.0)
    opp = np.where(np.isnan(opp) | (opp <= 0), 1.0, opp)
    proj = base * env * opp ** prm["b"]
    if parts:
        return {"proj": proj, "base": base, "team_usual": tbase, "opp_factor": opp, "games_used": pvalid.sum(1)}
    return proj


def clustered_t(d, clusters):
    n = len(d)
    dbar = d.mean()
    s = pd.Series(d - dbar).groupby(clusters).sum().to_numpy()
    se = np.sqrt((s ** 2).sum()) / n
    return dbar, (dbar / se if se > 0 else np.nan)


def score(data, mask, proj, field="pts"):
    df = data["df"]
    act = df[{"pts": "ppr", "half": "half", "std": "std"}[field]].to_numpy()
    p0 = data["p0"][field]
    rows = {}
    for pos in POSITIONS + ["ALL"]:
        m = mask & ((df.pos == pos).to_numpy() if pos != "ALL" else True)
        e1 = np.abs(proj[m] - act[m])
        e0 = np.abs(p0[m] - act[m])
        d, t = clustered_t(e1 - e0, (df.season.astype(str) + "-" + df.week.astype(str)).to_numpy()[m])
        rows[pos] = {"n": int(m.sum()), "mae_np1": round(float(e1.mean()), 3), "mae_p0": round(float(e0.mean()), 3), "diff": round(float(d), 3), "t": round(float(t), 2)}
    return rows


def show(title, rows):
    print(f"\n{title}")
    print(f"{'pos':<4} {'n':>6} {'NP1':>7} {'P0':>7} {'diff':>7} {'t':>6}")
    for p, r in rows.items():
        print(f"{p:<4} {r['n']:>6} {r['mae_np1']:>7.3f} {r['mae_p0']:>7.3f} {r['diff']:>7.3f} {r['t']:>6.2f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir")
    ap.add_argument("--open-holdout", action="store_true")
    ap.add_argument("--params", help="JSON of chosen params (required with --open-holdout)")
    ap.add_argument("--out", help="write results JSON here")
    args = ap.parse_args()

    games, pw = load(args.data_dir)
    data = build(games, pw)
    mu = pos_means(data)
    tune = eval_mask(data, TUNING)
    val = eval_mask(data, VALIDATION)
    act = data["df"].ppr.to_numpy()

    if args.open_holdout:
        if not args.params:
            sys.exit("--open-holdout needs --params (the tuned values, fixed before opening)")
        prm = json.loads(args.params)
        hold = eval_mask(data, HOLDOUT)
        res = {f: score(data, hold, project(data, prm, mu, f), f) for f in ("pts", "half", "std")}
        show("HOLDOUT (PPR)", res["pts"])
        show("holdout half-PPR", res["half"])
        show("holdout standard", res["std"])
        if args.out:
            json.dump({"params": prm, "holdout": res}, open(args.out, "w"), indent=1)
        return

    best = None
    keys = list(GRID)
    for combo in itertools.product(*GRID.values()):
        prm = dict(zip(keys, combo))
        pr = project(data, prm, mu)
        mae = float(np.abs(pr[tune] - act[tune]).mean())
        if best is None or mae < best[0]:
            best = (mae, prm)
    prm = best[1]
    print(f"chosen on tuning: {prm} (MAE {best[0]:.3f})")
    out = {"params": prm}
    for label, mask in (("tuning", tune), ("validation", val)):
        out[label] = {f: score(data, mask, project(data, prm, mu, f), f) for f in ("pts", "half", "std")}
        show(f"{label.upper()} (PPR)", out[label]["pts"])
    show("validation half-PPR", out["validation"]["half"])
    show("validation standard", out["validation"]["std"])
    if args.out:
        json.dump(out, open(args.out, "w"), indent=1)


if __name__ == "__main__":
    main()
