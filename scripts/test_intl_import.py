# Unit tests for scripts/intl_import.py: match keys, stage derivation,
# Nations League group checks and play-off naming, the extra-time split,
# Elo and the reconciliation hash. Cases mirror the 5 Oct 2026 profile.
#   python -m pytest scripts/test_intl_import.py

import hashlib
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import intl_import as ii  # noqa: E402

HEAD = ["date", "home_team", "away_team", "home_score", "away_score", "tournament", "city", "country", "neutral"]


def res(*rows):
    return [dict(zip(HEAD, r)) for r in rows]


def src(results, **extra):
    s = {"results": results, "goalscorers": [], "shootouts": [], "former_names": [],
         "worldcup": {}, "euro": {}, "nl_feed": None}
    s.update(extra)
    return s


def game(key, home, away, hs, as_, date="2000-06-10", shootout=None):
    return {"match_key": key, "match_date": date, "home_team": home, "away_team": away,
            "home_score": hs, "away_score": as_, "shootout_winner": shootout, "stage_code": None,
            "group_label": None, "competition": "UEFA Euro", "neutral": True}


def test_duplicate_key_gets_sequence():
    # Tahiti v New Caledonia twice on 17 Feb 1974 (2-1 and 1-2)
    b = ii.build(src(res(("1974-02-17", "Tahiti", "New Caledonia", "2", "1", "Friendly", "Papeete", "Tahiti", "FALSE"),
                         ("1974-02-17", "Tahiti", "New Caledonia", "1", "2", "Friendly", "Papeete", "Tahiti", "FALSE"))))
    assert [m["match_key"] for m in b.matches] == ["1974-02-17|Tahiti|New Caledonia",
                                                    "1974-02-17|Tahiti|New Caledonia|2"]


def test_friendly_score_is_the_90_minute_score():
    b = ii.build(src(res(("1872-11-30", "Scotland", "England", "0", "0", "Friendly", "Glasgow", "Scotland", "FALSE"))))
    m = b.matches[0]
    assert (m["home_score_90"], m["away_score_90"], m["went_extra_time"]) == (0, 0, False)


def round_robin(teams, start_day, prefix):
    out, d = [], start_day
    for i, a in enumerate(teams):
        for b in teams[i + 1:]:
            out.append(game(f"{prefix}{d:02d}{a}{b}", a, b, 1, 0, date=f"2000-06-{d:02d}"))
            d += 0
    return out


def test_derived_stages_groups_then_knockouts():
    # Two groups of four, then semi-finals and a final (Euro 1984-92 shape).
    g1 = round_robin(["A", "B", "C", "D"], 10, "a")
    g2 = round_robin(["E", "F", "G", "H"], 11, "b")
    sf = [game("s1", "A", "F", 2, 1, "2000-06-20"), game("s2", "E", "B", 0, 0, "2000-06-21", shootout="B")]
    final = [game("f", "A", "B", 1, 0, "2000-06-25")]
    games = g1 + g2 + sf + final
    ii.apply_derived(ii.Build(), "EURO-TEST", games)
    assert {m["stage_code"] for m in g1 + g2} == {"GRP"}
    assert {m["group_label"] for m in g1} == {"A"} and {m["group_label"] for m in g2} == {"B"}
    assert [m["stage_code"] for m in sf + final] == ["SF", "SF", "F"]


def test_derived_final_replay_and_coin_toss():
    # Euro 1968: a semi-final settled by lots, third place, a drawn final and its replay.
    games = [game("1968-06-05|England|Yugoslavia", "England", "Yugoslavia", 0, 1, "1968-06-05"),
             game("1968-06-05|Italy|Russia", "Italy", "Russia", 0, 0, "1968-06-05"),
             game("1968-06-08|England|Russia", "England", "Russia", 2, 0, "1968-06-08"),
             game("1968-06-08|Italy|Yugoslavia", "Italy", "Yugoslavia", 1, 1, "1968-06-08"),
             game("1968-06-10|Italy|Yugoslavia", "Italy", "Yugoslavia", 2, 0, "1968-06-10")]
    ii.apply_derived(ii.Build(), "EURO-1968", games)
    assert [m["stage_code"] for m in games] == ["SF", "SF", "3P", "F", "F"]


def test_nations_league_group_list_must_match_games():
    games = [game("x1", "England", "Spain", 1, 0, "2018-09-08"), game("x2", "Spain", "Croatia", 6, 0, "2018-09-11"),
             game("x3", "Croatia", "England", 0, 0, "2018-10-12")]
    ii.check_groups("UNL-T", games, {"A4": ["England", "Spain", "Croatia"]})
    with pytest.raises(ii.ImportCheckFailed):
        ii.check_groups("UNL-T", games, {"A4": ["England", "Spain"], "A3": ["Croatia", "Italy"]})


def test_nations_league_suspended_team_allowed():
    # Russia was drawn in 2022/23 B2 but played no game.
    games = [game("y1", "Israel", "Iceland", 2, 2), game("y2", "Albania", "Iceland", 1, 1),
             game("y3", "Israel", "Albania", 2, 1)]
    ii.check_groups("UNL-T", games, {"B2": ["Israel", "Iceland", "Albania", "Russia"]})


def test_nations_league_later_games_named_by_league():
    groups = {"A": "A1", "B": "A2", "C": "B1", "D": "A3", "E": "A4", "F": "C1", "G": "B2"}
    later = [game("q1", "A", "B", 1, 0, "2025-03-20"), game("q2", "B", "A", 1, 1, "2025-03-23"),
             game("p1", "D", "C", 0, 1, "2025-03-20"), game("p2", "C", "D", 0, 0, "2025-03-23"),
             game("p3", "G", "F", 2, 0, "2025-03-20"), game("p4", "F", "G", 0, 0, "2025-03-23"),
             game("f1", "A", "D", 2, 1, "2025-06-04"), game("f2", "E", "B", 1, 1, "2025-06-05", shootout="E"),
             game("f3", "D", "B", 0, 2, "2025-06-08"), game("f4", "A", "E", 2, 2, "2025-06-08", shootout="E")]
    ii.classify_nl_later("UNL-T", later, groups)
    assert [m["stage_code"] for m in later] == ["QF", "QF", "PO_AB", "PO_AB", "PO_BC", "PO_BC", "SF", "SF", "3P", "F"]


def test_openfootball_extra_time_split():
    # 2026 final: Spain 1-0 Argentina after extra time, 0-0 at 90 minutes.
    results = res(("2026-07-19", "Spain", "Argentina", "1", "0", "FIFA World Cup", "East Rutherford", "United States", "TRUE"))
    doc = {"matches": [{"round": "Final", "date": "2026-07-19", "team1": "Spain", "team2": "Argentina",
                        "score": {"et": [1, 0], "ft": [0, 0], "ht": [0, 0]}}]}
    b = ii.build(src(results, worldcup={"2026": doc}))
    m = b.matches[0]
    assert (m["stage_code"], m["home_score_90"], m["away_score_90"], m["went_extra_time"]) == ("F", 0, 0, True)
    assert m["edition_key"] == "WC-2026"


def test_openfootball_alias_and_flip():
    # openfootball lists the teams the other way round and calls them USA.
    results = res(("1994-06-18", "United States", "Switzerland", "1", "1", "FIFA World Cup", "Pontiac", "United States", "FALSE"))
    doc = {"matches": [{"round": "Matchday 1", "group": "Group A", "date": "1994-06-18", "team1": "Switzerland",
                        "team2": "USA", "score": {"ft": [1, 1], "ht": [1, 1]}}]}
    m = ii.build(src(results, worldcup={"1994": doc})).matches[0]
    assert (m["stage_code"], m["group_label"], m["matchday"]) == ("GRP", "A", 1)


def test_unmatched_openfootball_game_fails():
    results = res(("1994-06-18", "United States", "Switzerland", "1", "1", "FIFA World Cup", "Pontiac", "United States", "FALSE"))
    doc = {"matches": [{"round": "Final", "date": "1994-07-17", "team1": "Brazil", "team2": "Italy", "score": [0, 0]}]}
    with pytest.raises(ii.ImportCheckFailed):
        ii.build(src(results, worldcup={"1994": doc}))


def test_elo_matches_published_formula():
    m = [{"match_date": "2000-01-01", "home_team": "A", "away_team": "B", "home_score": 3, "away_score": 0,
          "competition": "FIFA World Cup", "neutral": True}]
    ii.elo(m)
    # Equal ratings, neutral: expected 0.5; K 60; margin 3 -> (11+3)/8 = 1.75
    assert m[0]["elo_change"] == pytest.approx(60 * 1.75 * 0.5)
    assert ii.elo_k("UEFA Euro qualification") == 40 and ii.elo_k("Friendly") == 20


def test_year_totals_hash():
    ms = [{"match_key": "b", "match_date": "2001-01-01", "home_score": 1, "away_score": 2},
          {"match_key": "a", "match_date": "2001-02-01", "home_score": 0, "away_score": 0}]
    assert ii.year_totals(ms) == {2001: (2, 3, hashlib.md5(b"a\nb").hexdigest())}


def feed_row(n, home, away, group, when="2026-09-26 18:45:00Z"):
    return {"MatchNumber": n, "RoundNumber": 1, "DateUtc": when, "Location": "Wembley Stadium",
            "HomeTeam": home, "AwayTeam": away, "Group": f"Group {group}",
            "HomeTeamScore": None, "AwayTeamScore": None, "Winner": ""}


def test_fixture_feed_gives_2026_groups_and_fixtures():
    results = res(("2024-11-17", "England", "Republic of Ireland", "5", "0", "Friendly", "London", "England", "FALSE"),
                  ("2024-11-17", "Spain", "Czech Republic", "1", "0", "Friendly", "Madrid", "Spain", "FALSE"))
    feed = [feed_row(100, "England", "Spain", "A3"), feed_row(101, "Czechia", "Ireland", "A3")]
    b = ii.build(src(results, nl_feed=feed))
    assert [(f["home_team"], f["away_team"]) for f in b.fixtures] == [("England", "Spain"),
                                                                      ("Czech Republic", "Republic of Ireland")]
    assert b.fixtures[0]["kickoff_utc"] == "2026-09-26T18:45:00+00:00"
    assert [e["edition_key"] for e in b.editions] == ["UNL-2026-27"]
    members = sorted(m["team"] for m in b.group_members if m["group_key"] == "UNL-2026-27|LP|A3")
    assert members == ["Czech Republic", "England", "Republic of Ireland", "Spain"]


def test_fixture_feed_unknown_team_fails():
    results = res(("2024-11-17", "England", "Spain", "5", "0", "Friendly", "London", "England", "FALSE"))
    with pytest.raises(ii.ImportCheckFailed):
        ii.build(src(results, nl_feed=[feed_row(1, "England", "Atlantis", "A3")]))


def test_venue_fix_and_hosts():
    # Euro 2020: Wales v Switzerland was in Baku (the file says Cardiff); hosts are every venue country.
    results = res(("2021-06-12", "Wales", "Switzerland", "1", "1", "UEFA Euro", "Cardiff", "Wales", "FALSE"),
                  ("2021-06-13", "Austria", "North Macedonia", "3", "1", "UEFA Euro", "Bucharest", "Romania", "TRUE"))
    doc = {"matches": [
        {"round": "Matchday 1", "group": "Group A", "date": "2021-06-12", "team1": "Wales", "team2": "Switzerland", "score": {"ft": [1, 1]}},
        {"round": "Matchday 1", "group": "Group C", "date": "2021-06-13", "team1": "Austria", "team2": "North Macedonia", "score": {"ft": [3, 1]}},
    ]}
    b = ii.build(src(results, euro={"2020": doc}))
    m = next(x for x in b.matches if x["home_team"] == "Wales")
    assert (m["city"], m["country"], m["neutral"]) == ("Baku", "Azerbaijan", True)
    assert m["raw"]["city"] == "Cardiff"
    assert b.editions[0]["hosts"] == ["Azerbaijan", "Romania"]


def test_continental_editions_split_by_gap_with_winners():
    # Two Gold Cups more than 120 days apart: in 2001 one league of all four
    # teams (a final round) then a play-off between two of them (Copa 1949
    # shape), in 2003 a single game.
    rows = []
    teams = ["Mexico", "United States", "Canada", "Jamaica"]
    for i, a in enumerate(teams):
        for b in teams[i + 1:]:
            rows.append(("2001-07-0%d" % (1 + len(rows) % 6), a, b, "1", "0", "Gold Cup", "LA", "United States", "TRUE"))
    rows.append(("2001-07-20", "Mexico", "United States", "0", "1", "Gold Cup", "LA", "United States", "TRUE"))
    rows.append(("2003-07-27", "Mexico", "Brazil", "1", "0", "Gold Cup", "Mexico City", "Mexico", "FALSE"))
    b = ii.build(src(res(*rows)))
    eds = {e["edition_key"]: e for e in b.editions if e["competition"] == "Gold Cup"}
    assert set(eds) == {"GOLD-2001", "GOLD-2003"}
    assert (eds["GOLD-2001"]["winner"], eds["GOLD-2001"]["runner_up"]) == ("United States", "Mexico")
    g01 = [m for m in b.matches if m["edition_key"] == "GOLD-2001"]
    assert sorted({m["stage_code"] for m in g01}) == ["FR", "PO"]
    assert eds["GOLD-2003"]["winner"] == "Mexico"


def test_hand_winner_must_agree_with_a_derived_final(monkeypatch):
    monkeypatch.setitem(ii.HAND_WINNERS, ("Gold Cup", "2003"), ("Brazil", "Mexico"))
    rows = [("2003-07-27", "Mexico", "Brazil", "1", "0", "Gold Cup", "Mexico City", "Mexico", "FALSE")]
    with pytest.raises(ii.ImportCheckFailed):
        ii.build(src(res(*rows)))
