#!/usr/bin/env python3
# ============================================================================
# scripts/refresh_exit_bands.py
#
# Writes every current-season FPL player's exit bands for his next start --
# P(off before 60), P(off at 60-84), P(85+) -- into fpl_player_exit_bands,
# from every recorded start since 2022/23 (scripts/exit_bands.py, the model
# that passed Model Lab P2). A player with no recorded start gets his
# position's shares. Runs at the start of the FPL projections pipeline; the
# projection's appearance and clean-sheet points read the table, and fall
# back to "2 points and the full-match clean sheet for every starter" for
# any player missing from it.
#
# Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.
# ============================================================================

import os
import sys
from datetime import datetime, timezone

from supabase import create_client

sys.path.insert(0, os.path.dirname(__file__))
from exit_bands import load_starts, next_start_probs, page, position_priors  # noqa: E402


def main():
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    season_id = sb.rpc("fpl_current_season_id").execute().data
    run_id = sb.table("pipeline_runs").insert({"job_name": "refresh_exit_bands", "status": "running"}).execute().data[0]["run_id"]
    try:
        starts = load_starts(sb)
        priors = position_priors(starts)
        probs = next_start_probs(starts, priors)
        seen = {}
        for s in starts:
            seen[s["code"]] = seen.get(s["code"], 0) + 1
        players = page(sb, "fpl_players", "fpl_player_id,fpl_code,element_type", [("eq", "season_id", season_id)], ["fpl_player_id"])
        rows = []
        now = datetime.now(timezone.utc).isoformat()
        for p in players:
            if not p.get("element_type") or p["element_type"] not in priors:
                continue
            pr = probs.get(p.get("fpl_code"), priors[p["element_type"]])
            rows.append({"season_id": season_id, "fpl_player_id": p["fpl_player_id"],
                         "p_off_before_60": round(float(pr[0]), 5), "p_off_60_84": round(float(pr[1]), 5), "p_full": round(float(pr[2]), 5),
                         "starts_seen": seen.get(p.get("fpl_code"), 0), "updated_at": now})
        written = 0
        for i in range(0, len(rows), 500):
            res = sb.table("fpl_player_exit_bands").upsert(rows[i:i + 500], on_conflict="season_id,fpl_player_id").execute()
            written += len(res.data or [])
        if written != len(rows):
            raise RuntimeError(f"upsert returned {written} rows, sent {len(rows)}")
        summary = f"{written} players ({sum(1 for r in rows if r['starts_seen'] > 0)} with start history; {len(starts)} starts)"
        print(summary)
        sb.table("pipeline_runs").update({"finished_at": "now()", "status": "success", "summary": summary}).eq("run_id", run_id).execute()
    except Exception as e:
        sb.table("pipeline_runs").update({"finished_at": "now()", "status": "failed", "error_message": str(e)}).eq("run_id", run_id).execute()
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        for line in traceback.format_exc().splitlines():
            print(f"::error::{line}")
        raise
