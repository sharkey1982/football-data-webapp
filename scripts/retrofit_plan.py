#!/usr/bin/env python3
# ============================================================================
# scripts/retrofit_plan.py
#
# Plans a retro-fit run (see .github/workflows/retrofit-season.yml): for each
# requested league and season, prints one line
#
#     LEAGUE SEASON_ID ABOVE BELOW DATE,DATE,...
#
# ABOVE/BELOW are the adjacent divisions ("-" if none) -- fitted at the same
# dates so teams relegated into / promoted into the league get point-in-time
# estimates. Dates run weekly from the day before the league's first match of
# that season, stopping before its last match (from the matches archive), so
# every matchweek is served by a fit dated strictly before it. --start/--end
# override the derived range (single-season use).
# ============================================================================

import argparse
import os
from datetime import date, timedelta

from supabase import create_client

PYRAMID = ["E0", "E1", "E2", "E3", "EC"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--leagues", required=True, help="Comma-separated codes, e.g. E1,E2,E3")
    ap.add_argument("--seasons", required=True, help="Comma-separated season_ids, e.g. 10,11,12")
    ap.add_argument("--step-days", type=int, default=7)
    ap.add_argument("--start", default="", help="Override first as-of date (YYYY-MM-DD)")
    ap.add_argument("--end", default="", help="Override last as-of date (YYYY-MM-DD)")
    a = ap.parse_args()

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    leagues = {r["code"]: r["league_id"] for r in sb.table("leagues").select("league_id, code").execute().data}

    for code in [c.strip() for c in a.leagues.split(",") if c.strip()]:
        i = PYRAMID.index(code)
        above = PYRAMID[i - 1] if i > 0 else "-"
        below = PYRAMID[i + 1] if i + 1 < len(PYRAMID) else "-"
        for sid in [int(s) for s in a.seasons.split(",") if s.strip()]:
            first = sb.table("matches").select("match_date").eq("league_id", leagues[code]).eq("season_id", sid) \
                .order("match_date").limit(1).execute().data
            last = sb.table("matches").select("match_date").eq("league_id", leagues[code]).eq("season_id", sid) \
                .order("match_date", desc=True).limit(1).execute().data
            if not first:
                print(f"# {code} season {sid}: no matches -- skipped")
                continue
            start = date.fromisoformat(a.start) if a.start else date.fromisoformat(first[0]["match_date"][:10]) - timedelta(days=1)
            end = date.fromisoformat(a.end) if a.end else date.fromisoformat(last[0]["match_date"][:10]) - timedelta(days=1)
            dates, d = [], start
            while d <= end and d < date.today():
                dates.append(d.isoformat())
                d += timedelta(days=a.step_days)
            print(f"{code} {sid} {above} {below} {','.join(dates)}")


if __name__ == "__main__":
    main()
