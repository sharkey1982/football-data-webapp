# python -m pytest scripts/test_export_db_definitions.py
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import export_db_definitions as ex  # noqa: E402

LONG = ("fpl_score(p_season_id bigint, p_element_type integer, p_minutes integer, p_goals integer, p_assists integer, "
        "p_clean_sheets integer, p_goals_conceded integer, p_saves integer, p_penalties_saved integer, p_penalties_missed integer, "
        "p_own_goals integer, p_yellow_cards integer, p_red_cards integer, p_bonus integer, p_defensive_contribution integer)")


def test_short_names_unchanged():
    assert ex.file_name("get_player_by_slug(p_slug text)") == "get_player_by_slug__p_slug_text.sql"
    assert ex.file_name("tennis_refresh()") == "tennis_refresh.sql"


def test_long_names_fit_and_stay_distinct():
    a = ex.file_name(LONG)
    b = ex.file_name(LONG.replace("p_bonus integer", "p_bonus bigint"))
    assert len(a.encode()) <= 255 and len(b.encode()) <= 255
    assert a != b and a.startswith("fpl_score__p_season_id_bigint") and a.endswith(".sql")
