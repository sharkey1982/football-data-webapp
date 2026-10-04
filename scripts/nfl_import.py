#!/usr/bin/env python3
# ============================================================================
# scripts/nfl_import.py
#
# Daily NFL load (workflow nfl-import.yml), kept separate from the football
# imports so a failure here never touches them.
#
# Source: nflverse (github.com/nflverse/nfldata)
#   games.csv  every game since 1999: schedule, scores, closing lines
#   teams.csv  each team code's full name per season
# Loads seasons from FIRST_SEASON (2002, the current 8-division alignment)
# through public.nfl_upsert_team_seasons / public.nfl_upsert_games, which
# write the unexposed nfl schema. Every write is an upsert on game_id, and a
# file can never blank a score already held.
#
# After loading, it reconciles against the file it just read: game count,
# scored-game count and total points per season must match nfl.games via
# public.nfl_games exactly. Any difference fails the run. One pipeline_runs
# row (job_name nfl_import) per run.
#
#   python scripts/nfl_import.py              all seasons from 2002
#   python scripts/nfl_import.py --seasons 2026
# ============================================================================

import argparse
import csv
import io
import os
import sys
import urllib.request
from collections import defaultdict

from supabase import create_client

GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
TEAMS_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/teams.csv"
FIRST_SEASON = 2002
BATCH = 500
USER_AGENT = "Mozilla/5.0 (compatible; fixtureshark-nfl-importer/1.0)"


def fetch_csv(url: str) -> list[dict]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        return list(csv.DictReader(io.StringIO(r.read().decode("utf-8"))))


def num(v: str):
    v = (v or "").strip()
    if v in ("", "NA"):
        return None
    f = float(v)
    return int(f) if f.is_integer() else f


def game_row(g: dict) -> dict:
    return {
        "game_id": g["game_id"],
        "season": int(g["season"]),
        "game_type": g["game_type"],
        "week": int(g["week"]),
        "gameday": g["gameday"],
        "gametime": (g.get("gametime") or "").strip() or None,
        "away_code": g["away_team"],
        "home_code": g["home_team"],
        "away_score": num(g["away_score"]),
        "home_score": num(g["home_score"]),
        "overtime": None if num(g["overtime"]) is None else num(g["overtime"]) == 1,
        "neutral_site": g["location"] == "Neutral",
        "div_game": num(g["div_game"]) == 1,
        "spread_line": num(g["spread_line"]),
        "total_line": num(g["total_line"]),
        "away_moneyline": num(g["away_moneyline"]),
        "home_moneyline": num(g["home_moneyline"]),
        "roof": g.get("roof") or None,
        "surface": (g.get("surface") or "").strip() or None,
        "stadium": g.get("stadium") or None,
        "away_qb_name": g.get("away_qb_name") or None,
        "home_qb_name": g.get("home_qb_name") or None,
        "away_coach": g.get("away_coach") or None,
        "home_coach": g.get("home_coach") or None,
    }


def season_totals(rows) -> dict:
    """(games, scored games, total points) per season."""
    out = defaultdict(lambda: [0, 0, 0])
    for r in rows:
        t = out[int(r["season"])]
        t[0] += 1
        if r["home_score"] is not None:
            t[1] += 1
            t[2] += r["home_score"] + r["away_score"]
    return {k: tuple(v) for k, v in out.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", default="", help="comma-separated seasons; default all from 2002")
    args = ap.parse_args()
    wanted = {int(s) for s in args.seasons.split(",") if s.strip()}

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    run = sb.table("pipeline_runs").insert({"job_name": "nfl_import", "status": "running"}).execute().data[0]

    def finish(status: str, summary: str, error: str | None = None) -> None:
        sb.table("pipeline_runs").update({"status": status, "summary": summary, "error_message": error,
                                          "finished_at": "now()"}).eq("run_id", run["run_id"]).execute()
        print(summary if not error else f"::error::{error}")

    try:
        keep = lambda s: int(s) >= FIRST_SEASON and (not wanted or int(s) in wanted)

        teams = [{"season": int(t["season"]), "code": t["team"], "full_name": t["full"]}
                 for t in fetch_csv(TEAMS_URL) if keep(t["season"])]
        sb.rpc("nfl_upsert_team_seasons", {"rows": teams}).execute()

        source = [g for g in fetch_csv(GAMES_URL) if keep(g["season"])]
        ids = [g["game_id"] for g in source]
        if len(ids) != len(set(ids)):
            raise RuntimeError("duplicate game_id in games.csv")
        rows = [game_row(g) for g in source]
        written = 0
        for i in range(0, len(rows), BATCH):
            written += sb.rpc("nfl_upsert_games", {"rows": rows[i:i + BATCH]}).execute().data or 0

        # Reconcile against what was just read.
        expected = season_totals(rows)
        held = []
        for season in sorted(expected):
            page = 0
            while True:
                chunk = (sb.table("nfl_games").select("season,home_score,away_score")
                         .eq("season", season).range(page * 1000, page * 1000 + 999).execute().data)
                held += chunk
                if len(chunk) < 1000:
                    break
                page += 1
        actual = season_totals(held)
        diffs = [f"{s}: file {expected[s]} v db {actual.get(s)}" for s in sorted(expected) if actual.get(s) != expected[s]]
        if diffs:
            raise RuntimeError("reconciliation failed (games, scored, points) -- " + "; ".join(diffs))

        latest = max(expected)
        g, scored, _ = expected[latest]
        finish("success", f"{len(rows)} games ({min(expected)}-{latest}), {written} written; "
                          f"{latest}: {scored}/{g} scored; reconciled per season")
    except Exception as e:  # noqa: BLE001 -- record any failure, then fail the job
        finish("failed", "nfl_import failed", str(e)[:2000])
        sys.exit(1)


if __name__ == "__main__":
    main()
