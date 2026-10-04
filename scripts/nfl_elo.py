#!/usr/bin/env python3
# ============================================================================
# scripts/nfl_elo.py
#
# Daily NFL model predictions (after scripts/nfl_import.py in nfl-import.yml).
# The model is experiment N1's margin Elo, exactly as scored: the same code
# (lab_nfl.run_elo) with the variant chosen on tuning (K 20, home advantage
# 45, regress half-way to 1500 each season). N1 passed its display test and
# was a null result as a market signal: pages show it beside the market with
# the gap stated.
#
# Ratings walk forward through every played game since 2002; each unplayed
# game kicking off in the next 8 days gets a prediction row (APPEND-ONLY,
# nfl.model_predictions) with the market at that moment, so the site always
# shows the latest prediction made before kick-off and the line movement is
# kept. Changing the settings below means a new MODEL_VERSION and a new
# registered experiment.
# ============================================================================

import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
from lab_nfl import elo_walk, moneyline_prob, num  # noqa: E402  (the experiment's own code)

from supabase import create_client  # noqa: E402

MODEL_VERSION = "nfl_elo_v1"
K, HFA, REG = 20, 45, 0.5
HORIZON_DAYS = 8


def ratings_after(played: list[dict], next_season: int) -> dict[str, float]:
    """Ratings after the latest played game (lab_nfl.elo_walk, as scored in N1),
    regressed once more if the next game opens a new season."""
    _, r, season = elo_walk(played, K, HFA, REG)
    if season is not None and next_season != season:
        for t in list(r):
            r[t] = 1500 + (1 - REG) * (r[t] - 1500)
    return r


def main() -> None:
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    run = sb.table("pipeline_runs").insert({"job_name": "nfl_elo", "status": "running"}).execute().data[0]
    try:
        cols = ("game_id,season,week,gameday,kickoff_at,home_franchise,away_franchise,home_score,away_score,"
                "neutral_site,spread_line,total_line,home_moneyline,away_moneyline")
        games, page = [], 0
        while True:
            chunk = (sb.table("nfl_lab_games").select(cols).order("gameday").order("game_id")
                     .range(page * 1000, page * 1000 + 999).execute().data)
            games += chunk
            if len(chunk) < 1000:
                break
            page += 1
        for g in games:
            for k in ("spread_line", "total_line", "home_moneyline", "away_moneyline"):
                g[k] = num(g[k])
        played = [g for g in games if g["home_score"] is not None]
        now = datetime.now(timezone.utc)
        horizon = now + timedelta(days=HORIZON_DAYS)
        upcoming = [g for g in games if g["home_score"] is None and g["kickoff_at"]
                    and now < datetime.fromisoformat(g["kickoff_at"]) <= horizon]
        rows = []
        if upcoming:
            r = ratings_after(played, min(g["season"] for g in upcoming))
            for g in upcoming:
                h, a = g["home_franchise"], g["away_franchise"]
                edge = r[h] - r[a] + (0 if g["neutral_site"] else HFA)
                rows.append({
                    "game_id": g["game_id"], "model_version": MODEL_VERSION,
                    "home_rating": round(r[h], 2), "away_rating": round(r[a], 2), "home_edge": round(edge, 2),
                    "p_home": round(1 / (1 + 10 ** (-edge / 400)), 4), "predicted_margin": round(edge / 25, 2),
                    "market_p_home": None if moneyline_prob(g) is None else round(moneyline_prob(g), 4),
                    "spread_line": g["spread_line"], "total_line": g["total_line"],
                    "home_moneyline": g["home_moneyline"], "away_moneyline": g["away_moneyline"],
                })
        written = sb.rpc("nfl_insert_predictions", {"rows": rows}).execute().data if rows else 0
        summary = f"{MODEL_VERSION}: {len(played)} games rated; {written} predictions for {len(upcoming)} games in the next {HORIZON_DAYS} days"
        sb.table("pipeline_runs").update({"status": "success", "summary": summary, "finished_at": "now()"}).eq("run_id", run["run_id"]).execute()
        print(summary)
    except Exception as e:  # noqa: BLE001
        sb.table("pipeline_runs").update({"status": "failed", "summary": "nfl_elo failed", "error_message": str(e)[:2000],
                                          "finished_at": "now()"}).eq("run_id", run["run_id"]).execute()
        print(f"::error::{e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
