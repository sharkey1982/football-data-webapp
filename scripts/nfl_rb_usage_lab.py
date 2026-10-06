#!/usr/bin/env python3
# ============================================================================
# scripts/nfl_rb_usage_lab.py
#
# NFL Model Lab, experiment NP2 (registered in
# supabase/migrations/20261006120000_lab_np2_register.sql before it was
# scored): a running-back projection built from usage, v the season-to-date
# average (P0) that the site shows for RBs because NP1 missed its rule there.
#
#   NP2 = (carries_hat x pts_per_carry + targets_hat x pts_per_target)
#         x (T / T_base)^a x opp^b
#   carries_hat = carry share x team carries per game
#   targets_hat = target share x team targets per game
#     shares: recency-weighted over the player's earlier games (half-life hs
#             games, last season x ws), times a role-change factor
#             (last game's snap share / the same weighted snap share)^c,
#             clipped to [0.5, 2]; no snap data -> 1
#     team volume: weighted over the team's earlier games (half-life 8,
#             last season x 0.6)
#   pts_per_carry / pts_per_target: the player's weighted rushing / receiving
#             points per carry / target (half-life 12, last season x 0.6),
#             shrunk to the league RB rate of the previous season with ke
#             pseudo-carries / pseudo-targets. Per scoring format (receptions).
#   T / T_base, opp: as NP1 (nfl_projector_lab.py), same code.
#
# Same evaluation set as NP1 for RB (top 48 RBs by P0 each week, the player
# appeared), same splits: tuning 2019-2023, validation 2024, holdout 2025 +
# 2026 weeks 1-4.
#
#   python scripts/nfl_rb_usage_lab.py --data-dir DIR                 tune + validate
#   python scripts/nfl_rb_usage_lab.py --data-dir DIR --open-holdout --params '{...}'
# ============================================================================

import argparse
import itertools
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import nfl_projector_lab as lab  # noqa: E402

NP1 = {"h": 12.0, "w": 0.6, "k": 3.0, "a": 0.5, "b": 0.5, "m": 8.0}
SNAP_URL = "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_{season}.csv"
PLAYERS_URL = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
HOLDOUT_2026_LAST_WEEK = 4  # registered: 2026 weeks 1-4

TEAM_HALF_LIFE = 8.0
EFF_HALF_LIFE = 12.0
PREV_W = 0.6
REC = {"pts": 1.0, "half": 0.5, "std": 0.0}

GRID = {
    "hs": [1.0, 2.0, 3.0, 4.0, 6.0, 12.0],
    "ws": [0.3, 1.0],
    "c": [0.0, 0.5, 1.0],
    "ke": [0.0, 20.0, 50.0, 100.0],
    "a": [0.0, 0.5, 1.0],
    "b": [0.0, 0.25, 0.5, 0.75],
}


def read(data_dir, name, url):
    path = os.path.join(data_dir, name) if data_dir else None
    if path and os.path.exists(path):
        return pd.read_csv(path, low_memory=False)
    print(f"downloading {url}", file=sys.stderr)
    return pd.read_csv(url, low_memory=False)


def load_snaps(data_dir, first, last):
    """Offensive snap share per (game_id, gsis player_id)."""
    players = read(data_dir, "players.csv", PLAYERS_URL)
    pfr = players.dropna(subset=["pfr_id", "gsis_id"]).drop_duplicates("pfr_id").set_index("pfr_id").gsis_id
    frames = []
    for s in range(max(first, 2013), last + 1):
        sc = read(data_dir, f"snap_counts_{s}.csv", SNAP_URL.format(season=s))
        sc = sc[(sc.game_type == "REG") & (sc.offense_snaps > 0)]
        frames.append(sc[["game_id", "pfr_player_id", "offense_pct"]])
    sc = pd.concat(frames, ignore_index=True)
    sc["player_id"] = sc.pfr_player_id.map(pfr)
    sc = sc.dropna(subset=["player_id"]).drop_duplicates(["game_id", "player_id"])
    return sc.rename(columns={"offense_pct": "snap_share"})[["game_id", "player_id", "snap_share"]]


def usage_columns(pw: pd.DataFrame, snaps: pd.DataFrame) -> pd.DataFrame:
    c = lambda n: pd.to_numeric(pw[n], errors="coerce").fillna(0)  # noqa: E731
    pw["carries_n"] = c("carries")
    pw["targets_n"] = c("targets")
    pw["rec_n"] = c("receptions")
    pw["rush_pts"] = c("rushing_yards") * 0.1 + c("rushing_tds") * 6 + c("rushing_2pt_conversions") * 2 - c("rushing_fumbles_lost") * 2
    pw["recv_pts_std"] = c("receiving_yards") * 0.1 + c("receiving_tds") * 6 + c("receiving_2pt_conversions") * 2 - c("receiving_fumbles_lost") * 2
    team = pw.groupby(["game_id", "team"], as_index=False)[["carries_n", "targets_n"]].sum().rename(columns={"carries_n": "team_carries", "targets_n": "team_targets"})
    pw = pw.merge(team, on=["game_id", "team"], how="left")
    pw["carry_share"] = np.where(pw.team_carries > 0, pw.carries_n / pw.team_carries, 0.0)
    pw["target_share"] = np.where(pw.team_targets > 0, pw.targets_n / pw.team_targets, 0.0)
    pw = pw.merge(snaps, on=["game_id", "player_id"], how="left")
    return pw


def build_np2(data):
    """History arrays for RB rows of NP1's data frame (same order)."""
    df = data["df"]
    rb_idx = np.flatnonzero((df.pos == "RB").to_numpy())
    rb = df.iloc[rb_idx].copy()
    rb["snap_f"] = rb.snap_share
    rb["has_snap"] = rb.snap_share.notna().astype(float)
    rb2, h, prev, valid = lab.history_matrix(None, ["season", "week"], {
        "cs": "carry_share", "ts": "target_share", "snap": "snap_f", "has_snap": "has_snap",
        "car": "carries_n", "tgt": "targets_n", "rec": "rec_n", "rush": "rush_pts", "recv": "recv_pts_std",
    }, rb, "player_id")
    assert (rb2.game_id.to_numpy() == rb.game_id.to_numpy()).all() and (rb2.player_id.to_numpy() == rb.player_id.to_numpy()).all(), "order changed"

    # Team volume per team-game, history by team.
    tg = df[["season", "week", "game_id", "team", "team_carries", "team_targets"]].drop_duplicates(["game_id", "team"])
    tg2, th, tprev, tvalid = lab.history_matrix(None, ["season", "week"], {"car": "team_carries", "tgt": "team_targets"}, tg, "team")
    ages = np.arange(lab.L)[None, :]
    tw = np.where(tvalid, 0.5 ** (ages / TEAM_HALF_LIFE) * np.where(tprev, PREV_W, 1.0), 0.0)
    with np.errstate(invalid="ignore", divide="ignore"):
        tcar = (tw * np.nan_to_num(th["car"])).sum(1) / tw.sum(1)
        ttgt = (tw * np.nan_to_num(th["tgt"])).sum(1) / tw.sum(1)
    tkey = pd.Series(np.arange(len(tg2)), index=pd.MultiIndex.from_arrays([tg2.game_id, tg2.team]))
    ti = tkey.reindex(pd.MultiIndex.from_arrays([rb.game_id, rb.team])).to_numpy().astype(int)

    # League RB rates, previous season (format-specific per target).
    lg = df[df.pos == "RB"].groupby("season")[["rush_pts", "carries_n", "recv_pts_std", "rec_n", "targets_n"]].sum()
    def lg_rate(s, num, den):
        row = lg.loc[s - 1] if (s - 1) in lg.index else lg.loc[s]
        return row[num] / row[den]
    seasons = rb.season.to_numpy()
    lg_ppc = np.array([lg_rate(s, "rush_pts", "carries_n") for s in seasons])
    lg_ppt_std = np.array([lg_rate(s, "recv_pts_std", "targets_n") for s in seasons])
    lg_rpt = np.array([lg_rate(s, "rec_n", "targets_n") for s in seasons])

    ew = np.where(valid, 0.5 ** (ages / EFF_HALF_LIFE) * np.where(prev, PREV_W, 1.0), 0.0)
    eff = {
        "rush": (ew * np.nan_to_num(h["rush"])).sum(1), "car": (ew * np.nan_to_num(h["car"])).sum(1),
        "recv": (ew * np.nan_to_num(h["recv"])).sum(1), "rec": (ew * np.nan_to_num(h["rec"])).sum(1),
        "tgt": (ew * np.nan_to_num(h["tgt"])).sum(1),
    }
    # NP1's market and opponent inputs (depend only on NP1's fixed h, w, m).
    p1 = lab.project(data, NP1, np.zeros(len(df)), "pts", parts=True)
    return {"tbase": p1["team_usual"][rb_idx], "opp": p1["opp_factor"][rb_idx], "rb_idx": rb_idx, "h": h, "prev": prev, "valid": valid, "tcar": tcar[ti], "ttgt": ttgt[ti],
            "lg_ppc": lg_ppc, "lg_ppt_std": lg_ppt_std, "lg_rpt": lg_rpt, "eff": eff}


def project_np2(data, nd, prm, field="pts", parts=False):
    """NP2 projection for the RB rows (array aligned with nd['rb_idx'])."""
    h, prev, valid = nd["h"], nd["prev"], nd["valid"]
    ages = np.arange(lab.L)[None, :]
    sw = np.where(valid, 0.5 ** (ages / prm["hs"]) * np.where(prev, prm["ws"], 1.0), 0.0)
    with np.errstate(invalid="ignore", divide="ignore"):
        den = sw.sum(1)
        cs = (sw * np.nan_to_num(h["cs"])).sum(1) / den
        ts = (sw * np.nan_to_num(h["ts"])).sum(1) / den
        snw = sw * np.nan_to_num(h["has_snap"])
        snap_avg = (snw * np.nan_to_num(h["snap"])).sum(1) / snw.sum(1)
        last = h["snap"][:, 0]
        r = (last / snap_avg) ** prm["c"]
    r = np.where(np.isfinite(r) & (h["has_snap"][:, 0] > 0), np.clip(r, 0.5, 2.0), 1.0)
    car_hat = np.nan_to_num(cs) * r * nd["tcar"]
    tgt_hat = np.nan_to_num(ts) * r * nd["ttgt"]
    e, ke = nd["eff"], prm["ke"]
    ppc = (e["rush"] + ke * nd["lg_ppc"]) / np.maximum(e["car"] + ke, 1e-9)
    ppc = np.where(e["car"] + ke > 0, ppc, nd["lg_ppc"])
    recv = e["recv"] + REC[field] * e["rec"]
    lg_ppt = nd["lg_ppt_std"] + REC[field] * nd["lg_rpt"]
    ppt = np.where(e["tgt"] + ke > 0, (recv + ke * lg_ppt) / np.maximum(e["tgt"] + ke, 1e-9), lg_ppt)
    usage = car_hat * ppc + tgt_hat * ppt
    # Market and opponent factors exactly as NP1.
    T = data["df"]["T"].to_numpy()[nd["rb_idx"]]
    tbase = nd["tbase"]
    env = np.where(np.isnan(T) | (tbase <= 0), 1.0, (T / np.maximum(tbase, 1e-9)) ** prm["a"])
    opp = nd["opp"] ** prm["b"]
    proj = usage * env * opp
    if parts:
        return {"proj": proj, "carries": car_hat, "targets": tgt_hat, "ppc": ppc, "ppt": ppt, "snap_factor": r}
    return proj


def score(data, nd, mask_full, proj_np2, proj_np1_full, field):
    df = data["df"]
    i = nd["rb_idx"]
    m = mask_full[i]
    act = df[{"pts": "ppr", "half": "half", "std": "std"}[field]].to_numpy()[i][m]
    e2 = np.abs(proj_np2[m] - act)
    e0 = np.abs(data["p0"][field][i][m] - act)
    e1 = np.abs(proj_np1_full[i][m] - act)
    cl = (df.season.astype(str) + "-" + df.week.astype(str)).to_numpy()[i][m]
    d0, t0 = lab.clustered_t(e2 - e0, cl)
    d1, t1 = lab.clustered_t(e2 - e1, cl)
    return {"n": int(m.sum()), "mae_np2": round(float(e2.mean()), 3), "mae_p0": round(float(e0.mean()), 3), "mae_np1": round(float(e1.mean()), 3),
            "diff_p0": round(float(d0), 3), "t_p0": round(float(t0), 2), "diff_np1": round(float(d1), 3), "t_np1": round(float(t1), 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir")
    ap.add_argument("--open-holdout", action="store_true")
    ap.add_argument("--params")
    ap.add_argument("--out")
    args = ap.parse_args()

    games, pw = lab.load(args.data_dir)
    pw = usage_columns(pw, load_snaps(args.data_dir, lab.FIRST, lab.LAST))
    data = lab.build(games, pw)
    nd = build_np2(data)
    df = data["df"]
    mu = lab.pos_means(data)
    print(f"RB rows {len(nd['rb_idx'])}; with snap share {df.snap_share.iloc[nd['rb_idx']].notna().mean():.1%}", file=sys.stderr)

    if args.open_holdout:
        if not args.params:
            sys.exit("--open-holdout needs --params (fixed on tuning)")
        prm = json.loads(args.params)
        hold = lab.eval_mask(data, lab.HOLDOUT) & ~((df.season == 2026) & (df.week > HOLDOUT_2026_LAST_WEEK)).to_numpy()
        res = {f: score(data, nd, hold, project_np2(data, nd, prm, f), lab.project(data, NP1, mu, f), f) for f in ("pts", "half", "std")}
        print(json.dumps(res, indent=1))
        if args.out:
            json.dump({"params": prm, "holdout": res}, open(args.out, "w"), indent=1)
        return

    tune = lab.eval_mask(data, lab.TUNING)
    val = lab.eval_mask(data, lab.VALIDATION)
    i = nd["rb_idx"]
    tm = tune[i]
    act = df.ppr.to_numpy()[i]
    best = None
    for combo in itertools.product(*GRID.values()):
        prm = dict(zip(GRID, combo))
        mae = float(np.abs(project_np2(data, nd, prm)[tm] - act[tm]).mean())
        if best is None or mae < best[0]:
            best = (mae, prm)
    prm = best[1]
    print(f"chosen on tuning: {prm} (RB PPR MAE {best[0]:.3f}); variants {int(np.prod([len(v) for v in GRID.values()]))}")
    out = {"params": prm}
    for label, mask in (("tuning", tune), ("validation", val)):
        out[label] = {f: score(data, nd, mask, project_np2(data, nd, prm, f), lab.project(data, NP1, mu, f), f) for f in ("pts", "half", "std")}
        print(label, json.dumps(out[label]))
    if args.out:
        json.dump(out, open(args.out, "w"), indent=1)


if __name__ == "__main__":
    main()
