#!/usr/bin/env python3
# ============================================================================
# scripts/fpl_l1_start.py
#
# Production start chances from Model Lab L1 (adopted 24 Nov 2026; Chris:
# "starting with previous team sheets and identifying most likely players to
# be replaced"). Each side's last league XI keeps its places at 88% (keepers
# 98%), less each player's availability for the fixture and 30% off anyone
# taken off before 60 minutes without a flag; the places that opens go to
# the rest of the squad in the same position by recent start rate. Holdout
# GW11: Brier 0.0955 v the pecking-order model's 0.1151, 178 starters right
# of 220 v 169.
#
# The model itself is the registered lab code (scripts/lab_l1_last_xi.py,
# predict_l1), with the parameters chosen on tuning; inputs come from
# public.get_fpl_l1_inputs() (the next five gameweeks). Availability is the
# fixture's own (return dates included) where the lab used FPL's chance at
# the deadline. refresh_fpl_projections.py writes these over the
# pecking-order chances for the same fixtures.
# ============================================================================
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lab_l1_last_xi import predict_l1  # noqa: E402

PARAMS = {"r": 0.88, "r_gk": 0.98, "e": 0.7, "c": 1.0, "a": 0.15}
GAMEWEEKS = 5
INPUT_SQL = f"select * from public.get_fpl_l1_inputs({GAMEWEEKS})"
POS = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}


def compute(inputs: list[dict]) -> list[dict]:
    """inputs: rows of get_fpl_l1_inputs(). Returns rows for fpl_replace_depth_start."""
    rows = []
    for r in inputs:
        rows.append({
            "pid": int(r["fpl_player_id"]), "fid": int(r["fixture_id"]), "team": int(r["team_id"]),
            "pos": POS.get(int(r["element_type"] or 3), "MID"),
            "started_last": float(r["started_last"] or 0),
            "last_min": int(r["last_min"] or 0),
            "start_rate5": float(r["start_rate5"] or 0),
            "chance": max(0.0, min(1.0, float(r["availability"] if r["availability"] is not None else 1.0))),
            "cup_midweek": 0.0,   # tuned factor c = 1.0: no effect
        })
    pred = predict_l1(rows, PARAMS)
    return [{"fixture_id": r["fid"], "team_id": r["team"], "fpl_player_id": r["pid"],
             "start_probability": round(pred[(r["pid"], r["fid"])], 4),
             "depth_group": "l1_" + r["pos"].lower(), "depth_rank": 1 if r["started_last"] > 0 else 2, "group_shares": None}
            for r in rows]


def merge(depth_rows: list[dict], l1_rows: list[dict]) -> list[dict]:
    """L1 for the fixtures it covers; the pecking order for every other fixture.
    Where the pecking order had the player, his role group, rank and split
    between roles (group_shares, used for the predicted XI's positions) are
    kept, the split scaled to L1's chance."""
    covered = {r["fixture_id"] for r in l1_rows}
    old = {(r["fixture_id"], r["fpl_player_id"]): r for r in depth_rows if r["fixture_id"] in covered}
    out = [r for r in depth_rows if r["fixture_id"] not in covered]
    for r in l1_rows:
        d = old.get((r["fixture_id"], r["fpl_player_id"]))
        if d is not None:
            p_old = float(d.get("start_probability") or 0)
            shares = d.get("group_shares") or {}
            scaled = {g: round(float(v) * r["start_probability"] / p_old, 4) for g, v in shares.items()} if p_old > 0 and shares else None
            r = {**r, "depth_group": d.get("depth_group") or r["depth_group"], "depth_rank": d.get("depth_rank") or r["depth_rank"],
                 "group_shares": scaled if scaled else ({d.get("depth_group"): r["start_probability"]} if d.get("depth_group") else None)}
        out.append(r)
    return out
