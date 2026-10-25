import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import lab_x1_start_model as x1  # noqa: E402


def test_normalise_sums_to_eleven():
    z = np.linspace(-4, 4, 25)
    p = x1.normalise_to(z)
    assert abs(p.sum() - 11) < 1e-6
    assert np.all(np.diff(p) > 0)  # order kept


def test_pick_xi_one_goalkeeper_ten_outfield():
    cands = [(1, 0.9, True), (2, 0.8, True)] + [(10 + i, 1 - i / 20, False) for i in range(14)]
    xi = x1.pick_xi(cands)
    assert len(xi) == 11 and 1 in xi and 2 not in xi
    assert {10 + i for i in range(10)} <= xi


def _data():
    # Two sides (fpl teams 1 v 2) over three gameweeks; player 100 starts GW1-2,
    # is flagged injured before GW3 and does not start.
    fixtures = [{"fpl_fixture_id": str(f), "canonical_fixture_id": str(900 + f), "fpl_event_id": str(f),
                 "kickoff_time": f"2026-09-{f * 7:02d} 15:00:00+00:00", "fpl_home_team_id": "1", "fpl_away_team_id": "2",
                 "finished": "True"} for f in (1, 2, 3)]
    pg = []
    for f in (1, 2, 3):
        for pid, home in ((100, "True"), (101, "True"), (200, "False")):
            st = 1 if (pid != 100 or f < 3) and pid != 101 else 0
            pg.append({"fpl_player_id": str(pid), "fpl_event_id": str(f), "fpl_fixture_id": str(f), "was_home": home,
                       "minutes": "90" if st else "0", "starts": str(st)})
    gws = [{"fpl_event_id": str(f), "deadline_time": f"2026-09-{f * 7 - 1:02d} 17:30:00+00:00"} for f in (1, 2, 3)]
    snaps = [{"fpl_player_id": "100", "captured_at": "2026-09-19 08:00:00+00:00", "status": "i", "chance": "0"}]
    cups = [{"home_team_id": "11", "away_team_id": "99", "kickoff_date": "2026-09-18"}]
    return {"fixtures": fixtures, "pg": pg, "players": [{"fpl_player_id": "200", "element_type": "1"}], "gameweeks": gws,
            "snapshots": snaps, "teams": [{"fpl_team_id": "1", "canonical_team_id": "11"}, {"fpl_team_id": "2", "canonical_team_id": "22"}],
            "cups": cups, "published": []}


def test_build_rows_point_in_time():
    rows = {(r["pid"], r["gw"]): r for r in x1.build_rows(_data())}
    r = rows[(100, 3)]
    assert r["started_last"] == 1 and r["start_rate5"] == 1.0 and r["out_flag"] == 1 and r["chance"] == 0 and r["y"] == 0
    assert r["cup_midweek"] == 1 and r["cup_x_started_last"] == 1  # cup on the 18th, league game on the 21st
    assert rows[(100, 2)]["flag_known"] == 0 and rows[(100, 2)]["chance"] == 1.0  # no snapshot before GW2's deadline
    assert rows[(200, 3)]["gk"] == 1 and rows[(200, 3)]["cup_midweek"] == 0
    assert rows[(100, 1)]["n_past"] == 0


def test_naive_xi_counts_last_starters():
    rows = [r for r in x1.build_rows(_data()) if r["gw"] == 3]
    ev = x1.evaluate(rows, {(r["pid"], r["fid"]): 0.5 for r in rows}, naive_xi=True)
    assert ev["starters_right"] == 1  # 100 started last but not now; 200 started both
