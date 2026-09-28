# Unit tests for scripts/fpl_scoring.py. Rule sets as fpl_scoring_rule_sets
# returns them (2024/25 and 2026/27); the expected totals match fpl_score()
# in the database for the same inputs.
#   python -m pytest scripts/test_fpl_scoring.py

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from fpl_scoring import score  # noqa: E402

BASE = dict(appearance_pts=1, appearance_min=1, full_pts=2, full_min=60, assist_pts=3,
            penalty_miss_pts=-2, own_goal_pts=-2, yellow_pts=-1, red_pts=-3)
GK_2024 = dict(BASE, goal_pts=6, clean_sheet_pts=4, clean_sheet_min=60, save_pts=1, saves_per=3,
               conceded_pts=-1, conceded_per=2, penalty_save_pts=5)
DEF_2026 = dict(BASE, goal_pts=6, clean_sheet_pts=4, clean_sheet_min=60, conceded_pts=-1, conceded_per=2,
                defcon_pts=2, defcon_min=10)
MID_2024 = dict(BASE, goal_pts=5, clean_sheet_pts=1, clean_sheet_min=60)
FWD_2026 = dict(BASE, goal_pts=4, defcon_pts=2, defcon_min=12)


def test_defender_full_house():
    # 90 min 2 + goal 6 + clean sheet 4 + defcon 2 + bonus 2 (fpl_score gives 16)
    assert score(DEF_2026, 90, goals=1, clean_sheets=1, bonus=2, defensive_contribution=10) == 16


def test_goalkeeper_saves_conceded_penalty_card():
    # 2 + 6 saves -> 2 - 3 conceded -> -1 + pen save 5 - yellow 1 (fpl_score gives 7)
    assert score(GK_2024, 90, goals_conceded=3, saves=6, penalties_saved=1, yellow_cards=1) == 7


def test_appearance_boundaries():
    assert score(MID_2024, 0) == 0
    assert score(MID_2024, 1) == 1
    assert score(MID_2024, 59) == 1
    assert score(MID_2024, 60) == 2


def test_clean_sheet_needs_60_minutes():
    assert score(MID_2024, 59, clean_sheets=1) == 1
    assert score(MID_2024, 60, clean_sheets=1) == 3


def test_rule_missing_from_season_scores_nothing():
    # No defensive contribution before 2025/26.
    assert score(MID_2024, 90, defensive_contribution=20) == 2
    assert score(FWD_2026, 90, defensive_contribution=11) == 2
    assert score(FWD_2026, 90, defensive_contribution=12) == 4


def test_negatives():
    assert score(DEF_2026, 30, goals_conceded=5, own_goals=1, red_cards=1, penalties_missed=1) == 1 - 2 - 2 - 3 - 2
