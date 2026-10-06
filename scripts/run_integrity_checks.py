#!/usr/bin/env python3
# ============================================================================
# scripts/run_integrity_checks.py
#
# Runs every integrity check function -- one guard per incident in
# docs/incidents.md -- prints each result and exits 1 if any check failed, so
# the daily workflow goes red instead of a problem sitting unnoticed.
#
# pipeline_runs gets one row per area (integrity_football, integrity_nfl,
# integrity_tennis, integrity_intl, integrity_club_grounds) and the combined
# row model_integrity_checks. Until 6 Oct only the combined row existed, so a
# football failure that had been red for days hid any new NFL, tennis or
# international failure. An area whose function errors or returns nothing is
# recorded as failed and the other areas still run.
# ============================================================================

import os
import sys

from supabase import create_client

AREAS = [
    ("football", "check_model_integrity"),
    ("football_feeds", "check_fixture_feed_names"),  # FixtureDownload names all mapped
    ("nfl", "check_nfl_integrity"),
    ("tennis", "check_tennis_integrity"),        # results imported from Chris's PC
    ("intl", "check_intl_integrity"),
    ("club_grounds", "check_club_grounds"),      # Your Local Clubs; postcodes.io
]


def area_status(rows: list[dict]) -> str:
    if any(r["status"] == "failed" for r in rows):
        return "failed"
    if any(r["status"] == "warning" for r in rows):
        return "warning"
    return "success"


def summarise(rows: list[dict]) -> str:
    failed = [r for r in rows if r["status"] == "failed"]
    warned = [r for r in rows if r["status"] == "warning"]
    text = f"{len(rows)} integrity checks: {len(failed)} failed, {len(warned)} warning"
    if failed or warned:
        text += " -- " + ", ".join(f"{r['check_name']}={r['found']}" for r in failed + warned)
    return text


def main() -> None:
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    all_rows: list[dict] = []
    for area, fn in AREAS:
        try:
            rows = sb.rpc(fn, {}).execute().data or []
            if not rows:
                raise RuntimeError(f"{fn} returned nothing")
        except Exception as e:  # noqa: BLE001 -- one broken area must not hide the others
            rows = [{"check_name": f"{fn}_runs", "status": "failed", "found": 1, "detail": str(e)[:300]}]
        for r in rows:
            mark = {"ok": "ok  ", "warning": "WARN", "failed": "FAIL"}.get(r["status"], r["status"])
            print(f"[{area}] [{mark}] {r['check_name']}: {r['found']} -- {r['detail']}")
            if r["status"] == "failed":
                print(f"::error::{area} {r['check_name']}: {r['found']} -- {r['detail']}")
            elif r["status"] == "warning":
                print(f"::warning::{area} {r['check_name']}: {r['found']} -- {r['detail']}")
        sb.table("pipeline_runs").insert({"job_name": f"integrity_{area}", "status": area_status(rows),
                                          "summary": summarise(rows), "finished_at": "now()"}).execute()
        all_rows += rows
    summary = summarise(all_rows)
    status = area_status(all_rows)
    sb.table("pipeline_runs").insert({"job_name": "model_integrity_checks", "status": status, "summary": summary, "finished_at": "now()"}).execute()
    print(summary)
    sys.exit(1 if status == "failed" else 0)


if __name__ == "__main__":
    main()
