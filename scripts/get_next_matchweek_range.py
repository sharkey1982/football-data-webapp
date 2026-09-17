#!/usr/bin/env python3
# ============================================================================
# scripts/get_next_matchweek_range.py
#
# Computes "the next N unplayed gameweeks" for the scheduled FPL
# projections pipeline (refresh -> bonus -> refresh -> final table),
# which needs a from/to matchweek range but -- unlike the existing
# workflows this replaces the schedule for -- has no human typing one in
# each run. Same logic the (now removed) broken pg_cron job used for
# finding "the next matchweek", generalised to a configurable width
# rather than hardcoded to exactly two.
#
# Writes from_matchweek/to_matchweek to $GITHUB_OUTPUT so the workflow's
# later steps can reference them as job outputs.
#
# Usage: python scripts/get_next_matchweek_range.py --weeks 3
# ============================================================================

import argparse
import datetime
import os
import sys

from supabase import create_client


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weeks", type=int, default=3, help="How many upcoming gameweeks to cover")
    parser.add_argument("--league-code", default="E0")
    parser.add_argument("--season-id", type=int, default=13)
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.", file=sys.stderr)
        sys.exit(1)

    supabase = create_client(url, key)

    league = supabase.table("leagues").select("league_id").eq("code", args.league_code).single().execute()
    league_id = league.data["league_id"]

    fixtures = (
        supabase.table("fixtures")
        .select("matchweek")
        .eq("league_id", league_id)
        .eq("season_id", args.season_id)
        .neq("status", "played")
        .not_.is_("matchweek", "null")
        .gte("kickoff_date", datetime.date.today().isoformat())
        .order("matchweek", desc=False)
        .limit(1)
        .execute()
    )
    if not fixtures.data:
        print("No unplayed fixtures with a matchweek found -- nothing to project.", file=sys.stderr)
        sys.exit(1)

    from_matchweek = fixtures.data[0]["matchweek"]
    to_matchweek = from_matchweek + args.weeks - 1

    print(f"Next {args.weeks} gameweek(s): {from_matchweek}-{to_matchweek}")

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a") as f:
            f.write(f"from_matchweek={from_matchweek}\n")
            f.write(f"to_matchweek={to_matchweek}\n")


if __name__ == "__main__":
    main()
