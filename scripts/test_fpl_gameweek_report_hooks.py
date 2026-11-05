"""X opening-line hooks for the gameweek threads (A/B test, 5 Nov 2026).
Payload extracts are the real GW10 preview (report 35) and GW8/GW9 reflections."""
from fpl_gameweek_report import preview_hooks, reflection_hooks, x_len

CAPS_GW10 = [
    {"id": 411, "name": "Haaland", "pos": "FWD", "price": 15.8, "gw_xpts": 7.15, "top_chance": 0.168},
    {"id": 15, "name": "Ødegaard", "pos": "MID", "price": 6.7, "gw_xpts": 7.06, "top_chance": 0.186},
    {"id": 249, "name": "Barry", "pos": "FWD", "price": 5.6, "gw_xpts": 6.63, "top_chance": 0.128},
]
FIX_GW10 = [{"home": "Arsenal", "away": "Hull", "goals_home": 2.86, "goals_away": 0.54},
            {"home": "Leeds", "away": "Tottenham", "goals_home": 1.47, "goals_away": 1.3}]
SHORT = {"before_gw": [{"team": t, "rest": 3} for t in ("Arsenal", "Bournemouth", "Brighton", "Crystal Palace", "Manchester City", "Sunderland")]}


def preview(**kw):
    return {"gw": 10, "captains": CAPS_GW10, "fixtures": FIX_GW10, "congestion": SHORT, **kw}


def test_preview_rival_more_likely_top_scorer():
    h = preview_hooks(preview())
    assert h["fact"] == "captain_top_chance_rival"
    assert h["A"] == ("Haaland tops our GW10 captain projections, but Ødegaard (£6.7m) is likelier to outscore the other seven: 19% v 17%.")
    assert h["B"] == ("Which of our top eight GW10 captains is likeliest to outscore the rest? Not Haaland, "
                      "on our numbers: Ødegaard (£6.7m), 19% v 17%.")


def test_preview_low_top_chance_then_fixture_then_rest():
    caps = [dict(CAPS_GW10[0]), dict(CAPS_GW10[1], top_chance=0.10)]
    assert preview_hooks(preview(captains=caps))["fact"] == "captain_top_chance_low"
    caps[0]["top_chance"] = 0.4
    h = preview_hooks(preview(captains=caps))
    assert h["fact"] == "one_sided_fixture" and "2.9" in h["A"] and h["B"].endswith("2.9 goals expected for Arsenal.")
    assert preview_hooks(preview(captains=caps, fixtures=FIX_GW10[1:]))["fact"] == "short_rest"
    assert preview_hooks(preview(captains=caps, fixtures=FIX_GW10[1:], congestion={})) is None


def refl(goals, xg, exp, confirmed=True, captaincy=None):
    return {"gw": 9, "bonus_confirmed": confirmed, "goals": {"totals": {"matches": 10, "goals": goals, "xg": xg, "expected": exp}},
            "captaincy": captaincy or {}}


def test_reflection_goals():
    h = reflection_hooks(refl(21, 28.1, 28.9))
    assert h["A"] == "21 goals against 28.9 expected in GW9. The chances were there; the finishing wasn't."
    assert h["B"] == "Why only 21 goals in GW9, when 28.9 were expected? The chances were there; the finishing wasn't."
    h = reflection_hooks(refl(19, 23.1, 29.3, confirmed=False))   # GW8 shape: chances down too
    assert "The chances weren't there either." in h["A"] and h["A"].endswith("(Provisional: bonus not yet confirmed.)")
    assert reflection_hooks(refl(28, 28.0, 27.0)) is None


def test_reflection_captain():
    cap = {"weeks": [{"gw": 9, "premium": {"id": 411, "name": "Haaland", "pts": 2}, "best": {"id": 26, "name": "Havertz", "pts": 9, "own": 6}}],
           "ranges": [{"id": 300, "name": "Thiago", "pts": 9, "own": 9}, {"id": 411, "name": "Haaland", "pts": 2, "own": 79}]}
    h = reflection_hooks(refl(28, 28.0, 27.0, captaincy=cap))
    assert h["A"] == "Haaland scored 2 in GW9. The best captains, Havertz and Thiago, scored 9."


def test_hooks_fit_with_thread_marker_and_link():
    for h in (preview_hooks(preview()), reflection_hooks(refl(21, 28.1, 28.9, confirmed=False))):
        for k in ("A", "B"):
            assert x_len(h[k] + " 🧵 https://fixtureshark.com/fpl/gameweek/2026-27/10/preview") <= 280
            assert "bet" not in h[k].lower().split()
