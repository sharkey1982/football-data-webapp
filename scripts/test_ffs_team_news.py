from ffs_team_news import club_keys, match_name, parse_page

ARS = [
    {"fpl_player_id": 1, "web_name": "Raya", "first_name": "David", "second_name": "Raya Martín"},
    {"fpl_player_id": 5, "web_name": "J.Timber", "first_name": "Jurriën", "second_name": "Timber"},
    {"fpl_player_id": 11, "web_name": "Mosquera", "first_name": "Cristhian", "second_name": "Mosquera"},
    {"fpl_player_id": 4, "web_name": "Gabriel", "first_name": "Gabriel", "second_name": "dos Santos Magalhães"},
    {"fpl_player_id": 8, "web_name": "Calafiori", "first_name": "Riccardo", "second_name": "Calafiori"},
    {"fpl_player_id": 13, "web_name": "Rice", "first_name": "Declan", "second_name": "Rice"},
    {"fpl_player_id": 7, "web_name": "Lewis-Skelly", "first_name": "Myles", "second_name": "Lewis-Skelly"},
    {"fpl_player_id": 12, "web_name": "Saka", "first_name": "Bukayo", "second_name": "Saka"},
    {"fpl_player_id": 15, "web_name": "Ødegaard", "first_name": "Martin", "second_name": "Ødegaard"},
    {"fpl_player_id": 14, "web_name": "Eze", "first_name": "Eberechi", "second_name": "Eze"},
    {"fpl_player_id": 25, "web_name": "Gyökeres", "first_name": "Viktor", "second_name": "Gyökeres"},
    {"fpl_player_id": 31, "web_name": "Konsa", "first_name": "Ezri", "second_name": "Konsa Ngoyo"},
    {"fpl_player_id": 10, "web_name": "White", "first_name": "Ben", "second_name": "White"},
]

PAGE = """<html><body><h1>Premier League Team News</h1>
<div class="team"><h2>Arsenal</h2><p><strong>Next Match:</strong> Leeds United (H)</p>
<ul><li><img src="a.png"> Raya Martin</li><li><img> Jurriën Timber</li><li>Mosquera</li><li>Gabriel Magalhães</li><li>Calafiori</li>
<li>Rice</li><li>Lewis-Skelly</li><li>Saka</li><li>Odegaard</li><li>Eze</li><li>Gyokeres</li></ul>
<p><strong>Out:</strong></p><ul><li>Saliba</li><li>Tzolis</li></ul>
<p><strong>Doubts:</strong></p><ul><li>Havertz 75%</li></ul>
<p><strong>Latest News:</strong> Rice should be fine.</p><p><em>Last Updated Fri 9th Oct</em></p></div>
<div class="team"><h2>Leeds United</h2><ul><li>Perri</li></ul><p><strong>Out:</strong></p><ul><li>Someone</li></ul></div>
<h2>Watchlist</h2><ul><li>Not a player</li></ul>
</body></html>"""


def test_parse_page_reads_each_club_xi_and_stops_at_labels():
    clubs = {1: club_keys(["Arsenal"]), 36: club_keys(["Leeds"])}
    out = parse_page(PAGE, clubs)
    assert out[1]["names"] == ["Raya Martin", "Jurriën Timber", "Mosquera", "Gabriel Magalhães", "Calafiori", "Rice",
                               "Lewis-Skelly", "Saka", "Odegaard", "Eze", "Gyokeres"]
    assert out[1]["updated"] == "Last Updated Fri 9th Oct"
    assert out[36]["names"] == ["Perri"]          # "Leeds United" heading matches Leeds; Out list not taken
    assert "Not a player" not in sum((b["names"] for b in out.values()), [])


def test_match_name_handles_ffs_spellings():
    got = {n: (match_name(n, ARS) or {}).get("fpl_player_id") for n in
           ["Raya Martin", "Jurriën Timber", "Gabriel Magalhães", "Odegaard", "Gyokeres", "Konsa Ngoyo", "Lewis-Skelly", "Ben White"]}
    assert got == {"Raya Martin": 1, "Jurriën Timber": 5, "Gabriel Magalhães": 4, "Odegaard": 15, "Gyokeres": 25,
                   "Konsa Ngoyo": 31, "Lewis-Skelly": 7, "Ben White": 10}


def test_match_name_does_not_guess():
    assert match_name("Zinchenko", ARS) is None


def test_match_name_one_distinctive_word():
    squad = ARS + [{"fpl_player_id": 77, "web_name": "Philogene", "first_name": "Jaden", "second_name": "Philogene"}]
    assert match_name("Philogene-Bidace", squad)["fpl_player_id"] == 77
