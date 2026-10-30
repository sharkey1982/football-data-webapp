"""
Builds the 2025/26 rows of public.fpl_defcon_history_2025_26 (one row per FPL
player code) for the production DEFCON model (Model Lab P3, switched on
30 Oct 2026). 2025/26 per-fixture defensive stats are not in the database, so
they come from the same source and code the experiment used:
vaastav/Fantasy-Premier-League 2025-26 (merged_gw.csv, players_raw.csv,
teams.csv) and scripts/lab_p3_defcon.build_rows(), with each match's market
goal share from its Premier League closing line (market_lambdas()).

Per code, over every appearance with 1+ minute (any position, as in P3):
appearances, minutes, CBI, tackles, recoveries, and the minutes (and minutes
x team goal share) of the appearances with a closing line. The current
season is added on top in the database by refresh_fpl_defcon_rates().

  python scripts/build_defcon_seed_2025_26.py --cache DIR --lines FILE --canon FILE > rows.sql

--lines: the 2025/26 Premier League closing lines as
"home_team_id,away_team_id,p_home,p_draw,p_away,p_over" separated by ";"
(select string_agg(concat_ws(',', home_team_id, away_team_id, round(p_home,6),
round(p_draw,6), round(p_away,6), round(p_over,6)), ';') from
market_closing_lines where league_id = 1 and season_id = 12).
--canon: CSV team_id,canonical_name of those teams. --cache holds the vaastav
files (downloaded if missing), named as lab_p3_defcon.load_data() names them.
The 30 Oct 2026 run used vaastav files with sha256 prefixes merged_gw
0d09f1f1cb1b5520, players_raw 412ce0172016f8f9, teams b29df099cb0ad254 (the
same files P3 was scored on).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import os
import sys
import urllib.request
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from lab_p3_defcon import TUNE_SEASON, VAASTAV, VAASTAV_FILES, build_rows  # noqa: E402


def load(cache: str, lines_path: str, canon_path: str) -> dict:
    os.makedirs(cache, exist_ok=True)
    data: dict = {"pg": [], "players": [], "fixtures": [], "teams": [], "sha": {}}
    for f in VAASTAV_FILES:
        path = os.path.join(cache, "vaastav_" + f.replace("/", "_"))
        if not os.path.exists(path):
            urllib.request.urlretrieve(VAASTAV + f, path)
        with open(path, "rb") as fh:
            data["sha"][f] = hashlib.sha256(fh.read()).hexdigest()[:16]
        with open(path, newline="", encoding="utf-8") as fh:
            data["v_" + f.split("/")[-1].split(".")[0]] = list(csv.DictReader(fh))
    with open(lines_path) as fh:
        raw = [x.split(",") for x in fh.read().strip().split(";") if x]
    data["lines"] = [{"season_id": "12", "home_team_id": h, "away_team_id": a, "p_home": ph, "p_draw": pd,
                      "p_away": pa, "p_over": po} for h, a, ph, pd, pa, po in raw]
    with open(canon_path, newline="") as fh:
        data["canon"] = list(csv.DictReader(fh))
    return data


def aggregate(rows: list[dict]) -> dict:
    agg: dict = defaultdict(lambda: {"apps": 0, "min": 0, "cbi": 0, "tck": 0, "rec": 0, "sh_min": 0, "sh_sum": 0.0})
    for r in rows:
        if r["season"] != TUNE_SEASON:
            continue
        a = agg[r["code"]]
        a["apps"] += 1
        a["min"] += r["min"]
        a["cbi"] += r["cbi"]
        a["tck"] += r["tck"]
        a["rec"] += r["rec"]
        if r["share"] is not None:
            a["sh_min"] += r["min"]
            a["sh_sum"] += r["min"] * r["share"]
    return agg


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--lines", required=True)
    ap.add_argument("--canon", required=True)
    args = ap.parse_args()
    data = load(args.cache, args.lines, args.canon)
    rows, checks = build_rows(data)
    print(f"-- checks: {checks}; vaastav sha256/16 {data['sha']}", file=sys.stderr)
    if checks["vaastav_dc_mismatch_outfield"] or checks["vaastav_teams_unmapped"] or checks["vaastav_no_market"]:
        sys.exit(f"data checks failed: {checks}")
    agg = aggregate(rows)
    vals = []
    for code in sorted(agg, key=int):
        a = agg[code]
        vals.append(f"({int(code)},{a['apps']},{a['min']},{a['cbi']},{a['tck']},{a['rec']},{a['sh_min']},{a['sh_sum']:.4f})")
    print("insert into public.fpl_defcon_history_2025_26 (fpl_code, appearances, minutes, cbi, tackles, recoveries, share_minutes, share_sum) values")
    print(",\n".join(vals))
    print("on conflict (fpl_code) do nothing;")
    print(f"-- {len(vals)} players, {sum(a['apps'] for a in agg.values())} appearances", file=sys.stderr)


if __name__ == "__main__":
    main()
