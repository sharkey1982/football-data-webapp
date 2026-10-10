#!/usr/bin/env python3
# ============================================================================
# scripts/actual_lineups.py
#
# Actual Premier League starting line-ups WITH positions and formation
# (10 Oct 2026). Chris: line-ups since the start of the season would help,
# and "I don't think I should be doing manual tasks that you can automate".
#
#   --probe   check candidate sources, store what they return in
#             analysis_results ('lineup_source_probe'); save nothing.
# ============================================================================

from __future__ import annotations

import argparse
import json
import os

ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1"
UA = "FixtureShark/1.0 (personal FPL analysis)"


def probe() -> None:
    import httpx
    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    out: dict = {}
    c = httpx.Client(headers={"User-Agent": UA}, timeout=30, follow_redirects=True)

    for name, url in [("espn_api_robots", "https://site.api.espn.com/robots.txt"),
                      ("pulselive_robots", "https://footballapi.pulselive.com/robots.txt"),
                      ("sdp_robots", "https://sdp-prem-prod.premier-league-prod.pulselive.com/robots.txt")]:
        try:
            r = c.get(url)
            out[name] = {"status": r.status_code, "text": r.text[:3000]}
        except Exception as e:  # noqa: BLE001
            out[name] = {"error": str(e)}

    # ESPN: one day at a time (a date range answered 400).
    events = []
    for day in ["20260816", "20260823", "20260830", "20260913", "20260920", "20260927", "20261004"]:
        try:
            r = c.get(f"{ESPN}/scoreboard", params={"dates": day})
            for e in r.json().get("events", []):
                events.append({"id": e["id"], "name": e.get("name"), "date": e.get("date"),
                               "completed": e.get("status", {}).get("type", {}).get("completed")})
        except Exception as e:  # noqa: BLE001
            out.setdefault("espn_day_errors", []).append(f"{day}: {e}")
    out["espn_events"] = events
    done = [e for e in events if e["completed"]]
    if done:
        try:
            s = c.get(f"{ESPN}/summary", params={"event": done[0]["id"]}).json()
            rosters = s.get("rosters") or []
            out["espn_summary"] = {"event": done[0], "top_keys": list(s.keys()),
                                   "rosters": [{"team": ro.get("team", {}).get("displayName"), "formation": ro.get("formation"),
                                                "keys": list(ro.keys()),
                                                "players": [{"name": p.get("athlete", {}).get("displayName"), "starter": p.get("starter"),
                                                             "position": (p.get("position") or {}).get("abbreviation"),
                                                             "formationPlace": p.get("formationPlace"), "jersey": p.get("jersey"),
                                                             "keys": list(p.keys())} for p in (ro.get("roster") or [])[:16]]}
                                               for ro in rosters]}
        except Exception as e:  # noqa: BLE001
            out["espn_summary_error"] = str(e)

    sb.table("analysis_results").insert({"analysis_id": "lineup_source_probe", "code_ref": os.environ.get("GITHUB_SHA", "local"), "result": out}).execute()
    print(json.dumps({k: (v.get("status") if isinstance(v, dict) else v) for k, v in out.items()}))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    a = ap.parse_args()
    if a.probe:
        probe()
