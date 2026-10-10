import pytest

from fpl_depth_chart import Player, allocate, compute, fill_group, group_places


def arsenal(saliba_avail: float, saliba_fc: float | None = None):
    P = Player
    return [
        P(1, "RCB", 1, saliba_avail, 0.79, saliba_fc, 2),   # Saliba
        P(2, "RCB", 2, 1.0, 0.65, None, 2),                 # Konsa
        P(3, "RCB", 3, 1.0, 0.37, None, 2),                 # Mosquera
        P(4, "LCB", 1, 1.0, 0.95, None, 2),                 # Gabriel
        P(5, "RB", 1, 1.0, 0.29, None, 2),                  # Timber
        P(6, "RB", 2, 1.0, 0.70, None, 2),                  # White
        P(7, "LB", 1, 1.0, 0.95, None, 2),
        P(8, "DM", 1, 1.0, 0.97, None, 3),                  # Rice
        P(9, "DM", 2, 1.0, 0.80, None, 3),
        P(10, "DM", 2, 1.0, 0.40, None, 3),
        P(11, "LW", 1, 1.0, 0.9, None, 3),
        P(12, "RW", 1, 1.0, 0.9, None, 3),
        P(13, "AM", 1, 1.0, 0.9, None, 3),
        P(14, "CF", 1, 1.0, 0.9, None, 4),
        P(15, "GK", 1, 1.0, None, None, 1),
    ]


def test_backups_lose_place_when_first_choice_fit():
    out = allocate(arsenal(1.0), "4-2-3-1")
    saliba, konsa, mosquera = out[1][0], out[2][0], out[3][0]
    assert saliba == pytest.approx(0.85)
    # 15% when Saliba is rotated, plus covering other defensive places.
    assert 0.13 <= konsa < 0.25
    assert mosquera < 0.08


def test_backup_starts_when_first_choice_out():
    out = allocate(arsenal(0.0), "4-2-3-1")
    assert out[1][0] == 0
    assert out[2][0] == pytest.approx(0.9)
    assert 0.09 <= out[3][0] < 0.2


def test_returning_ramp_moves_minutes_across():
    early, late = allocate(arsenal(0.6), None), allocate(arsenal(1.0), None)
    assert late[1][0] > early[1][0]
    assert late[2][0] < early[2][0]


def test_first_choice_setting_used():
    out = allocate(arsenal(1.0, 0.95), None)
    assert out[1][0] == pytest.approx(0.95)


def test_ranked_first_beats_low_start_rate():
    out = allocate(arsenal(1.0), None)
    assert out[5][0] == pytest.approx(0.85)       # Timber, ranked first
    assert out[6][0] < 0.25


def test_tied_backups_share_second_dm_place():
    out = allocate(arsenal(1.0), "4-2-3-1")
    # Two DM places: Rice + one of the tied backups (ranked 2).
    a, b = out[9][0], out[10][0]
    # About one place between them, plus covering rotated midfield places.
    assert 0.95 < a + b < 1.3
    assert a > b                                  # same rank: the one starting more often leads


def test_goalkeepers_left_out():
    assert 15 not in allocate(arsenal(1.0), None)


def test_outfield_starts_about_ten():
    out = allocate(arsenal(1.0), "4-2-3-1")
    assert 9.0 < sum(s for s, _, _ in out.values()) <= 10.0 + 1e-6


def test_generic_players_fill_open_line_places():
    P = Player
    players = [P(1, "LCB", 1, 0.0, 0.9, None, 2), P(2, "RCB", 1, 1.0, 0.9, None, 2),
               P(3, "DEF", 3, 1.0, 0.5, None, 2), P(4, "DEF", 3, 1.0, 0.5, None, 2)]
    out = allocate(players, None)
    # One defensive place is open (LCB out); the two generic DEFs share it.
    assert out[3][0] == pytest.approx(0.5, abs=0.05)
    assert out[3][0] + out[4][0] <= 1.0 + 0.15


def test_group_places_template_fills_short_club():
    P = Player
    players = [P(1, "DM", 1, 1, 0.9, None, 3), P(2, "CF", 1, 1, 0.9, None, 4)]
    places = group_places(players, "4-2-3-1")
    assert places["PIV"] == 2 and sum(places.values()) == 10


def test_fill_group_two_places_two_tied():
    s, open_dist = fill_group(2, [Player(1, "DM", 2, 1, 0.5, None, 3), Player(2, "DM", 2, 1, 0.5, None, 3)])
    assert s[1] == pytest.approx(0.9) and s[2] == pytest.approx(0.9)
    assert sum(open_dist) == pytest.approx(1.0)


def test_compute_groups_by_fixture_and_club():
    rows = [
        {"fixture_id": 1, "team_id": 7, "fpl_player_id": 1, "tactical_role": "RCB", "depth_rank": 1, "availability": 1, "rate": 0.9, "start_if_fit": None, "element_type": 2, "formation": ""},
        {"fixture_id": 1, "team_id": 7, "fpl_player_id": 2, "tactical_role": "RCB", "depth_rank": 2, "availability": 1, "rate": 0.5, "start_if_fit": None, "element_type": 2, "formation": ""},
        {"fixture_id": 2, "team_id": 7, "fpl_player_id": 1, "tactical_role": "RCB", "depth_rank": 1, "availability": 0, "rate": 0.9, "start_if_fit": None, "element_type": 2, "formation": ""},
        {"fixture_id": 2, "team_id": 7, "fpl_player_id": 2, "tactical_role": "RCB", "depth_rank": 2, "availability": 1, "rate": 0.5, "start_if_fit": None, "element_type": 2, "formation": ""},
    ]
    got = {(r["fixture_id"], r["fpl_player_id"]): r["start_probability"] for r in compute(rows)}
    assert got[(1, 2)] < 0.15 and got[(2, 2)] == pytest.approx(0.9)


def test_spare_backup_covers_other_role_in_line():
    P = Player
    players = [P(1, "LCB", 1, 0.0, 0.9, None, 2), P(2, "RCB", 1, 1.0, 0.97, None, 2), P(3, "RCB", 2, 1.0, 0.5, None, 2)]
    out = allocate(players, None)
    # LCB out with no LCB backup: the spare RCB backup moves across.
    assert out[3][0] > 0.85


# ---- Evidence wears down a seeded first choice (9 Oct 2026) ----------------

def _rw(first_starts, first_avail, first_rate=0.2):
    P = Player
    return [
        P(1, "RW", 1, 1.0, first_rate, None, 3, starts=first_starts, available=first_avail),   # seeded first choice
        P(2, "RW", 2, 1.0, 0.8, None, 3, starts=4, available=5),                               # has been starting
    ]


def test_returning_regular_keeps_floor():
    # Back from injury: no matches available yet, so the pecking order stands.
    out = allocate(_rw(0, 0), None)
    assert out[1][0] == pytest.approx(0.85)


def test_fit_and_unpicked_first_choice_wears_down():
    # Fit for five matches, started none: (0 + 0.85 x 3) / (5 + 3).
    out = allocate(_rw(0, 5, first_rate=0.03), None)
    assert out[1][0] == pytest.approx(0.85 * 3 / 8, abs=1e-4)
    # The backup who has been playing picks up the place.
    assert out[2][0] > 0.55


def test_regular_starter_unchanged():
    out = allocate(_rw(5, 5, first_rate=0.97), None)
    assert out[1][0] == pytest.approx(0.97)


def test_no_start_record_keeps_old_rule():
    P = Player
    out = allocate([P(1, "RW", 1, 1.0, 0.1, None, 3)], None)
    assert out[1][0] == pytest.approx(0.85)


def test_tied_rank_weighted_by_start_rate():
    import fpl_depth_chart as dc
    old = dc.TIE_WEIGHT_BY_RATE
    dc.TIE_WEIGHT_BY_RATE = True
    try:
        P = Player
        players = [P(1, "DM", 1, 1.0, 0.97, None, 3),
                   P(5, "DM", 1, 0.0, 0.90, None, 3),   # injured partner: one place reaches the 2nds
                   P(2, "DM", 2, 1.0, 0.69, None, 3),   # Lewis-Skelly: starting
                   P(3, "DM", 2, 1.0, 0.15, None, 3),   # Zubimendi: on the bench
                   P(4, "DM", 2, 1.0, 0.29, None, 3)]
        equal = None
        out = allocate(players, None)
        dc.TIE_WEIGHT_BY_RATE = False
        equal = allocate(players, None)
    finally:
        dc.TIE_WEIGHT_BY_RATE = old
    tier = lambda o: sum(o[i][0] for i in (2, 3, 4))
    assert tier(out) == pytest.approx(tier(equal), abs=0.01)   # same places in total
    assert out[2][0] > out[4][0] > out[3][0]
    assert out[2][0] <= 1.0


def test_share_by_weight_caps_and_redistributes():
    from fpl_depth_chart import share_by_weight
    got = share_by_weight(1.2, {1: 10, 2: 1, 3: 1}, {1: 0.9, 2: 0.9, 3: 0.9})
    assert got[1] == pytest.approx(0.9)
    assert got[2] == pytest.approx(0.15) and got[3] == pytest.approx(0.15)


def test_simulation_matches_analytic_without_other_positions():
    from fpl_depth_chart import allocate_sim
    players = arsenal(0.6)
    exact = allocate(players, "4-2-3-1")
    sim = allocate_sim(players, "4-2-3-1", sims=6000)
    for pid, (s, _g, _r) in exact.items():
        assert abs(sim[pid][0] - s) < 0.05, (pid, s, sim[pid][0])


def test_other_position_lets_a_backup_cover_and_reports_where():
    from fpl_depth_chart import allocate_sim
    P = Player
    players = [
        P(1, "LW", 1, 0.0, 0.9, None, 3),                       # Tzolis, injured
        P(2, "LW", 3, 1.0, 0.3, None, 3),                       # Eze, ranked behind at LW
        P(3, "RW", 1, 1.0, 0.95, None, 3),                      # Saka
        P(4, "RW", 2, 1.0, 0.2, None, 3, others=[("LW", 2)]),   # Madueke: RW 2nd, also LW 2nd
    ]
    out = allocate_sim(players, None, sims=6000)
    madueke, eze = out[4], out[2]
    assert madueke[0] > eze[0]
    assert madueke[3]["LW"] > 0.7                # mostly starting on the left
    assert sum(madueke[3].values()) == pytest.approx(madueke[0], abs=0.001)


def test_compute_uses_simulation_only_when_other_positions_exist():
    base = {"fixture_id": 1, "team_id": 7, "availability": 1, "start_if_fit": None, "element_type": 3, "formation": "", "starts": 3, "available": 3}
    rows = [dict(base, fpl_player_id=1, tactical_role="LW", depth_rank=1, rate=0.9),
            dict(base, fpl_player_id=2, tactical_role="RW", depth_rank=1, rate=0.9)]
    plain = {r["fpl_player_id"]: r for r in compute(rows)}
    assert plain[1]["group_shares"] == {"LW": plain[1]["start_probability"]}
    rows.append(dict(base, fpl_player_id=3, tactical_role="RW", depth_rank=2, rate=0.4, other_roles='[{"role": "LW", "rank": 2}]'))
    multi = {r["fpl_player_id"]: r for r in compute(rows)}
    assert set(multi[3]["group_shares"]) <= {"LW", "RW"} and multi[3]["start_probability"] > 0
