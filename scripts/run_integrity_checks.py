#!/usr/bin/env python3
# ============================================================================
# scripts/run_integrity_checks.py
#
# Runs public.check_model_integrity(), check_nfl_integrity(), check_tennis_integrity() and check_club_grounds() --
# one guard per incident in
# docs/incidents.md -- prints each result, logs a pipeline_runs row
# (success / warning / failed) and exits 1 if any check failed, so the daily
# workflow goes red instead of a problem sitting unnoticed.
# ============================================================================

import os
import sys

from supabase import create_client


def main() -> None:
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    rows = sb.rpc("check_model_integrity", {}).execute().data or []
    if not rows:
        print("::error::check_model_integrity returned nothing")
        sys.exit(1)
    # NFL checks live in their own function so football's stays untouched.
    nfl = sb.rpc("check_nfl_integrity", {}).execute().data or []
    if not nfl:
        print("::error::check_nfl_integrity returned nothing")
        sys.exit(1)
    rows += nfl
    # Tennis (results imported from Chris's PC; see scripts/tennis_import.py).
    tennis = sb.rpc("check_tennis_integrity", {}).execute().data or []
    if not tennis:
        print("::error::check_tennis_integrity returned nothing")
        sys.exit(1)
    rows += tennis
    # Club grounds (Your Local Clubs; checked against postcodes.io).
    grounds = sb.rpc("check_club_grounds", {}).execute().data or []
    if not grounds:
        print("::error::check_club_grounds returned nothing")
        sys.exit(1)
    rows += grounds
    for r in rows:
        mark = {"ok": "ok  ", "warning": "WARN", "failed": "FAIL"}.get(r["status"], r["status"])
        print(f"[{mark}] {r['check_name']}: {r['found']} -- {r['detail']}")
        if r["status"] == "failed":
            print(f"::error::{r['check_name']}: {r['found']} -- {r['detail']}")
        elif r["status"] == "warning":
            print(f"::warning::{r['check_name']}: {r['found']} -- {r['detail']}")
    failed = [r for r in rows if r["status"] == "failed"]
    warned = [r for r in rows if r["status"] == "warning"]
    status = "failed" if failed else "warning" if warned else "success"
    summary = f"{len(rows)} integrity checks: {len(failed)} failed, {len(warned)} warning" + (
        " -- " + ", ".join(f"{r['check_name']}={r['found']}" for r in failed + warned) if failed or warned else "")
    sb.table("pipeline_runs").insert({"job_name": "model_integrity_checks", "status": status, "summary": summary, "finished_at": "now()"}).execute()
    print(summary)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
