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

# Continental and other tournaments with pages (competition name in the
# results file, edition-key prefix). Their rounds are derived from the games
# (intl_import.apply_derived); editions are clusters of games, not years.
CONTINENTAL = [
    ("Copa América", "COPA"),
    ("African Cup of Nations", "AFCON"),
    ("AFC Asian Cup", "ASIAN"),
    ("Gold Cup", "GOLD"),
    ("Confederations Cup", "CONFED"),
]

# Editions named for a different year from the one most games were played in.
OFFICIAL_LABELS = {
    ("African Cup of Nations", "2022"): "2021",   # played Jan-Feb 2022
    ("African Cup of Nations", "2024"): "2023",   # played Jan-Feb 2024
    ("AFC Asian Cup", "2024"): "2023",            # played Jan-Feb 2024
}

# Winners (and runners-up) of editions whose deciding games the derivation
# cannot place: two-legged finals, byes, unusual formats. Used only when no
# winner can be derived; where one can, the importer checks it agrees.
HAND_WINNERS = {
    ("Copa América", "1937"): ("Argentina", "Brazil"),         # play-off after a league
    ("Copa América", "1975"): ("Peru", "Colombia"),            # two-legged final and a play-off
    ("Copa América", "1979"): ("Paraguay", "Chile"),
    ("Copa América", "1983"): ("Uruguay", "Brazil"),
    ("African Cup of Nations", "1957"): ("Egypt", "Ethiopia"),  # three teams, Ethiopia a bye to the final
    ("African Cup of Nations", "1963"): ("Ghana", "Sudan"),
    ("African Cup of Nations", "1965"): ("Ghana", "Tunisia"),
    ("AFC Asian Cup", "1972"): ("Iran", "South Korea"),
    ("Confederations Cup", "1995"): ("Denmark", "Argentina"),
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


# ---------------------------------------------------------------------------
# Women's international football (intl_import.py --women; the intlw schema).
# Source: martj42/womens-international-results, same columns as the men's file
# (no former_names.csv). Tournament names change over the years in the file;
# the aliases give each lineage one name so its editions sit together and the
# pages match the men's (a name prefix maps, so "... qualification" follows).
# ---------------------------------------------------------------------------

WOMEN_COMPETITION_ALIASES = {
    "AFC Championship": "AFC Asian Cup",               # AFC Women's Championship, Asian Cup from 2006
    "African Championship": "African Cup of Nations",   # African Women's Championship, WAFCON from 2016
    "CONCACAF Gold Cup": "CONCACAF Championship",       # the W Gold Cup years of the W Championship
    "OFC Championship": "Oceania Nations Cup",          # OFC Women's Nations Cup
}

# Tournaments whose editions and rounds are worked out from the results.
WOMEN_CONTINENTAL = [
    ("FIFA World Cup", "WC"), ("UEFA Euro", "EURO"), ("Olympic Games", "OLY"), ("Copa América", "COPA"),
    ("African Cup of Nations", "AFCON"), ("AFC Asian Cup", "ASIAN"), ("CONCACAF Championship", "CONC"),
    ("Oceania Nations Cup", "OFC"), ("UEFA Nations League", "UNL"),
]

# Editions that don't split cleanly on a 120-day gap: (first day, last day, label).
WOMEN_EDITION_RANGES = {
    "UEFA Nations League": [("2023-09-01", "2024-03-31", "2023-24"), ("2025-02-01", "2025-12-31", "2025")],
}

WOMEN_CONFEDERATION = {
    "AFC Asian Cup": "AFC", "AFC Olympic Qualifying Tournament": "AFC",
    "CAF Olympic Qualifying Tournament": "CAF",
    "CONCACAF Championship": "CONCACAF", "CONCACAF Olympic Qualifying Tournament": "CONCACAF",
    "CONCACAF Olympic Qualifying Tournament qualification": "CONCACAF",
}

# The Olympic tournament is a senior women's championship (unlike the men's under-23 event).
WOMEN_ELO_K_50 = {"Olympic Games"}

# Winners and runners-up from the official record for women's editions whose
# deciding games the results can't settle (final rounds, two-legged finals,
# finals the file lists without a shoot-out). Checked against any derived final.
WOMEN_HAND_WINNERS = {
    ("UEFA Euro", "1984"): ("Sweden", "England"), ("UEFA Euro", "1989"): ("Germany", "Norway"),
    ("UEFA Euro", "1991"): ("Germany", "Norway"), ("UEFA Euro", "1993"): ("Norway", "Italy"),
    ("UEFA Euro", "1995"): ("Germany", "Sweden"), ("UEFA Euro", "2009"): ("Germany", "England"),
    ("UEFA Euro", "2013"): ("Germany", "Norway"), ("UEFA Euro", "2017"): ("Netherlands", "Denmark"),
    ("Olympic Games", "2016"): ("Germany", "Sweden"),
    ("Copa América", "1998"): ("Brazil", "Argentina"), ("Copa América", "2022"): ("Brazil", "Colombia"),
    ("Copa América", "2025"): ("Brazil", "Colombia"),
    ("African Cup of Nations", "1991"): ("Nigeria", "Cameroon"), ("African Cup of Nations", "1995"): ("Nigeria", "South Africa"),
    ("African Cup of Nations", "2002"): ("Nigeria", "Ghana"), ("African Cup of Nations", "2018"): ("Nigeria", "South Africa"),
    ("African Cup of Nations", "2022"): ("South Africa", "Morocco"),
    ("AFC Asian Cup", "1991"): ("China", "Japan"), ("AFC Asian Cup", "2006"): ("China", "Australia"),
    ("AFC Asian Cup", "2010"): ("Australia", "North Korea"), ("AFC Asian Cup", "2014"): ("Japan", "Australia"),
    ("AFC Asian Cup", "2018"): ("Japan", "Australia"), ("AFC Asian Cup", "2022"): ("China", "South Korea"),
    ("CONCACAF Championship", "2006"): ("United States", "Canada"), ("CONCACAF Championship", "2014"): ("United States", "Costa Rica"),
    ("Oceania Nations Cup", "1998"): ("Australia", "New Zealand"),
    ("UEFA Nations League", "2023-24"): ("Spain", "France"), ("UEFA Nations League", "2025"): ("Spain", "Germany"),
}

# Score corrections for the women's file (raw row kept): Brazil beat Venezuela
# 6-0 at the 1991 South American Championship; the file has 6-11.
WOMEN_SCORE_FIXES = {"1991-05-05|Brazil|Venezuela": (6, 0)}
