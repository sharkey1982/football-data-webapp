#!/usr/bin/env python3
# ============================================================================
# scripts/fpl_scoring.py
#
# The FPL scoring engine in Python: the same arithmetic as the database's
# fpl_score_calc(), driven by the same rule sets (fpl_scoring_rule_sets, one
# row per season and position). Model Lab work that runs in Python (minutes
# model, expected points) scores with this, so the rules live in one place:
# fpl_scoring_rules.
#
# The database version is verified against every FPL points total held
# (fpl_scoring_regression, checked by check_model_integrity). This one is
# verified against the database version:
#
#   python scripts/fpl_scoring.py --verify    # every 2026/27 player-match
#
# Unit tests: python -m pytest scripts/test_fpl_scoring.py
# ============================================================================

import argparse
import math
import os

RULE_SET_COLUMNS = (
    "appearance_pts", "appearance_min", "full_pts", "full_min", "goal_pts", "assist_pts",
    "clean_sheet_pts", "clean_sheet_min", "save_pts", "saves_per", "conceded_pts", "conceded_per",
    "penalty_save_pts", "penalty_miss_pts", "own_goal_pts", "yellow_pts", "red_pts",
    "defcon_pts", "defcon_min",
)


def _n(v):
    return None if v is None else float(v)


def score(rs, minutes, goals=0, assists=0, clean_sheets=0, goals_conceded=0, saves=0,
          penalties_saved=0, penalties_missed=0, own_goals=0, yellow_cards=0, red_cards=0,
          bonus=0, defensive_contribution=0):
    """Points for one player in one match. rs: a row of fpl_scoring_rule_sets
    (dict). A rule the season lacks (None) scores nothing, as in SQL."""
    r = {k: _n(rs.get(k)) for k in RULE_SET_COLUMNS}

    def pts(k):
        return r[k] or 0.0

    total = 0.0
    if r["full_min"] is not None and minutes >= r["full_min"]:
        total += pts("full_pts")
    elif r["appearance_min"] is not None and minutes >= r["appearance_min"]:
        total += pts("appearance_pts")
    total += goals * pts("goal_pts") + assists * pts("assist_pts")
    if clean_sheets > 0 and r["clean_sheet_min"] is not None and minutes >= r["clean_sheet_min"]:
        total += pts("clean_sheet_pts")
    if r["saves_per"]:
        total += math.floor(saves / r["saves_per"]) * pts("save_pts")
    if r["conceded_per"]:
        total += math.floor(goals_conceded / r["conceded_per"]) * pts("conceded_pts")
    total += penalties_saved * pts("penalty_save_pts") + penalties_missed * pts("penalty_miss_pts")
    total += own_goals * pts("own_goal_pts") + yellow_cards * pts("yellow_pts") + red_cards * pts("red_pts")
    if r["defcon_min"] is not None and (defensive_contribution or 0) >= r["defcon_min"]:
        total += pts("defcon_pts")
    return int(total) + (bonus or 0)


def load_rule_sets(sb):
    """{(season_id, element_type): rule set} from fpl_scoring_rule_sets."""
    rows = sb.table("fpl_scoring_rule_sets").select("*").execute().data or []
    return {(r["season_id"], r["element_type"]): r for r in rows}


def verify(sb, season_id):
    """Every player-match of a season with full stats: Python engine v FPL's total."""
    sets = load_rule_sets(sb)
    pos = {}
    start = 0
    while True:
        page = (sb.table("fpl_players").select("fpl_player_id,element_type").eq("season_id", season_id)
                .range(start, start + 999).execute().data or [])
        pos.update({p["fpl_player_id"]: p["element_type"] for p in page})
        if len(page) < 1000:
            break
        start += 1000
    checked = bad = 0
    start = 0
    while True:
        page = (sb.table("fpl_player_gameweeks").select("fpl_player_id,minutes,total_points,source_payload")
                .eq("season_id", season_id).order("fpl_player_id").range(start, start + 999).execute().data or [])
        for w in page:
            s = (w.get("source_payload") or {}).get("stats")
            rs = sets.get((season_id, pos.get(w["fpl_player_id"])))
            if not s or rs is None:
                continue
            calc = score(rs, w["minutes"], s["goals_scored"], s["assists"], s["clean_sheets"], s["goals_conceded"],
                         s["saves"], s["penalties_saved"], s["penalties_missed"], s["own_goals"], s["yellow_cards"],
                         s["red_cards"], s["bonus"], s.get("defensive_contribution", 0))
            checked += 1
            if calc != w["total_points"]:
                bad += 1
                if bad <= 10:
                    print(f"mismatch player {w['fpl_player_id']}: engine {calc}, FPL {w['total_points']}")
        if len(page) < 1000:
            break
        start += 1000
    print(f"season {season_id}: {checked} player-matches checked, {bad} mismatches")
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--season-id", type=int, default=13)
    args = ap.parse_args()
    if args.verify:
        from supabase import create_client
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
        raise SystemExit(1 if verify(sb, args.season_id) else 0)
    ap.print_help()


if __name__ == "__main__":
    main()
