#!/usr/bin/env python3
# ============================================================================
# scripts/nfl_projections.py
#
# NFL Match Projector, daily after the NFL import. For each team's next
# regular-season game kicking off in the next 8 days, projects fantasy points
# for its players and replaces nfl.projections for those games
# (public.nfl_replace_projections, service_role only).
#
# Method per position from Model Lab experiment NP1 (docs/experiments.md,
# 5 Oct 2026), using the same code that was scored (nfl_projector_lab.project):
#   QB, WR, TE  'np1'         recency-weighted points x market team total x opponent
#   RB, K       'season_avg'  season-to-date average (NP1 did not pass for these)
# Ranges: 20th-80th percentile of actual / projected on the tuning seasons
# (about 60% of 2024 results fell inside).
#
# Who is projected: players whose latest team (nflverse players.csv, so trades
# count) plays in the window and who appeared in one of their last three
# weeks of this season (in weeks 1-2: last season too). Injury status from
# the nflverse injury report for that week, when published (from Wednesday).
#
#   python scripts/nfl_projections.py            write to the database
#   python scripts/nfl_projections.py --dry      print, write nothing
#   python scripts/nfl_projections.py --data-dir DIR --today 2026-10-08 --dry
# ============================================================================

import argparse
import datetime as dt
import json
import math
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import nfl_projector_lab as lab  # noqa: E402

PARAMS = {"h": 12.0, "w": 0.6, "k": 3.0, "a": 0.5, "b": 0.5, "m": 8.0}  # NP1, fixed on tuning
METHOD = {"QB": "np1", "WR": "np1", "TE": "np1", "RB": "season_avg", "K": "season_avg"}
# 20th / 80th percentile of actual / projected on tuning 2019-2023, by method.
RANGE = {
    "np1": {"QB": (0.599, 1.402), "WR": (0.438, 1.626), "TE": (0.375, 1.660), "RB": (0.414, 1.620), "K": (0.493, 1.397)},
    "season_avg": {"QB": (0.548, 1.317), "WR": (0.371, 1.426), "TE": (0.310, 1.474), "RB": (0.369, 1.486), "K": (0.444, 1.310)},
}
PLAYERS_URL = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
INJURIES_URL = "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.csv"
WINDOW_DAYS = 8
RECENT_WEEKS = 3
MIN_BASE = 1.0  # skip players averaging under a point (clutter)


def read(data_dir, name, url, required=True):
    path = os.path.join(data_dir, name) if data_dir else None
    if path and os.path.exists(path):
        return pd.read_csv(path, low_memory=False)
    try:
        return pd.read_csv(url, low_memory=False)
    except Exception:  # noqa: BLE001 -- a season's file appears with its first game
        if required:
            raise
        return None


def upcoming(games: pd.DataFrame, today: dt.date) -> pd.DataFrame:
    g = games[(games.game_type == "REG") & games.home_score.isna()].copy()
    g["day"] = pd.to_datetime(g.gameday).dt.date
    g = g[(g.day >= today) & (g.day <= today + dt.timedelta(days=WINDOW_DAYS))]
    rows = []
    for _, r in g.iterrows():
        rows.append({"game_id": r.game_id, "season": int(r.season), "week": int(r.week), "day": r.day, "team": r.home_team, "opp": r.away_team})
        rows.append({"game_id": r.game_id, "season": int(r.season), "week": int(r.week), "day": r.day, "team": r.away_team, "opp": r.home_team})
    t = pd.DataFrame(rows)
    if t.empty:
        return t
    # Each team's next game only (a second game in the window would see the first as history).
    return t.sort_values("day").groupby("team", as_index=False).first()


def candidates(pw: pd.DataFrame, players: pd.DataFrame, nxt: pd.DataFrame) -> pd.DataFrame:
    season = int(nxt.season.max())
    week = int(nxt.week.min())
    last = pw.sort_values(["season", "week"]).groupby("player_id").tail(1).set_index("player_id")
    latest_team = players.set_index("gsis_id").latest_team.dropna()
    team = last.team.copy()
    known = latest_team.reindex(team.index).dropna()
    team.loc[known.index] = known  # trades: players.csv knows before he plays
    recent = ((last.season == season) & (last.week >= week - RECENT_WEEKS)) | ((week <= 2) & (last.season == season - 1))
    c = pd.DataFrame({"player_id": team.index, "team": team.values, "recent": recent.values, "position": last.position.values})
    c = c[c.recent].merge(nxt[["team", "game_id", "season", "week", "opp"]], on="team")
    return c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir")
    ap.add_argument("--today", help="YYYY-MM-DD (default: today, UTC)")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    today = dt.date.fromisoformat(args.today) if args.today else dt.datetime.now(dt.timezone.utc).date()

    sb = None
    run = None
    if not args.dry:
        from supabase import create_client
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
        run = sb.table("pipeline_runs").insert({"job_name": "nfl_projections", "status": "running"}).execute().data[0]

    def finish(status, summary, error=None):
        print(summary if not error else f"::error::{error}")
        if sb:
            sb.table("pipeline_runs").update({"status": status, "summary": summary, "error_message": error,
                                              "finished_at": "now()"}).eq("run_id", run["run_id"]).execute()

    try:
        games_all = read(args.data_dir, "games.csv", lab.GAMES_URL)
        nxt = upcoming(games_all, today)
        if nxt.empty:
            finish("success", f"no regular-season games between {today} and {today + dt.timedelta(days=WINDOW_DAYS)}")
            return
        season = int(nxt.season.max())
        games, pw = lab.load(args.data_dir, season - 1, season)
        players = read(args.data_dir, "players.csv", PLAYERS_URL)
        cand = candidates(pw, players, nxt)
        pos_of = pw.sort_values(["season", "week"]).groupby("player_id").pos.last()
        cand["pos"] = cand.player_id.map(pos_of)

        # Future rows: no points yet. build() only ever looks backwards.
        fut = pd.DataFrame({
            "player_id": cand.player_id, "season": cand.season, "week": cand.week, "season_type": "REG",
            "game_id": cand.game_id, "team": cand.team, "opponent_team": cand.opp, "position": cand.position, "pos": cand.pos,
            "ppr": np.nan, "half": np.nan, "std": np.nan, "_future": True,
        })
        pw["_future"] = False
        data = lab.build(games, pd.concat([pw, fut], ignore_index=True))
        df = data["df"]
        mu = lab.pos_means(data)
        parts = {f: lab.project(data, PARAMS, mu, f, parts=True) for f in ("pts", "half", "std")}
        idx = np.flatnonzero(df["_future"].fillna(False).to_numpy(dtype=bool))

        inj = read(args.data_dir, f"injuries_{season}.csv", INJURIES_URL.format(season=season), required=False)
        injmap = {}
        if inj is not None:
            inj = inj[(inj.season == season) & (inj.game_type == "REG")]
            for _, r in inj.iterrows():
                injmap[(r.gsis_id, int(r.week))] = r

        def clean(v):
            return None if v is None or (isinstance(v, float) and math.isnan(v)) or v == "" else v

        rows = []
        for i in idx:
            r = df.iloc[i]
            pos = r.pos
            method = METHOD[pos]
            pick = (lambda f: parts[f]["proj"][i]) if method == "np1" else (lambda f: data["p0"][f][i])
            ppr, half, std = pick("pts"), pick("half"), pick("std")
            base = parts["pts"]["base"][i]
            if any(np.isnan(x) for x in (ppr, half, std)) or base < MIN_BASE:
                continue
            lo, hi = RANGE[method][pos]
            ir = injmap.get((r.player_id, int(r.week)))
            T = r["T"]
            rows.append({
                "game_id": r.game_id, "player_id": r.player_id, "season": int(r.season), "week": int(r.week),
                "team": r.team, "opponent": r.opponent_team, "position": pos, "method": method,
                "proj_ppr": round(float(ppr), 2), "proj_half": round(float(half), 2), "proj_std": round(float(std), 2),
                "low_ppr": round(float(ppr * lo), 2), "high_ppr": round(float(ppr * hi), 2),
                "base_ppr": round(float(base), 2),
                "season_avg_ppr": None if np.isnan(data["p0"]["pts"][i]) else round(float(data["p0"]["pts"][i]), 2),
                "team_implied": None if pd.isna(T) else round(float(T), 2),
                "team_usual": round(float(parts["pts"]["team_usual"][i]), 2),
                "opp_factor": round(float(parts["pts"]["opp_factor"][i]), 3),
                "games_used": int(parts["pts"]["games_used"][i]),
                "injury_status": clean(ir.report_status) if ir is not None else None,
                "injury": clean(ir.report_primary_injury) if ir is not None else None,
                "practice_status": clean(ir.practice_status) if ir is not None else None,
            })

        if sb:
            # Only players the database holds (the import loads them; a brand-new
            # player is projected from the next run).
            held = set()
            ids = sorted({r["player_id"] for r in rows})
            for i in range(0, len(ids), 200):
                held |= {x["player_id"] for x in sb.table("nfl_players").select("player_id").in_("player_id", ids[i:i + 200]).execute().data}
            rows = [r for r in rows if r["player_id"] in held]
        game_ids = sorted(nxt.game_id.unique())
        no_line = sorted(set(nxt.team) - set(r["team"] for r in rows if r["team_implied"] is not None))
        summary = (f"{len(rows)} projections, {len(game_ids)} games (season {season}, week "
                   f"{int(nxt.week.min())}{'-' + str(int(nxt.week.max())) if nxt.week.max() != nxt.week.min() else ''}); "
                   f"injury report rows {sum(1 for r in rows if r['injury_status'])}"
                   + (f"; no market line yet: {', '.join(no_line)}" if no_line else ""))
        if args.dry:
            out = pd.DataFrame(rows)
            if not out.empty:
                print(out.sort_values("proj_ppr", ascending=False).groupby("position").head(5)[
                    ["position", "player_id", "team", "opponent", "method", "proj_ppr", "low_ppr", "high_ppr", "base_ppr", "team_implied", "team_usual", "opp_factor", "injury_status"]].to_string())
            print(summary)
            return
        n = sb.rpc("nfl_replace_projections", {"p_game_ids": game_ids, "p_rows": json.loads(json.dumps(rows))}).execute().data
        if n != len(rows):
            raise RuntimeError(f"wrote {n} rows, expected {len(rows)}")
        finish("success", summary)
    except Exception as e:  # noqa: BLE001
        finish("failed", "nfl_projections failed", str(e)[:2000])
        sys.exit(1)


if __name__ == "__main__":
    main()
