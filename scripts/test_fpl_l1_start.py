import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import fpl_l1_start as l1  # noqa: E402


def _inp(pid, et, started, avail=1.0, rate=0.0, last_min=90, fid=500, team=1):
    return {"fixture_id": fid, "team_id": team, "fpl_player_id": pid, "element_type": et, "availability": avail,
            "started_last": started, "last_min": last_min, "start_rate5": rate}


def _side(fid=500):
    xi = [_inp(1, 1, 1, fid=fid)] + [_inp(10 + i, 2, 1, fid=fid) for i in range(4)] + [_inp(20 + i, 3, 1, fid=fid) for i in range(4)] \
        + [_inp(30 + i, 4, 1, fid=fid) for i in range(2)]
    bench = [_inp(2, 1, 0, fid=fid), _inp(40, 2, 0, rate=0.6, fid=fid), _inp(50, 3, 0, rate=0.2, fid=fid), _inp(60, 4, 0, rate=0.4, fid=fid)]
    return xi + bench


def test_compute_uses_the_adopted_parameters():
    out = {r["fpl_player_id"]: r["start_probability"] for r in l1.compute(_side())}
    assert out[1] == 0.98 and out[10] == 0.88
    assert abs(sum(out.values()) - 11) < 0.02


def test_injured_starter_replaced_in_position():
    rows = _side()
    rows[1]["availability"] = 0.0
    out = {r["fpl_player_id"]: r["start_probability"] for r in l1.compute(rows)}
    assert out[10] < 0.01 and out[40] > 0.8


def test_merge_replaces_only_covered_fixtures():
    depth = [{"fixture_id": 500, "fpl_player_id": 10, "start_probability": 0.5},
             {"fixture_id": 900, "fpl_player_id": 10, "start_probability": 0.6}]
    merged = l1.merge(depth, l1.compute(_side()))
    assert {r["fixture_id"] for r in merged} == {500, 900}
    assert [r["start_probability"] for r in merged if r["fixture_id"] == 900] == [0.6]
    assert len([r for r in merged if r["fixture_id"] == 500]) == 15


def test_merge_keeps_role_split_scaled():
    depth = [{"fixture_id": 500, "fpl_player_id": 10, "start_probability": 0.44, "depth_group": "RB", "depth_rank": 1,
              "group_shares": {"RB": 0.4, "LB": 0.04}}]
    m = {r["fpl_player_id"]: r for r in l1.merge(depth, l1.compute(_side()))}
    assert m[10]["depth_group"] == "RB" and m[10]["start_probability"] == 0.88
    assert m[10]["group_shares"] == {"RB": 0.8, "LB": 0.08}
