#!/usr/bin/env python3
# ============================================================================
# scripts/refresh_fpl_projections.py
#
# Calls refresh_fpl_projections_range(), the same RPC the "Refresh FPL
# projections" button on the Team Strength page used to call directly --
# moved here after confirming directly that button has never actually
# worked: the call takes ~85 seconds for a typical 10-gameweek range
# (~100 fixtures), but the anon/authenticated roles the frontend
# connects as have a 3s/8s statement_timeout respectively (confirmed
# directly from pg_roles), so it was always killed mid-run. Running it
# here instead, as service_role via a GitHub Actions workflow (same
# pattern already used for the bonus and final-table simulations),
# sidesteps that entirely -- service_role has no statement_timeout
# override of its own, so it falls back to the database-wide default
# (confirmed directly: 2 minutes), comfortably above the ~85s this
# actually takes.
#
# Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.
# ============================================================================

import os
import sys
import argparse

from supabase import create_client
from supabase.client import ClientOptions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-matchweek", type=int, required=True)
    parser.add_argument("--to-matchweek", type=int, required=True)
    parser.add_argument("--league-id", type=int, default=1)
    parser.add_argument("--season-id", type=int, default=13)
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment.", file=sys.stderr)
        sys.exit(1)

    # Explicit, generous client-side timeout -- the default in supabase-py's
    # underlying HTTP client is short enough that it could cut this call off
    # well before the database itself would have finished, even though the
    # database-side statement_timeout has plenty of room. 150s gives headroom
    # above both the ~85s this currently takes and the database's own 2-minute
    # default, so the client is never the limiting factor.
    supabase = create_client(url, key, options=ClientOptions(postgrest_client_timeout=150))

    result = supabase.rpc(
        "refresh_fpl_projections_range",
        {
            "p_from_matchweek": args.from_matchweek,
            "p_to_matchweek": args.to_matchweek,
            "p_season_id": args.season_id,
            "p_league_id": args.league_id,
        },
    ).execute()

    rows_updated = result.data
    print(f"Refreshed {rows_updated} player-fixture projection rows for GW{args.from_matchweek}-{args.to_matchweek}.")
    print(f"::notice::Refreshed {rows_updated} player-fixture projection rows for GW{args.from_matchweek}-{args.to_matchweek}.")

    if not isinstance(rows_updated, int) or rows_updated <= 0:
        print(f"::error::refresh_fpl_projections_range returned an unexpected result: {rows_updated!r}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
