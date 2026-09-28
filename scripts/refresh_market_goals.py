#!/usr/bin/env python3
# ============================================================================
# scripts/refresh_market_goals.py
#
# Writes each scheduled English league fixture's expected goals from market
# ratings (scripts/market_ratings.py: the method that passed Model Lab F4 and
# P5) onto fixtures.market_home_goals / market_away_goals, through
# set_fixture_market_goals(). Runs at the start of the FPL projections
# pipeline, so the FPL projection (team xG, clean sheets, bonus inputs) and
# the projected final table both read the same values.
#
# A league is rated only when every team in it has at least 3 priced matches
# this season; otherwise its market goals are cleared and everything falls
# back to the Dixon-Coles prediction (fixtures.predicted_*_goals), which is
# never touched here.
#
# Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.
# ============================================================================

import os
import sys
from datetime import date, timedelta

import numpy as np
from supabase import create_client

sys.path.insert(0, os.path.dirname(__file__))
from market_ratings import WINDOW_DAYS, lines_from_rows, market_ratings  # noqa: E402

LEAGUE_IDS = [1, 2, 3, 4]
MIN_PRICED_THIS_SEASON = 3


def rate_league(sb, league_id, season_id):
    """[{fixture_id, home, away}] for the league's scheduled fixtures, or (None, reason)."""
    fixtures = (sb.table("fixtures").select("fixture_id, home_team_id, away_team_id, status")
                .eq("league_id", league_id).eq("season_id", season_id).execute().data or [])
    scheduled = [f for f in fixtures if f["status"] == "scheduled"]
    if not scheduled:
        return [], None
    teams = {f["home_team_id"] for f in fixtures} | {f["away_team_id"] for f in fixtures}
    since = (date.today() - timedelta(days=WINDOW_DAYS)).isoformat()
    rows, start = [], 0
    while True:
        page = (sb.table("market_closing_lines")
                .select("match_date, season_id, home_team_id, away_team_id, p_home, p_away, p_over")
                .eq("league_id", league_id).gte("match_date", since)
                .order("match_date").range(start, start + 999).execute().data or [])
        rows += page
        if len(page) < 1000:
            break
        start += 1000
    priced = {t: 0 for t in teams}
    for r in rows:
        if r["season_id"] == season_id:
            for t in (r["home_team_id"], r["away_team_id"]):
                if t in priced:
                    priced[t] += 1
    short = [t for t, c in priced.items() if c < MIN_PRICED_THIS_SEASON]
    if short:
        return None, f"{len(short)} team(s) with fewer than {MIN_PRICED_THIS_SEASON} priced matches this season"
    rated = market_ratings(lines_from_rows(rows), date.today())
    if rated is None:
        return None, "no priced matches in the window"
    idx, c0, hfa, att, dfn = rated
    out = []
    for f in scheduled:
        h, a = idx[f["home_team_id"]], idx[f["away_team_id"]]
        out.append({"fixture_id": f["fixture_id"],
                    "home": round(float(np.exp(c0 + hfa + att[h] - dfn[a])), 4),
                    "away": round(float(np.exp(c0 + att[a] - dfn[h])), 4)})
    return out, None


def main():
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    season_id = sb.rpc("current_season_id").execute().data
    run_id = sb.table("pipeline_runs").insert({"job_name": "refresh_market_goals", "status": "running"}).execute().data[0]["run_id"]
    notes, status = [], "success"
    try:
        for league_id in LEAGUE_IDS:
            rows, reason = rate_league(sb, league_id, season_id)
            written = sb.rpc("set_fixture_market_goals", {"p_league_id": league_id, "p_rows": rows or []}).execute().data
            if rows is None:
                notes.append(f"league {league_id}: not rated ({reason}); model used")
                print(f"::notice::League {league_id}: not rated -- {reason}")
            else:
                notes.append(f"league {league_id}: {written} fixtures")
                print(f"League {league_id}: market goals for {written} fixtures")
                if written != len(rows):
                    status = "warning"
                    notes.append(f"league {league_id}: sent {len(rows)}, wrote {written}")
    except Exception as e:
        sb.table("pipeline_runs").update({"finished_at": "now()", "status": "failed", "error_message": str(e)}).eq("run_id", run_id).execute()
        raise
    sb.table("pipeline_runs").update({"finished_at": "now()", "status": status, "summary": "; ".join(notes)}).eq("run_id", run_id).execute()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        for line in traceback.format_exc().splitlines():
            print(f"::error::{line}")
        raise
