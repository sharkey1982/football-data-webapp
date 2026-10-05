# ============================================================================
# scripts/intl_static.py
#
# Hand-kept reference data for scripts/intl_import.py. Everything here is
# checked against the results by the importer, which refuses to load if a
# listed group does not match the teams that actually played each other.
# ============================================================================

# openfootball spells some teams differently from martj42/international_results,
# which files every team under its current lineage name (Soviet Union games are
# under Russia, West Germany under Germany).
OPENFOOTBALL_ALIASES = {
    "USA": "United States",
    "West Germany": "Germany",
    "East Germany": "German DR",
    "Soviet Union": "Russia",
    "Serbia and Montenegro": "Serbia",
    "Zaire": "DR Congo",
    "Dutch East Indies": "Indonesia",
    "Ireland": "Republic of Ireland",
    "Côte d'Ivoire": "Ivory Coast",
    "Bosnia & Herzegovina": "Bosnia and Herzegovina",
    "Bosnia-Herzegovina": "Bosnia and Herzegovina",
}

# Names whose lineage depends on the year: FR Yugoslavia (1992-2003) is filed
# under Serbia, the old Yugoslavia under Yugoslavia.
OPENFOOTBALL_YEAR_ALIASES = {"Yugoslavia": (1992, "Serbia")}

# fixturedownload.com (the Nations League fixture feed, same provider as the
# football fixture feeds). Unknown names fail the run; add them here.
FIXTURE_FEED_ALIASES = {
    "Türkiye": "Turkey",
    "Turkiye": "Turkey",
    "Czechia": "Czech Republic",
    "Ireland": "Republic of Ireland",
    "Rep. of Ireland": "Republic of Ireland",
    "Republic Of Ireland": "Republic of Ireland",
    "Bosnia-Herzegovina": "Bosnia and Herzegovina",
    "Bosnia & Herzegovina": "Bosnia and Herzegovina",
    "Bosnia and Herz.": "Bosnia and Herzegovina",
    "FYR Macedonia": "North Macedonia",
}

# Nations League: league-phase windows (first day, last day) and groups.
# 2019-22 group lists are from the Wikipedia edition pages (checked 5 Oct
# 2026); 2018/19 from memory -- the importer proves every list against the
# games played. Russia was in 2022/23 B2 but was suspended and played no game.
NATIONS_LEAGUE = {
    "2018-19": {
        "window": ("2018-09-01", "2018-11-30"),
        "groups": {
            "A1": ["Netherlands", "France", "Germany"],
            "A2": ["Switzerland", "Belgium", "Iceland"],
            "A3": ["Portugal", "Italy", "Poland"],
            "A4": ["England", "Spain", "Croatia"],
            "B1": ["Ukraine", "Slovakia", "Czech Republic"],
            "B2": ["Sweden", "Russia", "Turkey"],
            "B3": ["Bosnia and Herzegovina", "Austria", "Northern Ireland"],
            "B4": ["Denmark", "Wales", "Republic of Ireland"],
            "C1": ["Scotland", "Albania", "Israel"],
            "C2": ["Finland", "Hungary", "Greece", "Estonia"],
            "C3": ["Norway", "Bulgaria", "Cyprus", "Slovenia"],
            "C4": ["Serbia", "Montenegro", "Romania", "Lithuania"],
            "D1": ["Georgia", "Kazakhstan", "Latvia", "Andorra"],
            "D2": ["Belarus", "Luxembourg", "Moldova", "San Marino"],
            "D3": ["Kosovo", "Azerbaijan", "Faroe Islands", "Malta"],
            "D4": ["North Macedonia", "Gibraltar", "Armenia", "Liechtenstein"],
        },
    },
    "2020-21": {
        "window": ("2020-09-01", "2020-11-30"),
        "groups": {
            "A1": ["Italy", "Netherlands", "Poland", "Bosnia and Herzegovina"],
            "A2": ["Belgium", "Denmark", "England", "Iceland"],
            "A3": ["France", "Portugal", "Croatia", "Sweden"],
            "A4": ["Spain", "Germany", "Switzerland", "Ukraine"],
            "B1": ["Austria", "Norway", "Romania", "Northern Ireland"],
            "B2": ["Czech Republic", "Scotland", "Israel", "Slovakia"],
            "B3": ["Hungary", "Russia", "Serbia", "Turkey"],
            "B4": ["Wales", "Finland", "Republic of Ireland", "Bulgaria"],
            "C1": ["Montenegro", "Luxembourg", "Azerbaijan", "Cyprus"],
            "C2": ["Armenia", "North Macedonia", "Georgia", "Estonia"],
            "C3": ["Slovenia", "Greece", "Kosovo", "Moldova"],
            "C4": ["Albania", "Belarus", "Lithuania", "Kazakhstan"],
            "D1": ["Gibraltar", "Liechtenstein", "San Marino"],
            "D2": ["Faroe Islands", "Malta", "Latvia", "Andorra"],
        },
    },
    "2022-23": {
        "window": ("2022-06-01", "2022-09-30"),
        "groups": {
            "A1": ["Croatia", "Denmark", "France", "Austria"],
            "A2": ["Spain", "Portugal", "Switzerland", "Czech Republic"],
            "A3": ["Italy", "Hungary", "Germany", "England"],
            "A4": ["Netherlands", "Belgium", "Poland", "Wales"],
            "B1": ["Scotland", "Ukraine", "Republic of Ireland", "Armenia"],
            "B2": ["Israel", "Iceland", "Albania"],
            "B3": ["Bosnia and Herzegovina", "Finland", "Montenegro", "Romania"],
            "B4": ["Serbia", "Norway", "Slovenia", "Sweden"],
            "C1": ["Turkey", "Luxembourg", "Faroe Islands", "Lithuania"],
            "C2": ["Greece", "Kosovo", "Northern Ireland", "Cyprus"],
            "C3": ["Kazakhstan", "Azerbaijan", "Slovakia", "Belarus"],
            "C4": ["Georgia", "Bulgaria", "North Macedonia", "Gibraltar"],
            "D1": ["Latvia", "Moldova", "Andorra", "Liechtenstein"],
            "D2": ["Estonia", "Malta", "San Marino"],
        },
    },
    "2024-25": {
        "window": ("2024-09-01", "2024-11-30"),
        "groups": {
            "A1": ["Portugal", "Croatia", "Scotland", "Poland"],
            "A2": ["France", "Italy", "Belgium", "Israel"],
            "A3": ["Germany", "Netherlands", "Hungary", "Bosnia and Herzegovina"],
            "A4": ["Spain", "Denmark", "Serbia", "Switzerland"],
            "B1": ["Czech Republic", "Ukraine", "Georgia", "Albania"],
            "B2": ["England", "Greece", "Republic of Ireland", "Finland"],
            "B3": ["Norway", "Austria", "Slovenia", "Kazakhstan"],
            "B4": ["Wales", "Turkey", "Iceland", "Montenegro"],
            "C1": ["Sweden", "Slovakia", "Estonia", "Azerbaijan"],
            "C2": ["Romania", "Kosovo", "Cyprus", "Lithuania"],
            "C3": ["Northern Ireland", "Bulgaria", "Belarus", "Luxembourg"],
            "C4": ["North Macedonia", "Armenia", "Faroe Islands", "Latvia"],
            "D1": ["San Marino", "Gibraltar", "Liechtenstein"],
            "D2": ["Moldova", "Malta", "Andorra"],
        },
    },
    # 2026/27 groups come from the fixture feed (its Group field).
    "2026-27": {"window": ("2026-09-01", "2026-11-30"), "groups": None},
}

# Nations League games outside the league-phase windows: knockouts, finals,
# promotion/relegation play-offs and play-outs, by edition.
NATIONS_LEAGUE_LATER = {
    "2018-19": ("2019-01-01", "2019-12-31"),
    "2020-21": ("2021-01-01", "2022-05-31"),   # Finals Oct 2021; League C play-outs Mar 2022
    "2022-23": ("2022-10-01", "2024-05-31"),   # Finals Jun 2023; League C play-outs Mar 2024
    "2024-25": ("2024-12-01", "2025-12-31"),   # QFs and play-offs Mar 2025; Finals Jun 2025
    "2026-27": ("2026-12-01", "2027-12-31"),
}

# Knockout draws settled by drawing lots (no shoot-out, no replay).
COIN_TOSSES = {"1968-06-05|Italy|Russia": "Italy"}   # Euro 1968 semi-final

# Rounds the derivation in intl_import.apply_derived cannot infer. Euro 1980
# had no semi-finals: the group winners met in the final, the runners-up in
# the third-place play-off.
STAGE_OVERRIDES = {"1980-06-21|Italy|Czechoslovakia": "3P", "1980-06-22|Belgium|Germany": "F"}

# Venue corrections to the results file, each checked against the match
# report. The key is the match key; the value replaces city, country and
# neutral. The raw source row is kept unchanged.
VENUE_FIXES = {
    # Euro 2020 group A, played at the Baku Olympic Stadium (the file has Cardiff).
    "2021-06-12|Wales|Switzerland": ("Baku", "Azerbaijan", True),
}

# CONMEBOL has no qualifying competition in the results to infer it from.
CONMEBOL = {"Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador",
            "Paraguay", "Peru", "Uruguay", "Venezuela"}

# Competitions whose participants belong to one confederation; a team's
# confederation is that of its most recent such game (Australia: OFC to AFC).
CONFEDERATION_OF_COMPETITION = {
    "UEFA Euro qualification": "UEFA", "UEFA Euro": "UEFA", "UEFA Nations League": "UEFA",
    "African Cup of Nations qualification": "CAF", "African Cup of Nations": "CAF",
    "AFC Asian Cup qualification": "AFC",
    "CONCACAF Nations League": "CONCACAF", "CONCACAF Nations League qualification": "CONCACAF",
    "Gold Cup qualification": "CONCACAF", "CONCACAF Championship qualification": "CONCACAF",
    "Oceania Nations Cup": "OFC", "Oceania Nations Cup qualification": "OFC",
}

# Elo K-factor by competition, World Football Elo style: 60 World Cup finals;
# 50 continental finals and the Nations League finals stage; 40 World Cup and
# continental qualifiers and the Nations League; 30 other tournaments;
# 20 friendlies.
ELO_K_60 = {"FIFA World Cup"}
ELO_K_50 = {"UEFA Euro", "Copa América", "African Cup of Nations", "AFC Asian Cup", "Gold Cup",
            "CONCACAF Championship", "Oceania Nations Cup", "Confederations Cup"}
ELO_K_40_SUFFIX = " qualification"
ELO_K_40 = {"UEFA Nations League", "CONCACAF Nations League"}
