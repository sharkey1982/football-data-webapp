# Unit tests for scripts/intl_squads.py (Wikipedia squad tables) and
# scripts/intl_projections.py (model IP1 and the group simulator).
#   python -m pytest scripts/test_intl_squads.py

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import intl_projections as ip  # noqa: E402
import intl_squads as sq  # noqa: E402

PAGE = """
==Players==
===Current squad===
The following 2 players were named in the squad for the [[2026–27 UEFA Nations League]] matches against [[Spain national football team|Spain]].<ref>{{Cite web |title=x}}</ref>

{{block indent|1=''Caps and goals are correct as of 3 October 2026, after the match against [[Croatia national football team|Croatia]].''}}
{{nat fs g start}}
{{nat fs g player|no=1|pos=GK|name=[[Jordan Pickford]]|age={{Birth date and age|1994|3|7|df=y}}|caps=92|goals=0|club=[[Everton F.C.|Everton]]|clubnat=ENG}}
{{nat fs break}}
{{nat fs g player|no=|pos=FW|name={{sortname|Matt|Freese|Matt Freese (soccer)}}|age={{birth date and age|df=y|1998|9|2}}|caps=20|goals=3|club=[[New York City FC]]|clubnat=USA}}
{{nat fs end}}

===Recent call-ups===
{{nat fs r start}}
{{nat fs r player|no=|pos=DF|name=[[Nico O'Reilly]]|age={{Birth date and age|2005|3|21|df=y}}|caps=13|goals=0|club=[[Manchester City F.C.|Manchester City]]|clubnat=ENG|latest={{sort|2026-10-01|v. {{fb|CRO}}, 3 October 2026 <sup>INJ</sup>}}}}
{{nat fs r end}}

==Records==
"""


def test_squad_page_parses_players_and_call_ups():
    r = sq.parse_page("England", "England national football team", PAGE, "2026-10-04T18:58:30Z")
    s, players = r["squad"], r["players"]
    assert s["players"] == 2 and s["caps_as_of"] == "3 October 2026"
    assert s["intro"].startswith("The following 2 players were named") and "Caps" not in s["intro"]
    cur = [p for p in players if p["list"] == "current"]
    assert cur[0] == {**cur[0], "number": 1, "position": "GK", "player": "Jordan Pickford", "birth_date": "1994-03-07",
                      "caps": 92, "goals": 0, "club": "Everton", "club_country": "ENG"}
    assert (cur[1]["player"], cur[1]["wiki_title"], cur[1]["birth_date"], cur[1]["number"]) == ("Matt Freese", "Matt Freese (soccer)", "1998-09-02", None)
    rec = [p for p in players if p["list"] == "recent"]
    assert (rec[0]["latest_date"], rec[0]["latest_text"], rec[0]["status"]) == ("2026-10-01", "v. CRO, 3 October 2026", "INJ")


def test_page_without_squad_table_is_skipped():
    assert sq.parse_page("X", "X national football team", "==History==\nNothing here.", None) is None


P = [0.08, 0.29, 0.80, 0.01, 0.09, 0.19, -0.05, -0.12]


def test_projection_probabilities_and_scores():
    r = ip.project(P, 2000, 1600, False, "nations_league")
    assert abs(r["p_home"] + r["p_draw"] + r["p_away"] - 1) < 1e-3
    assert r["p_home"] > 0.75 and r["xg_home"] > r["xg_away"]
    assert len(r["scores"]) == 5 and r["scores"][0]["p"] >= r["scores"][-1]["p"]
    even = ip.project(P, 1800, 1800, True, "nations_league")
    assert abs(even["p_home"] - even["p_away"]) < 1e-6


def test_group_simulation_respects_played_games():
    groups = {"A1": ["A", "B", "C"]}
    played = [("A", "B", 3, 0), ("A", "C", 2, 0), ("B", "C", 1, 0)]
    rows = {r["team"]: r for r in ip.simulate_groups(P, groups, played, [], {})}
    assert rows["A"]["p_pos"] == [1.0, 0.0, 0.0] and rows["C"]["p_pos"] == [0.0, 0.0, 1.0]
    rows = {r["team"]: r for r in ip.simulate_groups(P, groups, [], [("A", "B", False), ("B", "C", False), ("A", "C", False)], {"A": 2100, "B": 1500, "C": 1500})}
    assert rows["A"]["p_pos"][0] > 0.8
    assert all(abs(sum(r["p_pos"]) - 1) < 1e-6 for r in rows.values())


def test_current_ratings_apply_reported_results():
    matches = [{"match_date": "2026-08-01", "home_team": "A", "away_team": "B", "elo_home_pre": 1500, "elo_away_pre": 1500, "elo_change": 10}]
    r = ip.current_ratings(matches, [{"kickoff_utc": "2026-09-01T18:00:00+00:00", "home_team": "B", "away_team": "A", "home_score": 2, "away_score": 0}])
    assert r["B"] > 1490 and r["A"] < 1510 and np.isclose(r["A"] + r["B"], 3000)


def test_squad_straight_under_players_heading():
    page = PAGE.replace("===Current squad===\n", "").replace("are correct as of", "as of")
    r = sq.parse_page("Canada", "Canada men's national soccer team", page, None)
    assert r["squad"]["players"] == 2 and r["squad"]["caps_as_of"] == "3 October 2026"
    assert len([p for p in r["players"] if p["list"] == "recent"]) == 1


def test_club_matching_and_clubelo():
    import club_match as cm
    site_teams = [
        {"slug": "man-city", "canonical_name": "Man City", "display_name": "Manchester City", "country": "England", "aliases": ["Manchester City FC"]},
        {"slug": "man-united", "canonical_name": "Man United", "display_name": "Manchester United", "country": "England", "aliases": []},
        {"slug": "salzburg", "canonical_name": "Salzburg", "display_name": "Salzburg", "country": "Austria", "aliases": []},
        {"slug": "wolves", "canonical_name": "Wolves", "display_name": "Wolves", "country": "England", "aliases": ["Wolverhampton"]},
    ]
    csv_text = "Rank,Club,Country,Level,Elo,From,To\nNone,Man City,ENG,1,2010.5,2026-10-01,2026-10-07\nNone,Bayern,GER,1,1990,x,y\nNone,Salzburg,AUT,1,1700,x,y\n"
    rows = sq.read_clubelo(csv_text + "".join(f"None,Club {i},FRA,2,{1300 + i},x,y\n" for i in range(5)))
    assert rows[0]["club"] == "Man City" and rows[0]["rank"] == 1 and rows[1]["club"] == "Bayern"
    site, elo, by_slug = sq.build_indexes(site_teams, rows)
    assert by_slug["man-city"]["club"] == "Man City"
    players = [
        {"club": "Manchester City", "club_wiki": "Manchester City F.C.", "club_country": "ENG"},
        {"club": "Red Bull Salzburg", "club_wiki": "FC Red Bull Salzburg", "club_country": "AUT"},
        {"club": "Bayern Munich", "club_wiki": "FC Bayern Munich", "club_country": "GER"},
        {"club": "Wolverhampton Wanderers", "club_wiki": "Wolverhampton Wanderers F.C.", "club_country": "ENG"},
        {"club": "Tropical Coriano", "club_wiki": "ASD Tropical Coriano", "club_country": "ITA"},
    ]
    n = sq.enrich(players, site, elo, by_slug)
    assert [p["club_slug"] for p in players] == ["man-city", "salzburg", None, "wolves", None]
    assert [p["clubelo_name"] for p in players] == ["Man City", "Salzburg", "Bayern", None, None]
    assert players[0]["club_league_country"] == "England" and players[0]["club_elo_rank"] == 1
    assert n == {"players": 5, "site": 3, "elo": 3}
    assert cm.norm("Brighton & Hove Albion F.C.") == "brighton hove albion"


def test_nations_league_zones():
    r = np.array([0, 1, 2, 3])
    assert list(ip.ZONE_FN("A", 0, r, 4)) == ["QF"] * 4
    assert list(ip.ZONE_FN("A", 2, r, 4)) == ["STAY", "STAY", "PO_AB", "PO_AB"]
    assert list(ip.ZONE_FN("A", 3, r, 4)) == ["PO_AB", "PO_AB", "RELEGATED", "RELEGATED"]
    assert ip.ZONE_FN("B", 3, r, 4)[0] == "PO_BC" and ip.ZONE_FN("C", 3, r, 4)[0] == "STAY_C" and ip.ZONE_FN("D", 2, r, 2)[0] == "PROMOTED"
    groups = {"A1": ["W", "X", "Y", "Z"], "A2": ["P", "Q", "R", "S"]}
    rows = {o["team"]: o for o in ip.simulate_groups(P, groups, [], [(a, b, False) for g in groups.values() for a in g for b in g if a < b], {"W": 2100, "P": 2100})}
    assert all(abs(sum(o["zones"].values()) - 1) < 1e-6 for o in rows.values())
    assert rows["W"]["zones"].get("QF", 0) > 0.8
