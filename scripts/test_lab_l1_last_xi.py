import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import lab_l1_last_xi as l1  # noqa: E402

PRM = {"r": 0.9, "r_gk": 0.95, "e": 0.8, "c": 1.0, "a": 0.05}


def _row(pid, pos, started_last, chance=1.0, rate=0.0, last_min=90, cup=0.0):
    return {"pid": pid, "fid": 1, "team": 7, "pos": pos, "started_last": float(started_last), "chance": chance,
            "start_rate5": rate, "last_min": last_min, "cup_midweek": cup, "y": 0, "is_gk": pos == "GK"}


def _side():
    xi = [_row(1, "GK", 1)] + [_row(10 + i, "DEF", 1) for i in range(4)] + [_row(20 + i, "MID", 1) for i in range(4)] \
        + [_row(30 + i, "FWD", 1) for i in range(2)]
    bench = [_row(2, "GK", 0, rate=0.0), _row(40, "DEF", 0, rate=0.6), _row(41, "DEF", 0, rate=0.0),
             _row(50, "MID", 0, rate=0.2), _row(60, "FWD", 0, rate=0.4)]
    return xi, bench


def test_sums_to_eleven_and_keeps_last_xi_high():
    xi, bench = _side()
    p = l1.predict_l1(xi + bench, PRM)
    assert abs(sum(p.values()) - 11) < 0.02
    assert p[(10, 1)] == 0.9 and p[(1, 1)] == 0.95


def test_injured_starter_opens_a_place_in_his_position():
    xi, bench = _side()
    xi[1]["chance"] = 0.0  # a defender ruled out
    p = l1.predict_l1(xi + bench, PRM)
    assert p[(10, 1)] < 0.01
    # The regular back-up defender takes most of it, ahead of the forward.
    assert p[(40, 1)] > 0.8 > p[(60, 1)]
    assert abs(sum(p.values()) - 11) < 0.02


def test_early_sub_and_doubt_lower_the_keep():
    xi, bench = _side()
    xi[5]["last_min"] = 45
    xi[6]["chance"] = 0.75
    p = l1.predict_l1(xi + bench, PRM)
    assert abs(p[(20, 1)] - 0.72) < 1e-9
    assert abs(p[(21, 1)] - 0.675) < 1e-9


def test_missing_last_xi_player_spills_to_outfield():
    xi, bench = _side()
    p = l1.predict_l1(xi[:-1] + bench, PRM)  # a forward has left the club
    assert abs(sum(p.values()) - 11) < 0.02
    assert p[(2, 1)] < 0.1  # the spare keeper doesn't take an outfield place
