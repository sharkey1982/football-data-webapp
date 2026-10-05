#!/usr/bin/env python3
# ============================================================================
# scripts/intl_import.py
#
# Daily load of men's international football (workflow intl-import.yml) into
# the intl schema. Kept separate from the football, NFL and tennis imports so
# a failure here never touches them.
#
# Sources (all reachable from GitHub Actions):
#   martj42/international_results (CC0)  every result since 1872, scorers,
#       shoot-outs, former names. Teams are filed under their current lineage
#       name (Soviet Union games are under Russia); former_names.csv gives the
#       name used at the time.
#   openfootball worldcup.json / euro.json (CC0)  round, group and the
#       90-minute / extra-time split for every World Cup and Euro 2020+.
#   fixturedownload.com  the 2026/27 Nations League fixture list with groups
#       and kick-off times (same provider as the football fixture feeds).
#
# Read first, then settle: every source is read and every check passes before
# anything is written. Then it reconciles each year against the file on match
# count, goals and a hash of the match keys; any difference fails the run.
# One pipeline_runs row (job_name intl_import) per run.
#
#   python scripts/intl_import.py                  read, check, load
#   python scripts/intl_import.py --dry-run        read and check only
#   python scripts/intl_import.py --source-dir D   read the files from D
# ============================================================================

import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from intl_static import (COIN_TOSSES, CONFEDERATION_OF_COMPETITION, CONMEBOL, ELO_K_40, ELO_K_40_SUFFIX, ELO_K_50,
                         ELO_K_60, FIXTURE_FEED_ALIASES, NATIONS_LEAGUE, NATIONS_LEAGUE_LATER,
                         OPENFOOTBALL_ALIASES, OPENFOOTBALL_YEAR_ALIASES, STAGE_OVERRIDES, VENUE_FIXES,
                         CONTINENTAL, HAND_WINNERS, OFFICIAL_LABELS)

RAW = "https://raw.githubusercontent.com"
RESULTS_BASE = f"{RAW}/martj42/international_results/master"
WC_URL = f"{RAW}/openfootball/worldcup.json/master/{{year}}/worldcup.json"
EURO_URL = f"{RAW}/openfootball/euro.json/master/{{year}}/euro.json"
NL_FEED_URL = "https://fixturedownload.com/feed/json/nations-league-2026"
USER_AGENT = "Mozilla/5.0 (compatible; fixtureshark-intl-importer/1.0)"
BATCH = 2000

WC, EURO, UNL = "FIFA World Cup", "UEFA Euro", "UEFA Nations League"
ROUND_ROBIN, KNOCKOUT = "round_robin", "knockout"

# Stage code -> (name, type, order). Order sorts stages inside an edition.
STAGES = {
    "PRE": ("Preliminary round", KNOCKOUT, 5),
    "R1": ("First round", KNOCKOUT, 10),
    "GRP": ("Group stage", ROUND_ROBIN, 10),
    "GPO": ("Group play-off", KNOCKOUT, 15),
    "GRP2": ("Second group stage", ROUND_ROBIN, 20),
    "FR": ("Final round", ROUND_ROBIN, 90),
    "R32": ("Round of 32", KNOCKOUT, 30),
    "R16": ("Round of 16", KNOCKOUT, 40),
    "QF": ("Quarter-finals", KNOCKOUT, 50),
    "SF": ("Semi-finals", KNOCKOUT, 60),
    "3P": ("Third-place play-off", KNOCKOUT, 70),
    "F": ("Final", KNOCKOUT, 80),
    "LP": ("League phase", ROUND_ROBIN, 10),
    "PO_AB": ("League A/B play-offs", KNOCKOUT, 45),
    "PO_BC": ("League B/C play-offs", KNOCKOUT, 46),
    "PO_CD": ("League C/D play-offs", KNOCKOUT, 47),
    "PO_C": ("League C play-outs", KNOCKOUT, 48),
    "PO": ("Play-off", KNOCKOUT, 95),
    "ALL": ("Games", KNOCKOUT, 99),
}

OPENFOOTBALL_ROUNDS = {
    "preliminary round": "PRE", "first round": "R1", "first round, replays": "R1",
    "round of 32": "R32", "round of 16": "R16",
    "quarter-final": "QF", "quarter-finals": "QF", "quarterfinals": "QF", "quarter-finals, replays": "QF",
    "semi-final": "SF", "semi-finals": "SF", "semifinals": "SF",
    "match for third place": "3P", "third place match": "3P", "third-place match": "3P",
    "third place play-off": "3P", "third-place play-off": "3P",
    "final": "F", "final round": "FR",
}


class ImportCheckFailed(Exception):
    pass


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------

def fetch_text(url: str) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def read_sources(source_dir: str | None) -> dict:
    """All inputs as plain Python structures. With source_dir, files are read
    from disk in the same layout as the repos (for tests and dry runs)."""
    def get(rel_local: str, url: str) -> str | None:
        if source_dir:
            p = os.path.join(source_dir, rel_local)
            return open(p, encoding="utf-8").read() if os.path.exists(p) else None
        return fetch_text(url)

    def csv_rows(name: str) -> list[dict]:
        text = get(f"international_results/{name}", f"{RESULTS_BASE}/{name}")
        if text is None:
            raise ImportCheckFailed(f"{name} not found")
        return list(csv.DictReader(io.StringIO(text)))

    src = {n: csv_rows(f"{n}.csv") for n in ("results", "goalscorers", "shootouts", "former_names")}
    years = lambda comp: sorted({r["date"][:4] for r in src["results"] if r["tournament"] == comp})
    src["worldcup"] = {}
    for y in years(WC):
        text = get(f"worldcup.json/{y}/worldcup.json", WC_URL.format(year=y))
        if text is None:
            raise ImportCheckFailed(f"openfootball World Cup {y} not found")
        src["worldcup"][y] = json.loads(text)
    src["euro"] = {}
    for y in years(EURO):
        label = euro_label(y)
        text = get(f"euro.json/{label}/euro.json", EURO_URL.format(year=label))
        if text is not None:
            src["euro"][label] = json.loads(text)
    # The fixture feed is a convenience: if it is down or refuses us, results
    # still load and the run notes it (check intl_results_lag watches the gap).
    try:
        feed = get("fixturedownload/nations-league-2026.json", NL_FEED_URL)
        src["nl_feed"] = json.loads(feed) if feed else None
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        print(f"::warning::Nations League fixture feed not read: {e}")
        src["nl_feed"] = None
    return src


def euro_label(year: str) -> str:
    # Euro 2020 was played in 2021 and kept its name.
    return "2020" if year == "2021" else year


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def score(v: str) -> int | None:
    v = (v or "").strip()
    return None if v in ("", "NA") else int(v)


def pair(a: str, b: str) -> frozenset:
    return frozenset((a, b))


def shift_day(d: str, days: int) -> str:
    from datetime import date, timedelta
    return (date.fromisoformat(d) + timedelta(days=days)).isoformat()


def nl_edition_of(d: str) -> tuple[str, str] | None:
    """(edition, 'league' | 'later') for a Nations League game date."""
    for ed, spec in NATIONS_LEAGUE.items():
        lo, hi = spec["window"]
        if lo <= d <= hi:
            return ed, "league"
    for ed, (lo, hi) in NATIONS_LEAGUE_LATER.items():
        if lo <= d <= hi:
            return ed, "later"
    return None


# ---------------------------------------------------------------------------
# Building
# ---------------------------------------------------------------------------

@dataclass
class Build:
    teams: list = field(default_factory=list)
    team_names: list = field(default_factory=list)
    competitions: list = field(default_factory=list)
    editions: list = field(default_factory=list)
    stages: list = field(default_factory=list)
    groups: list = field(default_factory=list)
    group_members: list = field(default_factory=list)
    matches: list = field(default_factory=list)
    goals: list = field(default_factory=list)
    shootouts: list = field(default_factory=list)
    fixtures: list = field(default_factory=list)
    notes: list = field(default_factory=list)


def build(src: dict) -> Build:
    out = Build()
    results = src["results"]

    # Matches, keyed date|home|away with a sequence for the one true duplicate.
    seen = Counter()
    matches = []
    for r in results:
        hs, as_ = score(r["home_score"]), score(r["away_score"])
        if hs is None or as_ is None:
            continue  # the file lists a few scheduled games without scores
        base = f"{r['date']}|{r['home_team']}|{r['away_team']}"
        seen[base] += 1
        key = base if seen[base] == 1 else f"{base}|{seen[base]}"
        matches.append({
            "match_key": key, "match_date": r["date"], "home_team": r["home_team"], "away_team": r["away_team"],
            "home_score": hs, "away_score": as_, "competition": r["tournament"],
            "city": r["city"] or None, "country": r["country"] or None,
            "neutral": r["neutral"].strip().upper() == "TRUE",
            "edition_key": None, "stage_code": None, "group_label": None, "matchday": None,
            "home_score_90": None, "away_score_90": None, "went_extra_time": None,
            "shootout_winner": None, "raw": r,
        })
    for m in matches:
        fix = VENUE_FIXES.get(m["match_key"])
        if fix:
            m["city"], m["country"], m["neutral"] = fix
            out.notes.append(f"venue corrected: {m['match_key']} -> {fix[0]}, {fix[1]}")
    by_day_pair = defaultdict(list)
    for m in matches:
        by_day_pair[(m["match_date"], pair(m["home_team"], m["away_team"]))].append(m)

    team_set = {t for m in matches for t in (m["home_team"], m["away_team"])}

    # Shoot-outs.
    for s in src["shootouts"]:
        hits = by_day_pair.get((s["date"], pair(s["home_team"], s["away_team"])), [])
        hits = [m for m in hits if m["home_team"] == s["home_team"]] or hits
        if len(hits) != 1:
            out.notes.append(f"shoot-out without a unique match: {s['date']} {s['home_team']} v {s['away_team']}")
            continue
        m = hits[0]
        m["shootout_winner"] = s["winner"]
        out.shootouts.append({"match_key": m["match_key"], "winner": s["winner"],
                              "first_shooter": s.get("first_shooter") or None})

    # Goals, in file order within each match.
    goal_seq = Counter()
    unmatched_goals = 0
    for g in src["goalscorers"]:
        hits = [m for m in by_day_pair.get((g["date"], pair(g["home_team"], g["away_team"])), [])
                if m["home_team"] == g["home_team"]]
        if len(hits) != 1:
            unmatched_goals += 1
            continue
        k = hits[0]["match_key"]
        goal_seq[k] += 1
        minute = (g.get("minute") or "").strip()
        out.goals.append({"match_key": k, "seq": goal_seq[k], "team": g["team"], "scorer": g["scorer"] or None,
                          "minute": int(float(minute)) if minute not in ("", "NA") else None,
                          "own_goal": g["own_goal"].strip().upper() == "TRUE",
                          "penalty": g["penalty"].strip().upper() == "TRUE"})
    if unmatched_goals:
        out.notes.append(f"{unmatched_goals} goal rows without a unique match (left out)")

    # Tournaments.
    stage_tournament(out, matches, by_day_pair, src, WC, "WC", src["worldcup"])
    stage_tournament(out, matches, by_day_pair, src, EURO, "EURO", src["euro"])
    for comp, code in CONTINENTAL:
        stage_continental(out, matches, comp, code)
    stage_nations_league(out, matches, src)

    # 90-minute scores are known for every round-robin game and friendly.
    stage_type = {s["stage_key"]: s["type"] for s in out.stages}
    for m in matches:
        if m["home_score_90"] is not None:
            continue
        st = stage_type.get(f"{m['edition_key']}|{m['stage_code']}") if m["edition_key"] else None
        if st == ROUND_ROBIN or m["competition"] == "Friendly":
            m["home_score_90"], m["away_score_90"], m["went_extra_time"] = m["home_score"], m["away_score"], False

    # Elo, in date then file order.
    elo(matches)

    # Teams: lineage name, confederation from the latest single-confederation game.
    former = defaultdict(list)
    for f in src["former_names"]:
        former[f["current"]].append(f)
    first, last = {}, {}
    games = Counter()
    conf = {}
    for m in matches:
        for t in (m["home_team"], m["away_team"]):
            first.setdefault(t, m["match_date"])
            last[t] = max(last.get(t, m["match_date"]), m["match_date"])
            games[t] += 1
            c = CONFEDERATION_OF_COMPETITION.get(m["competition"])
            if c:
                conf[t] = (m["match_date"], c) if t not in conf or m["match_date"] >= conf[t][0] else conf[t]
    slugs = Counter()
    for t in sorted(team_set):
        s = slugify(t)
        slugs[s] += 1
        out.teams.append({"team": t, "slug": s if slugs[s] == 1 else f"{s}-{slugs[s]}",
                          "confederation": "CONMEBOL" if t in CONMEBOL else (conf[t][1] if t in conf else None),
                          "first_match": first[t], "last_match": last[t], "matches": games[t]})
        for f in former.get(t, []):
            out.team_names.append({"team": t, "name": f["former"], "valid_from": f["start_date"],
                                   "valid_to": f["end_date"]})
    missing = sorted({f["current"] for f in src["former_names"]} - team_set)
    if missing:
        out.notes.append(f"former_names lineages with no matches: {', '.join(missing)}")

    # Competitions.
    comp_count = Counter(m["competition"] for m in matches)
    comp_slugs = Counter()
    for name, n in sorted(comp_count.items()):
        s = slugify(name)
        comp_slugs[s] += 1
        kind = ("friendly" if name == "Friendly" else "qualifying" if "qualification" in name
                else "nations_league" if "Nations League" in name else "tournament")
        out.competitions.append({"name": name, "slug": s if comp_slugs[s] == 1 else f"{s}-{comp_slugs[s]}",
                                 "kind": kind, "confederation": CONFEDERATION_OF_COMPETITION.get(name),
                                 "matches": n})

    out.matches = matches
    check_build(out, src)
    return out


def stage_tournament(out: Build, matches: list, by_day_pair: dict, src: dict, comp: str, code: str, of: dict) -> None:
    """World Cups and Euros: an edition per year; round and group from
    openfootball where it has the year, otherwise derived from the games."""
    by_year = defaultdict(list)
    for m in matches:
        if m["competition"] == comp:
            by_year[euro_label(m["match_date"][:4]) if comp == EURO else m["match_date"][:4]].append(m)
    for year, games in sorted(by_year.items()):
        ed = f"{code}-{year}"
        teams = {t for m in games for t in (m["home_team"], m["away_team"])}
        hosts = sorted({m["country"] for m in games if m["country"]})  # every country that staged a game
        out.editions.append({"edition_key": ed, "competition": comp, "label": year, "season_start": int(year),
                             "teams": len(teams), "matches": len(games), "hosts": hosts,
                             "first_match": min(m["match_date"] for m in games),
                             "last_match": max(m["match_date"] for m in games),
                             "stage_source": "openfootball" if year in of else "derived"})
        for m in games:
            m["edition_key"] = ed
        if year in of:
            apply_openfootball(out, ed, year, games, by_day_pair, of[year], comp)
        else:
            apply_derived(out, ed, games)
        add_stage_rows(out, ed, games)


def derived_winner(games: list) -> tuple[str | None, str | None]:
    """(winner, runner-up) from derived stages: the last Final game, else the
    last play-off game, else the top two of a final round (2 points a win)."""
    for code in ("F", "PO"):
        g = [m for m in games if m["stage_code"] == code]
        if g:
            w = winner_of(g[-1])
            if w is None:
                return None, None
            return w, g[-1]["away_team"] if w == g[-1]["home_team"] else g[-1]["home_team"]
    fr = [m for m in games if m["stage_code"] == "FR"]
    if fr:
        pts, gd = Counter(), Counter()
        for m in fr:
            for t, a, b in ((m["home_team"], m["home_score"], m["away_score"]), (m["away_team"], m["away_score"], m["home_score"])):
                pts[t] += 2 if a > b else 1 if a == b else 0
                gd[t] += a - b
        order = sorted(pts, key=lambda t: (-pts[t], -gd[t]))
        return order[0], order[1] if len(order) > 1 else None
    return None, None


def stage_continental(out: Build, matches: list, comp: str, code: str) -> None:
    """A continental tournament: editions are runs of games with no gap of more
    than 120 days, named by the year most were played in (or the official
    name, OFFICIAL_LABELS); a second edition in the same year adds its host."""
    from datetime import date
    games = sorted((m for m in matches if m["competition"] == comp), key=lambda m: (m["match_date"], m["match_key"]))
    clusters, last = [], None
    for m in games:
        d = date.fromisoformat(m["match_date"])
        if last is None or (d - last).days > 120:
            clusters.append([])
        clusters[-1].append(m)
        last = d
    used = set()
    for cl in clusters:
        year = Counter(m["match_date"][:4] for m in cl).most_common(1)[0][0]
        label = OFFICIAL_LABELS.get((comp, year), year)
        hosts = sorted({m["country"] for m in cl if m["country"]})
        if label in used:
            label = f"{label}-{slugify(hosts[0]) if hosts else 'b'}"
        used.add(label)
        ed = f"{code}-{label}"
        for m in cl:
            m["edition_key"] = ed
        placed = apply_derived(out, ed, cl, strict=False)
        dw, dr = derived_winner(cl)
        hand = HAND_WINNERS.get((comp, label))
        if hand and dw and hand[0] != dw:
            raise ImportCheckFailed(f"{ed}: hand winner {hand[0]} but the final says {dw}")
        teams = {t for m in cl for t in (m["home_team"], m["away_team"])}
        if hand and not ({hand[0], hand[1]} <= teams):
            raise ImportCheckFailed(f"{ed}: hand winner/runner-up not in the edition: {hand}")
        winner, runner = (dw, dr) if dw else (hand or (None, None))
        if not placed:
            out.notes.append(f"{ed}: rounds not derived; games listed only")
        out.editions.append({"edition_key": ed, "competition": comp, "label": label, "season_start": int(label[:4]),
                             "teams": len(teams), "matches": len(cl), "hosts": hosts,
                             "first_match": cl[0]["match_date"], "last_match": cl[-1]["match_date"],
                             "stage_source": "derived" if placed else "games only",
                             "winner": winner, "runner_up": runner})
        add_stage_rows(out, ed, cl)


def apply_openfootball(out: Build, ed: str, year: str, games: list, by_day_pair: dict, doc: dict, comp: str) -> None:
    played = [x for x in doc["matches"] if x.get("score") not in (None, {}, [])]
    used = set()
    for x in played:
        t1, t2 = of_name(x["team1"], year), of_name(x["team2"], year)
        hits = []
        for shift in (0, -1, 1):
            hits = [m for m in by_day_pair.get((shift_day(x["date"], shift), pair(t1, t2)), [])
                    if m["competition"] == comp and m["match_key"] not in used]
            if hits:
                break
        if len(hits) != 1:
            raise ImportCheckFailed(f"{ed}: openfootball game {x['date']} {t1} v {t2} matches {len(hits)} results")
        m = hits[0]
        used.add(m["match_key"])
        rnd = (x.get("round") or "").strip()
        grp = x.get("group")
        if grp:
            letter = grp.replace("Group", "").strip()
            second = ed.startswith("WC-") and year in ("1974", "1978", "1982") and letter.isalpha()
            m["stage_code"], m["group_label"] = ("GRP2" if second else "GRP"), letter
            md = re.search(r"(\d+)$", rnd)
            m["matchday"] = int(md.group(1)) if md else None
        elif re.fullmatch(r"Group [A-F]", rnd):          # Euro 2020 knockout-era file names rounds by group
            m["stage_code"], m["group_label"] = "GRP", rnd[-1]
        elif re.fullmatch(r"Group \d Play-off", rnd):
            m["stage_code"], m["group_label"] = "GPO", rnd.split()[1]
        else:
            code = OPENFOOTBALL_ROUNDS.get(rnd.lower())
            if not code:
                raise ImportCheckFailed(f"{ed}: unknown openfootball round {rnd!r}")
            m["stage_code"] = code
        sc = x["score"]
        flip = m["home_team"] != t1
        if isinstance(sc, dict) and "ft" in sc:
            ft = sc["ft"][::-1] if flip else sc["ft"]
            m["home_score_90"], m["away_score_90"] = ft
            m["went_extra_time"] = "et" in sc
            final = sc.get("et", sc["ft"])
            final = final[::-1] if flip else final
            if list(final) != [m["home_score"], m["away_score"]]:
                out.notes.append(f"{ed}: score differs from openfootball for {m['match_key']} ({final})")
    if len(used) != len(games):
        left = [m["match_key"] for m in games if m["match_key"] not in used]
        raise ImportCheckFailed(f"{ed}: {len(left)} results not in openfootball: {left[:5]}")


def of_name(name: str, year: str) -> str:
    if name in OPENFOOTBALL_YEAR_ALIASES and int(year) >= OPENFOOTBALL_YEAR_ALIASES[name][0]:
        return OPENFOOTBALL_YEAR_ALIASES[name][1]
    return OPENFOOTBALL_ALIASES.get(name, name)


def winner_of(m: dict) -> str | None:
    if m["home_score"] > m["away_score"]:
        return m["home_team"]
    if m["away_score"] > m["home_score"]:
        return m["away_team"]
    return m["shootout_winner"] or COIN_TOSSES.get(m["match_key"])


def apply_derived(out: Build, ed: str, games: list, strict: bool = True) -> bool:
    """Stages from the games alone, for editions without openfootball labels.

    Group phases: the longest run of games, from the start, that forms
    complete round robins (every pair in a group meets the same number of
    times, once or home and away; groups of three or more). A first phase
    that is one group of every team is a final round (a league tournament).
    A second run of round robins is a second group stage. The rest are
    knockouts, named by how many teams are left; a repeated tie after a draw
    is a replay; two semi-final losers meeting is the third-place play-off;
    games after a league tournament between the teams level at the top are a
    play-off.

    Returns True when every game got a stage. With strict=False, games that
    cannot be placed are put in one "Games" stage (ALL) instead of failing."""
    games.sort(key=lambda m: (m["match_date"], m["match_key"]))
    for m in games:
        m["stage_code"] = STAGE_OVERRIDES.get(m["match_key"])
        m["group_label"] = None
    rest = [m for m in games if m["stage_code"] is None]
    all_teams = {t for m in games for t in (m["home_team"], m["away_team"])}
    league = False
    for phase in range(2):
        split = 0
        for n in range(len(rest), 0, -1):
            if is_round_robins(rest[:n]):
                split = n
                break
        if split == 0:
            break
        block, rest = rest[:split], rest[split:]
        comps = sorted(components(block), key=lambda c: min(m["match_date"] for m in block if m["home_team"] in c))
        if phase == 0 and len(comps) == 1 and comps[0] == all_teams:
            league = True
            for m in block:
                m["stage_code"] = "FR"
            continue
        if phase == 1 and len(comps) == 1 and not rest:
            for m in block:  # a final group decides the edition
                m["stage_code"] = "FR"
            continue
        code = "GRP" if phase == 0 else "GRP2"
        for i, comp in enumerate(comps):
            label = "ABCDEFGHIJKL"[i] if len(comps) > 1 else None
            for m in block:
                if m["home_team"] in comp:
                    m["stage_code"], m["group_label"] = code, label
    if not rest:
        return True
    try:
        if league:
            # Play-offs between the teams level at the top of a league tournament.
            if len({t for m in rest for t in (m["home_team"], m["away_team"])}) == 2:
                for m in rest:
                    m["stage_code"] = "PO"
                return True
            raise ImportCheckFailed(f"{ed}: games after a league tournament that are not a two-team play-off")
        name_knockouts(ed, rest)
        return True
    except ImportCheckFailed:
        if strict:
            raise
        for m in rest:
            m["stage_code"], m["group_label"] = "ALL", None
        return False


def name_knockouts(ed: str, ko: list) -> None:
    alive = {t for m in ko for t in (m["home_team"], m["away_team"])}
    sf_losers = set()
    i = 0
    while i < len(ko):
        n_teams = len(alive)
        code = {32: "R32", 16: "R16", 8: "QF", 4: "SF", 2: "F"}.get(n_teams)
        round_games = []
        playing = set()
        while i < len(ko) and len(round_games) < n_teams // 2:
            m = ko[i]
            if not ({m["home_team"], m["away_team"]} <= alive):
                break
            round_games.append(m)
            playing |= {m["home_team"], m["away_team"]}
            i += 1
        if not code or not round_games:
            raise ImportCheckFailed(f"{ed}: cannot name knockout round with {n_teams} teams left")
        for m in round_games:
            m["stage_code"] = code
        # Replays: a drawn game with no shoot-out is played again.
        while i < len(ko) and any(pair(ko[i]["home_team"], ko[i]["away_team"]) == pair(g["home_team"], g["away_team"])
                                  and winner_of(g) is None for g in round_games):
            ko[i]["stage_code"] = code
            round_games.append(ko[i])
            i += 1
        winners = {winner_of(m) for m in round_games} - {None}
        if code == "SF":
            sf_losers = playing - winners
        alive = winners
        if code == "SF" and i < len(ko) and {ko[i]["home_team"], ko[i]["away_team"]} == sf_losers:
            ko[i]["stage_code"] = "3P"
            i += 1
        if code == "F":
            break
        # A third-place game played after the final.
        if code == "SF" and i + 1 < len(ko) and {ko[i + 1]["home_team"], ko[i + 1]["away_team"]} == sf_losers:
            ko[i + 1]["stage_code"] = "3P"
    for m in ko:
        if m["stage_code"] is None:
            raise ImportCheckFailed(f"{ed}: knockout game {m['match_key']} left without a round")


def components(games: list) -> list[set]:
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for m in games:
        parent[find(m["home_team"])] = find(m["away_team"])
    groups = defaultdict(set)
    for t in list(parent):
        groups[find(t)].add(t)
    return list(groups.values())


def is_round_robins(games: list) -> bool:
    """Every component is a group of three or more in which every pair met
    the same number of times (once, or home and away)."""
    pairs = Counter(pair(m["home_team"], m["away_team"]) for m in games)
    for c in components(games):
        if len(c) < 3:
            return False
        inside = [v for p, v in pairs.items() if p <= c]
        if len(inside) != len(c) * (len(c) - 1) // 2 or len(set(inside)) != 1 or inside[0] > 2:
            return False
    return True


def add_stage_rows(out: Build, ed: str, games: list) -> None:
    codes = {m["stage_code"] for m in games}
    for c in sorted(codes, key=lambda c: STAGES[c][2]):
        name, typ, order = STAGES[c]
        out.stages.append({"stage_key": f"{ed}|{c}", "edition_key": ed, "code": c, "name": name,
                           "type": typ, "stage_order": order})
    members = defaultdict(set)
    for m in games:
        if m["group_label"] and STAGES[m["stage_code"]][1] == ROUND_ROBIN:
            members[(m["stage_code"], m["group_label"])] |= {m["home_team"], m["away_team"]}
    for (c, g), teams in sorted(members.items()):
        gk = f"{ed}|{c}|{g}"
        out.groups.append({"group_key": gk, "stage_key": f"{ed}|{c}", "label": g, "league": None,
                           "size": len(teams)})
        out.group_members += [{"group_key": gk, "team": t} for t in sorted(teams)]


def stage_nations_league(out: Build, matches: list, src: dict) -> None:
    nl = [m for m in matches if m["competition"] == UNL]
    feed_groups = feed_nations_league(out, src)
    by_ed = defaultdict(list)
    for m in nl:
        where = nl_edition_of(m["match_date"])
        if not where:
            raise ImportCheckFailed(f"Nations League game outside every edition window: {m['match_key']}")
        by_ed[where[0]].append((m, where[1]))
    for ed_label, spec in NATIONS_LEAGUE.items():
        rows = by_ed.get(ed_label, [])
        groups = spec["groups"] or feed_groups
        if not rows and (spec["groups"] or not groups):
            continue  # no games yet and no fixture list to show
        ed = f"UNL-{ed_label}"
        league_games = [m for m, part in rows if part == "league"]
        later = [m for m, part in rows if part == "later"]
        group_of = {t: g for g, ts in (groups or {}).items() for t in ts}
        if spec["groups"]:
            check_groups(ed, league_games, spec["groups"])
        for m in league_games:
            g = group_of.get(m["home_team"])
            if g is None or group_of.get(m["away_team"]) != g:
                raise ImportCheckFailed(f"{ed}: league game across groups {m['match_key']}")
            m["edition_key"], m["stage_code"], m["group_label"] = ed, "LP", g
        classify_nl_later(ed, later, group_of)
        all_games = league_games + later
        teams = set(group_of) | {t for m in all_games for t in (m["home_team"], m["away_team"])}
        out.editions.append({"edition_key": ed, "competition": UNL, "label": ed_label,
                             "season_start": int(ed_label[:4]), "teams": len(teams), "matches": len(all_games),
                             "hosts": [], "first_match": min((m["match_date"] for m in all_games), default=None),
                             "last_match": max((m["match_date"] for m in all_games), default=None),
                             "stage_source": "hand groups" if spec["groups"] else "fixture feed"})
        codes = {m["stage_code"] for m in all_games} | {"LP"}
        for c in sorted(codes, key=lambda c: STAGES[c][2]):
            name, typ, order = STAGES[c]
            out.stages.append({"stage_key": f"{ed}|{c}", "edition_key": ed, "code": c, "name": name,
                               "type": typ, "stage_order": order})
        for g, ts in sorted((groups or {}).items()):
            gk = f"{ed}|LP|{g}"
            out.groups.append({"group_key": gk, "stage_key": f"{ed}|LP", "label": g, "league": g[0],
                               "size": len(ts)})
            out.group_members += [{"group_key": gk, "team": t} for t in sorted(ts)]


def check_groups(ed: str, games: list, groups: dict) -> None:
    """Every listed group must be exactly the teams that played each other
    (a listed team that played no game, like Russia in 2022/23, is allowed)."""
    played = components(games)
    listed = {g: set(ts) for g, ts in groups.items()}
    active = {t for m in games for t in (m["home_team"], m["away_team"])}
    for comp in played:
        match = [g for g, ts in listed.items() if ts & active == comp]
        if len(match) != 1:
            raise ImportCheckFailed(f"{ed}: played group {sorted(comp)} matches listed groups {match}")
    covered = set().union(*played) if played else set()
    stray = sorted((set().union(*listed.values()) & active) - covered)
    if stray:
        raise ImportCheckFailed(f"{ed}: listed teams outside any played group: {stray}")


def classify_nl_later(ed: str, games: list, group_of: dict) -> None:
    league = lambda t: (group_of.get(t) or "?")[0]
    ties = defaultdict(list)
    for m in games:
        ties[pair(m["home_team"], m["away_team"])].append(m)
    finals = []
    for p, legs in ties.items():
        a, b = sorted(league(t) for t in p)
        if len(legs) == 2:
            code = {("A", "A"): "QF", ("A", "B"): "PO_AB", ("B", "C"): "PO_BC", ("C", "D"): "PO_CD",
                    ("C", "C"): "PO_C"}.get((a, b))
            if not code:
                raise ImportCheckFailed(f"{ed}: two-legged tie between leagues {a} and {b}: {sorted(p)}")
            for m in legs:
                m["edition_key"], m["stage_code"] = ed, code
        elif len(legs) == 1 and a == b == "A":
            finals.append(legs[0])
        else:
            raise ImportCheckFailed(f"{ed}: unexpected later game {legs[0]['match_key']}")
    if not finals:
        return
    if len(finals) != 4:
        raise ImportCheckFailed(f"{ed}: expected 4 Finals games, found {len(finals)}")
    finals.sort(key=lambda m: (m["match_date"], m["match_key"]))
    sf = finals[:2]
    winners = {winner_of(m) for m in sf}
    losers = {t for m in sf for t in (m["home_team"], m["away_team"])} - winners
    for m in sf:
        m["edition_key"], m["stage_code"] = ed, "SF"
    for m in finals[2:]:
        teams = {m["home_team"], m["away_team"]}
        m["edition_key"] = ed
        m["stage_code"] = "F" if teams == winners else "3P" if teams == losers else None
        if m["stage_code"] is None:
            raise ImportCheckFailed(f"{ed}: Finals game {m['match_key']} is neither final nor third place")


def feed_nations_league(out: Build, src: dict) -> dict | None:
    feed = src.get("nl_feed")
    if not feed:
        out.notes.append("Nations League fixture feed unavailable; 2026/27 fixtures not refreshed")
        return None
    known = {r["home_team"] for r in src["results"]} | {r["away_team"] for r in src["results"]}
    groups = defaultdict(set)
    unknown = set()
    for x in feed:
        h = FIXTURE_FEED_ALIASES.get(x["HomeTeam"], x["HomeTeam"])
        a = FIXTURE_FEED_ALIASES.get(x["AwayTeam"], x["AwayTeam"])
        unknown |= {t for t in (h, a) if t not in known}
        g = (x.get("Group") or "").replace("Group", "").strip() or None
        if g:
            groups[g] |= {h, a}
        out.fixtures.append({
            "fixture_key": f"UNL-2026-27|{x['MatchNumber']}", "edition_key": "UNL-2026-27",
            "kickoff_utc": x["DateUtc"].replace(" ", "T").replace("Z", "+00:00"),
            "home_team": h, "away_team": a, "group_label": g, "round_number": x.get("RoundNumber"),
            "venue": x.get("Location") or None,
            "home_score": x.get("HomeTeamScore"), "away_score": x.get("AwayTeamScore"),
            "source": "fixturedownload", "raw": x})
    if unknown:
        raise ImportCheckFailed(f"fixture feed teams not in the results: {sorted(unknown)} "
                                "(add them to FIXTURE_FEED_ALIASES)")
    return {g: sorted(ts) for g, ts in groups.items()}


# ---------------------------------------------------------------------------
# Elo (World Football Elo method; experiment I0's benchmark)
# ---------------------------------------------------------------------------

ELO_START = 1500
ELO_HOME = 100


def elo_k(comp: str) -> int:
    if comp in ELO_K_60:
        return 60
    if comp in ELO_K_50:
        return 50
    if comp in ELO_K_40 or comp.endswith(ELO_K_40_SUFFIX):
        return 40
    return 20 if comp == "Friendly" else 30


def goal_multiplier(margin: int) -> float:
    margin = abs(margin)
    return 1.0 if margin <= 1 else 1.5 if margin == 2 else (11 + margin) / 8


def elo(matches: list) -> None:
    """Writes elo_home_pre, elo_away_pre and elo_change (home's gain) on every
    match. Ratings are point-in-time: each game sees only earlier games.
    A shoot-out counts as a draw, as in the published method."""
    rating = defaultdict(lambda: ELO_START)
    for m in sorted(matches, key=lambda m: m["match_date"]):  # stable: file order within a day
        h, a = m["home_team"], m["away_team"]
        rh, ra = rating[h], rating[a]
        dr = rh - ra + (0 if m["neutral"] else ELO_HOME)
        we = 1 / (10 ** (-dr / 400) + 1)
        w = 1.0 if m["home_score"] > m["away_score"] else 0.0 if m["home_score"] < m["away_score"] else 0.5
        change = elo_k(m["competition"]) * goal_multiplier(m["home_score"] - m["away_score"]) * (w - we)
        m["elo_home_pre"], m["elo_away_pre"], m["elo_change"] = round(rh, 2), round(ra, 2), round(change, 3)
        rating[h], rating[a] = rh + change, ra - change


# ---------------------------------------------------------------------------
# Checks before writing
# ---------------------------------------------------------------------------

def year_totals(matches: list) -> dict:
    """(matches, goals, md5 of sorted keys) per year: the reconciliation key,
    computed the same way by public.intl_year_totals()."""
    keys = defaultdict(list)
    goals = Counter()
    for m in matches:
        y = int(m["match_date"][:4])
        keys[y].append(m["match_key"])
        goals[y] += m["home_score"] + m["away_score"]
    return {y: (len(ks), goals[y], hashlib.md5("\n".join(sorted(ks)).encode()).hexdigest())
            for y, ks in keys.items()}


def check_build(out: Build, src: dict) -> None:
    played_rows = sum(1 for r in src["results"] if score(r["home_score"]) is not None and score(r["away_score"]) is not None)
    if len(out.matches) != played_rows:
        raise ImportCheckFailed(f"{len(out.matches)} matches built from {played_rows} played rows")
    keys = [m["match_key"] for m in out.matches]
    if len(keys) != len(set(keys)):
        raise ImportCheckFailed("duplicate match keys")
    for comp in (WC, EURO):
        bad = [m["match_key"] for m in out.matches if m["competition"] == comp and not m["stage_code"]]
        if bad:
            raise ImportCheckFailed(f"{comp} games without a stage: {bad[:5]}")
    stage_keys = {s["stage_key"] for s in out.stages}
    for m in out.matches:
        if m["edition_key"] and f"{m['edition_key']}|{m['stage_code']}" not in stage_keys:
            raise ImportCheckFailed(f"stage row missing for {m['match_key']}")
    teams = {t["team"] for t in out.teams}
    for gm in out.group_members:
        if gm["team"] not in teams and not gm["group_key"].startswith("UNL-2022-23|LP|B2"):
            raise ImportCheckFailed(f"group member with no matches: {gm}")


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------

def rows_for_db(rows: list, drop=("raw",)) -> list:
    return [{k: v for k, v in r.items() if k not in drop} for r in rows]


def write(sb, b: Build) -> dict:
    ref = {"teams": b.teams, "team_names": b.team_names, "competitions": b.competitions,
           "editions": b.editions, "stages": b.stages, "groups": b.groups, "group_members": b.group_members}
    sb.rpc("intl_load_reference", {"payload": ref}).execute()
    written = 0
    for i in range(0, len(b.matches), BATCH):
        chunk = [dict(m, raw=m["raw"]) for m in b.matches[i:i + BATCH]]
        written += sb.rpc("intl_upsert_matches", {"rows": chunk}).execute().data or 0
    for i in range(0, len(b.goals), BATCH * 2):
        sb.rpc("intl_replace_goals", {"rows": b.goals[i:i + BATCH * 2]}).execute()
    sb.rpc("intl_replace_shootouts", {"rows": b.shootouts}).execute()
    if b.fixtures:
        sb.rpc("intl_upsert_fixtures", {"rows": b.fixtures}).execute()
    return {"written": written}


def reconcile(sb, b: Build) -> None:
    expected = year_totals(b.matches)
    held = {r["year"]: (r["matches"], r["goals"], r["key_hash"])
            for r in sb.rpc("intl_year_totals", {}).execute().data or []}
    extra_years = [y for y in held if y not in expected]
    stale = [y for y in expected if held.get(y) != expected[y]] + extra_years
    if stale:
        # Rows the file no longer has (a corrected duplicate): remove, then recheck.
        file_keys = {m["match_key"] for m in b.matches}
        for y in stale:
            db_keys = sb.rpc("intl_match_keys", {"p_year": y}).execute().data or []
            gone = [k for k in db_keys if k not in file_keys]
            if gone:
                sb.rpc("intl_delete_matches", {"keys": gone}).execute()
        held = {r["year"]: (r["matches"], r["goals"], r["key_hash"])
                for r in sb.rpc("intl_year_totals", {}).execute().data or []}
    diffs = [f"{y}: file {expected.get(y)} v db {held.get(y)}" for y in sorted(set(expected) | set(held))
             if held.get(y) != expected.get(y)]
    if diffs:
        raise ImportCheckFailed("reconciliation failed (matches, goals, key hash) -- " + "; ".join(diffs[:10]))


def summary(b: Build) -> str:
    latest = max(m["match_date"] for m in b.matches)
    wc26 = sum(1 for m in b.matches if m["edition_key"] == "WC-2026")
    eds = Counter(e["competition"] for e in b.editions)
    return (f"{len(b.matches)} matches to {latest}; {len(b.goals)} goals; {len(b.shootouts)} shoot-outs; "
            f"{len(b.teams)} teams; editions WC {eds[WC]}, Euro {eds[EURO]}, Nations League {eds[UNL]}; "
            f"WC 2026 {wc26} games; {len(b.fixtures)} feed fixtures"
            + (f"; notes: {' | '.join(b.notes[:6])}" if b.notes else ""))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="read and check only; write nothing")
    ap.add_argument("--source-dir", default=None, help="read the source files from this folder")
    args = ap.parse_args()

    if args.dry_run:
        b = build(read_sources(args.source_dir))
        print(summary(b))
        return

    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    run = sb.table("pipeline_runs").insert({"job_name": "intl_import", "status": "running"}).execute().data[0]

    def finish(status: str, text: str, error: str | None = None) -> None:
        sb.table("pipeline_runs").update({"status": status, "summary": text, "error_message": error,
                                          "finished_at": "now()"}).eq("run_id", run["run_id"]).execute()
        print(text if not error else f"::error::{error}")

    try:
        b = build(read_sources(args.source_dir))
        w = write(sb, b)
        reconcile(sb, b)
        sb.rpc("intl_refresh", {}).execute()
        try:
            sb.rpc("intl_refresh_visuals", {}).execute()
        except Exception as e:  # noqa: BLE001 -- only before migration 20261005200000 is applied
            if "intl_refresh_visuals" not in str(e):
                raise
            print("intl_refresh_visuals not there yet; skipped")
        finish("success", f"{summary(b)}; {w['written']} written; reconciled per year")
    except Exception as e:  # noqa: BLE001 -- record any failure, then fail the job
        finish("failed", "intl_import failed", str(e)[:2000])
        sys.exit(1)


if __name__ == "__main__":
    main()
