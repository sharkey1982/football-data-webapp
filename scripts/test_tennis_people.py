# Unit tests for the Wikidata matching in scripts/tennis_people.py. Cases are
# the hard ones met when checking the 5 Oct 2026 fetch.
#   python -m pytest scripts/test_tennis_people.py

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import tennis_people as tp  # noqa: E402

MALE, FEMALE = tp.SEX["ATP"], tp.SEX["WTA"]


def person(qid, label, family=(), given=(), dob=None, sex=MALE, **kw):
    return {"qid": qid, "label": label, "family": list(family), "given": list(given), "dob": dob, "sex": sex, **kw}


def player(pid, name, tour="ATP", first=2015, last=2025, matches=100):
    return {"player_id": pid, "tour": tour, "name": name, "first_year": first, "last_year": last,
            "matches": matches, "recent_matches": matches}


def test_split_ours():
    assert tp.split_ours("Del Potro J.M.") == ("delpotro", "jm", None)
    assert tp.split_ours("Pliskova Ka.") == ("pliskova", "k", "ka")
    assert tp.split_ours("Bautista Agut R.") == ("bautistaagut", "r", None)  # "Agut" is a surname word
    assert tp.split_ours("Auger-Aliassime F.") == ("augeraliassime", "f", None)


def test_initials_split_hyphens():
    assert tp.initials_of(["Jean-Rene"]) == "jr"
    assert tp.initials_of(["Ye-ra"]) == "yr"


def test_full_initials_beat_single_initial():
    people = {"ATP": [person("Q1", "Juan Martin del Potro", ["del Potro"], ["Juan", "Martin"], "1988-09-23"),
                      person("Q2", "Juan del Potro", ["del Potro"], ["Juan"], "1990-01-01")], "WTA": []}
    [row] = tp.match([player(1, "Del Potro J.M.")], people)
    assert row["qid"] == "Q1" and row["method"] == "name+initials"


def test_given_name_prefix_separates_twins():
    people = {"WTA": [person("Q10", "Karolina Pliskova", ["Pliskova"], ["Karolina"], "1992-03-21", FEMALE),
                      person("Q11", "Kristyna Pliskova", ["Pliskova"], ["Kristyna"], "1992-03-21", FEMALE)], "ATP": []}
    rows = tp.match([player(1, "Pliskova Ka.", "WTA"), player(2, "Pliskova Kr.", "WTA")], people)
    assert [r["qid"] for r in rows] == ["Q10", "Q11"]


def test_wrong_sex_and_implausible_age_are_ignored():
    people = {"ATP": [person("Q20", "Casper Ruud", ["Ruud"], ["Casper"], "1998-12-22"),
                      person("Q21", "Christian Ruud", ["Ruud"], ["Christian"], "1972-08-24")],
              "WTA": [person("Q22", "Clara Ruud", ["Ruud"], ["Clara"], "1999-01-01", FEMALE)]}
    [row] = tp.match([player(1, "Ruud C.", last=2026)], people)
    assert row["qid"] == "Q20"  # Christian (born 1972) is too old to be the 2026 player; Clara is WTA


def test_east_asian_order():
    people = {"WTA": [person("Q30", "Zheng Qinwen", ["Zheng"], ["Qinwen"], "2002-10-08", FEMALE)], "ATP": []}
    [row] = tp.match([player(1, "Zheng Q.", "WTA")], people)
    assert row["qid"] == "Q30"


def test_two_initials_must_agree():
    people = {"ATP": [person("Q40", "Yong-Hyun Kim", ["Kim"], ["Yong-Hyun"], "1990-01-01")], "WTA": []}
    [row] = tp.match([player(1, "Kim Y.R.")], people)
    assert row["qid"] is None


def test_override_and_one_player_per_person():
    people = {"ATP": [person("Q60676610", "Brandon Nakashima", ["Nakashima"], ["Brandon"], "2001-08-03"),
                      person("Q99", "Bryce Nakashima", ["Nakashima"], ["Bryce"], "2003-01-01")], "WTA": []}
    rows = tp.match([player(1, "Nakashima B."), player(2, "Nakashima Bra.", matches=3)], people)
    assert rows[0]["qid"] == "Q60676610" and rows[0]["method"] == "override"
    assert rows[1]["qid"] is None and rows[1]["method"] == "taken"  # the same person can't be two players


def test_person_row_country():
    m = {"player_id": 1, "qid": "Q1", "method": "name+initials",
         "person": person("Q1", "Holger Rune", dob="2003-04-29", hand="Q3039938",
                          cit=["DK"], sport=[], citq=["Q35", "Q756617"], sportq=[])}
    row = tp.person_row(m)
    assert row["country"] == "DK" and row["hand"] == "Right" and row["all_countries"] == ["DK"]
    # Two citizenships and no sporting nationality: country unknown rather than a guess.
    m["person"].update(cit=["GB", "SK"], citq=[])
    assert tp.person_row(m)["country"] is None
    # The nation played for decides.
    m["person"].update(sport=["GB"])
    assert tp.person_row(m)["country"] == "GB"


def test_hand_from_tennis_specific_values():
    assert tp.hand_of({"hand": "Q14419931", "hands": ["right-handed, one-handed backhand"]}) == "Right"
    assert tp.hand_of({"hand": "Q789447", "hands": []}) == "Left"
    assert tp.hand_of({"hand": "Q457332", "hands": ["ambidexterity"]}) is None


def test_country_is_the_nation_played_for_now():
    m = {"player_id": 1, "qid": "Q1", "method": "name+initials",
         "person": person("Q1", "Alexander Bublik", sport=["KZ", "RU"], sportnow=["KZ"], cit=["RU"], citq=[], sportq=[])}
    assert tp.person_row(m)["country"] == "KZ"
    m["person"].update(sportnow=["AU", "RU"], sportpref=["AU"])
    assert tp.person_row(m)["country"] == "AU"
    m["person"].update(sportnow=["AU", "RU"], sportpref=[])
    assert tp.person_row(m)["country"] is None  # two current nations: unknown, not a guess
