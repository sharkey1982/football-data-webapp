# Liverpool centre-forward regression (GW6 v Man City, fixture 58).
#
# Frozen inputs: scripts/fixtures/lfc_gw6_depth_inputs_*.json (see their
# "how" notes). "snapshot" = the last projection run before kick-off
# (10 Oct 22:07 UTC); "live" = after the 11 Oct manual edits (Koumas and
# Chiesa set to CF, Wirtz and Barcola "also play" CF).
#
# What is proven here: the current depth chart reproduces the recorded
# failure, and the prototype validator flags it. What is NOT proven yet:
# who Liverpool actually start up front -- the line-up was not public when
# this was written. Add it to ACTUAL below once known.

import json
from pathlib import Path

import pytest

import fpl_depth_chart as dc
from lineup_role_validator import candidates_from_inputs, validate

HERE = Path(__file__).parent / "fixtures"
DANNS, KOUMAS, CHIESA, WIRTZ, BARCOLA = 382, 381, 370, 366, 627

# team_player_tactical_defaults.source_name for the outfield players (11 Oct).
SOURCES = {382: "fpl_position_fallback", 380: "fpl_position_fallback", 379: "fantasy_football_scout",
           366: "fantasy_football_scout", 368: "fantasy_football_scout", 371: "fantasy_football_scout",
           377: "fantasy_football_scout", 627: "fantasy_football_scout", 367: "bbc_screenshot",
           381: "manual", 370: "manual", 372: "manual", 358: "bbc_screenshot", 364: "bbc_screenshot",
           356: "fantasy_football_scout", 362: "fantasy_football_scout", 579: "fantasy_football_scout"}
# Positions actually started (fixture_lineup_positions, GW5 Bournemouth v Liverpool).
OBSERVED = {379: {"CF"}, 366: {"AM"}, 627: {"LW"}, 367: {"RW"}, 368: {"PIV"}, 372: {"PIV"},
            358: {"LB"}, 579: {"RB"}, 362: {"RCB"}, 356: {"LCB"}}
ACTUAL = None  # e.g. {"CF": 366} once the GW6 line-up is known


def run(name):
    d = json.loads((HERE / f"lfc_gw6_depth_inputs_{name}.json").read_text())
    dc._sim_cache.clear()
    out = dc.compute(d["rows"])
    return d, {r["fpl_player_id"]: r for r in out}, out


def test_current_model_reproduces_recorded_failure():
    d, res, _ = run("snapshot")
    rec = d["recorded_output"]
    assert res[DANNS]["start_probability"] == pytest.approx(rec["Danns"], abs=0.005)
    assert res[KOUMAS]["start_probability"] == pytest.approx(rec["Koumas"], abs=0.005)
    assert res[WIRTZ]["start_probability"] == pytest.approx(rec["Wirtz"], abs=0.005)
    assert res[BARCOLA]["start_probability"] == pytest.approx(rec["Barcola"], abs=0.005)
    assert res[DANNS]["group_shares"] == {"CF": pytest.approx(0.90)}


def test_manual_fix_moves_the_place_to_another_unproven_backup():
    _, res, _ = run("live")
    assert res[KOUMAS]["start_probability"] > 0.80          # 0 starts in 6 fit matches
    assert res[DANNS]["start_probability"] < 0.10
    assert res[WIRTZ]["group_shares"].get("CF", 0) < 0.05  # "also plays CF" never used


@pytest.mark.parametrize("name,flagged", [("snapshot", DANNS), ("live", KOUMAS)])
def test_validator_flags_the_unproven_striker(name, flagged):
    d, _, out = run(name)
    cands = candidates_from_inputs(d["rows"], SOURCES, OBSERVED)
    findings = {f.fpl_player_id: f for f in validate([r for r in out if r["team_id"] == 15], cands)}
    f = findings[flagged]
    assert f.place == "CF" and f.tier == "unsupported"
    assert any("fit matches" in r for r in f.reasons)
    assert f.alternatives and f.alternatives[0].startswith("Wirtz")


def test_validator_does_not_flag_established_starters():
    d, _, out = run("snapshot")
    cands = candidates_from_inputs(d["rows"], SOURCES, OBSERVED)
    findings = validate([r for r in out if r["team_id"] == 15], cands)
    unsupported = {f.name for f in findings if f.tier == "unsupported"}
    assert unsupported == {"Danns"}, [(f.name, f.place, f.tier, f.reasons) for f in findings]


@pytest.mark.skipif(ACTUAL is None, reason="GW6 line-up not yet known")
def test_actual_centre_forward_is_not_the_flagged_player():
    assert ACTUAL["CF"] not in (DANNS, KOUMAS)
