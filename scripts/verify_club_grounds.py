#!/usr/bin/env python3
# ============================================================================
# scripts/verify_club_grounds.py
#
# Independent check of public.club_grounds: looks every ground_postcode up on
# postcodes.io (free, open data, no key; bulk endpoint, 100 per call), stores
# the postcode's point and its distance from our pitch-centre coordinates,
# then runs check_club_grounds(). A stadium postcode sits at or beside the
# ground, so more than 1.5 km apart means one of the two is wrong.
#
# Prints a table of every ground (sorted by distance) so the run log is the
# review list; logs a pipeline_runs row (job_name verify_club_grounds) and
# exits 1 if a check failed.
#
#   python scripts/verify_club_grounds.py
# ============================================================================

import json
import math
import os
import sys
import urllib.request
from datetime import datetime, timezone

from supabase import create_client

BULK = "https://api.postcodes.io/postcodes"


def metres(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    r = math.radians
    h = math.sin((r(lat2) - r(lat1)) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin((r(lon2) - r(lon1)) / 2) ** 2
    return round(6371000 * 2 * math.asin(math.sqrt(h)))


def lookup(postcodes: list[str]) -> dict[str, tuple[float, float] | None]:
    out: dict[str, tuple[float, float] | None] = {}
    for i in range(0, len(postcodes), 100):
        body = json.dumps({"postcodes": postcodes[i : i + 100]}).encode()
        req = urllib.request.Request(BULK, data=body, headers={"Content-Type": "application/json", "User-Agent": "fixtureshark"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            for item in json.load(resp)["result"]:
                res = item["result"]
                out[item["query"]] = (res["latitude"], res["longitude"]) if res and res.get("latitude") is not None else None
    return out


def main() -> None:
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    rows = sb.table("club_grounds").select("team_id,ground_name,latitude,longitude,ground_postcode").execute().data or []
    names = {t["team_id"]: t["canonical_name"] for t in (sb.table("teams").select("team_id,canonical_name").in_("team_id", [r["team_id"] for r in rows]).execute().data or [])}
    found = lookup(sorted({r["ground_postcode"] for r in rows}))
    now = datetime.now(timezone.utc).isoformat()
    report = []
    for r in rows:
        p = found.get(r["ground_postcode"])
        d = metres(float(r["latitude"]), float(r["longitude"]), p[0], p[1]) if p else None
        sb.table("club_grounds").update({
            "postcode_latitude": p[0] if p else None,
            "postcode_longitude": p[1] if p else None,
            "postcode_distance_m": d,
            "postcode_checked_at": now,
        }).eq("team_id", r["team_id"]).execute()
        report.append((d if d is not None else 10**9, names.get(r["team_id"], r["team_id"]), r["ground_name"], r["ground_postcode"], d))
    report.sort(reverse=True)
    for _, team, ground, pc, d in report:
        flag = "NOT FOUND" if d is None else ("FAR" if d > 1500 else "ok")
        print(f"{flag:9} {str(d) + ' m' if d is not None else '-':>9}  {team} ({ground}, {pc})")
    checks = sb.rpc("check_club_grounds", {}).execute().data or []
    for c in checks:
        print(f"[{c['status']}] {c['check_name']}: {c['found']} -- {c['detail']}")
    failed = [c for c in checks if c["status"] == "failed"]
    status = "failed" if failed else "success"
    far = sum(1 for x in report if x[4] is None or x[4] > 1500)
    summary = f"{len(rows)} grounds checked against postcodes.io: {far} more than 1.5 km from their postcode or not found"
    sb.table("pipeline_runs").insert({"job_name": "verify_club_grounds", "status": status, "summary": summary, "finished_at": "now()"}).execute()
    print(summary)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
