#!/usr/bin/env python3
# ============================================================================
# scripts/refresh_fpl_projections.py
#
# Refreshes FPL player projections for a matchweek range -- moved here
# after confirming directly that the "Refresh FPL projections" button had
# never actually worked: it called refresh_fpl_projections_range()
# (looping server-side over ~100 fixtures, ~85s total) via the anon/
# authenticated roles, which have a 3s/8s statement_timeout respectively.
#
# First attempt at this fix called the same range RPC as service_role
# instead, on the theory that service_role has no statement_timeout
# override (confirmed directly via pg_roles) and would inherit the
# database's 2-minute default. That attempt still failed with the same
# 57014 "canceling statement due to statement timeout" error -- confirmed
# directly via this script's own error-annotation output. The real
# constraint turned out to be a layer above role-level config entirely:
# Supabase's PostgREST/pooler gateway enforces its own request timeout on
# every RPC-over-HTTP call regardless of which role is making it, which
# is why the earlier direct SQL testing (a different, non-PostgREST
# connection path) never hit this at all.
#
# Real fix: loop over individual fixtures from Python, calling
# refresh_fpl_projection_fixture_v6(fixture_id) once per fixture (~0.85s
# each, confirmed by timing) instead of the one big range RPC. ~100 small
# calls comfortably under any reasonable gateway timeout beats one call
# that can never fit under it, and needs no new secrets or connection
# path -- same service_role HTTP client as every other script here.
#
# Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.
# ============================================================================

import os
import sys
import time
import argparse

from supabase import create_client


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
    supabase = create_client(url, key)

    # Logged to pipeline_runs so this shows up in the app's status view --
    # requested directly ("I still don't feel clear on how I actually know
    # things have run, including fantasy updates"): this script had never
    # logged anywhere before, which is exactly why. Started here (status
    # 'running') and updated at every exit path below, success or failure,
    # so a run that never finishes still shows as genuinely stuck rather
    # than just disappearing.
    run = (
        supabase.table("pipeline_runs")
        .insert({"job_name": "refresh_fpl_projections", "status": "running"})
        .execute()
    )
    run_id = run.data[0]["run_id"]

    fixtures_resp = (
        supabase.table("fixtures")
        .select("fixture_id")
        .eq("league_id", args.league_id)
        .eq("season_id", args.season_id)
        .gte("matchweek", args.from_matchweek)
        .lte("matchweek", args.to_matchweek)
        .execute()
    )
    fixture_ids = [row["fixture_id"] for row in fixtures_resp.data]
    print(f"Refreshing {len(fixture_ids)} fixtures for GW{args.from_matchweek}-{args.to_matchweek}...")

    total_rows = 0
    for i, fixture_id in enumerate(fixture_ids):
        # Diagnostic only (::notice:: is visible via the annotations API
        # even when raw logs aren't reachable) -- added specifically to
        # find out whether a failure is a general gateway timeout hit on
        # nearly every call, or a specific slow fixture (e.g. one still
        # falling through to the expensive get_fpl_fixture_bonus_v4
        # branch because it lacks Monte Carlo coverage) pulling the
        # average up.
        print(f"::notice::[{i + 1}/{len(fixture_ids)}] Refreshing fixture {fixture_id}...")
        # Retry with backoff -- confirmed directly this call fails
        # intermittently with DIFFERENT error types across otherwise
        # identical runs (a 57014 statement-timeout one run, a pydantic
        # JSON-parse failure on a non-JSON response body the next,
        # both around the same ~4th call), which looks like transient
        # gateway/rate-limit behaviour under rapid sequential calls
        # rather than one fixable root cause -- a short pause between
        # calls plus retrying the occasional failure is the robust
        # answer to that pattern, not chasing a single deterministic
        # cause that may not exist.
        rows = None
        last_error: Exception | None = None
        for attempt in range(1, 7):
            try:
                result = supabase.rpc("refresh_fpl_projection_fixture_v6", {"p_fixture_id": fixture_id}).execute()
                rows = result.data
                last_error = None
                break
            except Exception as e:
                last_error = e
                print(f"::warning::Fixture {fixture_id}: attempt {attempt} failed ({e}), retrying...")
                time.sleep(2 * attempt)
        if last_error is not None:
            supabase.table("pipeline_runs").update(
                {"finished_at": "now()", "status": "failed", "error_message": f"Fixture {fixture_id}: {last_error}"}
            ).eq("run_id", run_id).execute()
            raise last_error
        if not isinstance(rows, int):
            msg = f"Fixture {fixture_id}: unexpected result from refresh_fpl_projection_fixture_v6: {rows!r}"
            print(f"::error::{msg}", file=sys.stderr)
            supabase.table("pipeline_runs").update(
                {"finished_at": "now()", "status": "failed", "error_message": msg}
            ).eq("run_id", run_id).execute()
            sys.exit(1)
        total_rows += rows
        time.sleep(1.0)  # eases off whatever's causing the intermittent per-call contention -- raised from 0.2s after confirming that wasn't enough headroom in a live run

    summary = f"GW{args.from_matchweek}-{args.to_matchweek}: {total_rows} projection row(s) across {len(fixture_ids)} fixture(s)"
    print(f"Refreshed {total_rows} player-fixture projection rows across {len(fixture_ids)} fixtures for GW{args.from_matchweek}-{args.to_matchweek}.")
    print(f"::notice::{summary}")

    if len(fixture_ids) > 0 and total_rows == 0:
        msg = "No rows were refreshed despite fixtures existing in range."
        print(f"::error::{msg}", file=sys.stderr)
        supabase.table("pipeline_runs").update(
            {"finished_at": "now()", "status": "failed", "error_message": msg}
        ).eq("run_id", run_id).execute()
        sys.exit(1)

    supabase.table("pipeline_runs").update(
        {"finished_at": "now()", "status": "success", "summary": summary}
    ).eq("run_id", run_id).execute()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        tb = traceback.format_exc()
        # GitHub Actions error annotation -- surfaces via the check-run
        # annotations API even when the raw log blob storage isn't
        # reachable (confirmed directly needing this for this script).
        for line in tb.splitlines():
            print(f"::error::{line}")
        raise
