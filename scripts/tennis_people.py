#!/usr/bin/env python3
# ============================================================================
# scripts/tennis_people.py
#
# Player country, date of birth and playing hand for the tennis section, from
# Wikidata (CC0). Design: claude/tennis-phase3-design-2026-10-05.md, A1.
#
# tennis-data.co.uk names players "Sinner J." with no ids, so each of our
# players is matched to a Wikidata person with an ATP (P536) or WTA (P597)
# player id by surname + initial(s), checked against a plausible career.
# A name that fits more than one person stays unmatched -- never a guess.
#
#   python scripts/tennis_people.py --fetch wikidata_tennis.json   fetch only
#   python scripts/tennis_people.py --from wikidata_tennis.json --dry-run
#   python scripts/tennis_people.py            fetch, match, write (Actions)
#
# Writes through public.tennis_set_people (service_role), which replaces
# tennis.player_people in one transaction. One pipeline_runs row
# (tennis_people); fails if any player with 50+ matches in the last three
# seasons is unmatched, after writing the rest.
#
# Runs on GitHub Actions (.github/workflows/tennis-people.yml): Wikidata is not
# reachable from the Claude workspace. Needs SUPABASE_URL and
# SUPABASE_SERVICE_KEY to write.
# ============================================================================

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict

SPARQL = "https://query.wikidata.org/sparql"
USER_AGENT = "FixtureShark/1.0 (https://fixtureshark.com; tennis player details) python-urllib"

# One query per tour id property. Labels via rdfs:label (en) rather than the
# label service keeps it fast enough for ~20k people.
QUERY = """
SELECT ?p ?id ?label ?mul ?family ?given ?dob ?sex ?hand ?handlabel ?cit ?sport ?citq ?sportq ?sportnow ?sportpref WHERE {
  ?p wdt:%(prop)s ?id .
  OPTIONAL { ?p rdfs:label ?label FILTER(LANG(?label) = "en") }
  OPTIONAL { ?p rdfs:label ?mul FILTER(LANG(?mul) = "mul") }
  OPTIONAL { ?p wdt:P734 ?f . ?f rdfs:label ?family FILTER(LANG(?family) IN ("en", "mul")) }
  OPTIONAL { ?p wdt:P735 ?g . ?g rdfs:label ?given FILTER(LANG(?given) IN ("en", "mul")) }
  OPTIONAL { ?p wdt:P569 ?dob }
  OPTIONAL { ?p wdt:P21 ?sx . BIND(STRAFTER(STR(?sx), "entity/") AS ?sex) }
  OPTIONAL { ?p wdt:P741 ?h . BIND(STRAFTER(STR(?h), "entity/") AS ?hand) OPTIONAL { ?h rdfs:label ?handlabel FILTER(LANG(?handlabel) = "en") } }
  OPTIONAL { ?p wdt:P27 ?c . BIND(STRAFTER(STR(?c), "entity/") AS ?citq) OPTIONAL { ?c wdt:P297 ?cit } }
  OPTIONAL { ?p wdt:P1532 ?s . BIND(STRAFTER(STR(?s), "entity/") AS ?sportq) OPTIONAL { ?s wdt:P297 ?sport } }
  # The nation played for now: P1532 statements with no end date (players who switched, e.g. Russia to Kazakhstan).
  OPTIONAL { ?p p:P1532 ?st . ?st ps:P1532 ?s2 ; wikibase:rank ?rk .
             FILTER(?rk != wikibase:DeprecatedRank) FILTER NOT EXISTS { ?st pq:P582 ?ended }
             ?s2 wdt:P297 ?sportnow . BIND(IF(?rk = wikibase:PreferredRank, ?sportnow, "") AS ?sportpref) }
}
"""
PROPS = {"ATP": "P536", "WTA": "P597"}


def sparql(query: str, attempts: int = 4) -> list[dict]:
    url = SPARQL + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)["results"]["bindings"]
        except Exception as e:  # noqa: BLE001
            print(f"  Wikidata attempt {i + 1} failed: {e}")
            time.sleep(10 * (i + 1))
    raise RuntimeError("Wikidata query failed")


def fetch() -> dict[str, list[dict]]:
    """{tour: [person]} with one entry per Wikidata person (values collected)."""
    out = {}
    for tour, prop in PROPS.items():
        rows = sparql(QUERY % {"prop": prop})
        people: dict[str, dict] = {}
        for b in rows:
            qid = b["p"]["value"].rsplit("/", 1)[-1]
            p = people.setdefault(qid, {"qid": qid, "ids": set(), "label": None, "family": set(), "given": set(),
                                        "dob": None, "sex": None, "hand": None, "hands": set(), "cit": set(), "sport": set(), "sportnow": set(), "sportpref": set(),
                                        "citq": set(), "sportq": set()})
            g = lambda k: b.get(k, {}).get("value")  # noqa: E731
            p["ids"].add(g("id"))
            p["label"] = p["label"] or g("label") or g("mul")  # well-known names are often only under "mul"
            for k in ("family", "given", "cit", "sport", "citq", "sportq", "sportnow", "sportpref"):
                if g(k):
                    p[k].add(g(k))
            if g("handlabel"):
                p["hands"].add(g("handlabel"))
            p["dob"] = p["dob"] or (g("dob") or "")[:10] or None
            p["sex"] = p["sex"] or g("sex")
            p["hand"] = p["hand"] or g("hand")
        out[tour] = [{k: sorted(v) if isinstance(v, set) else v for k, v in p.items()} for p in people.values()]
        print(f"{tour}: {len(rows)} rows, {len(out[tour])} people")
    return out


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------
SEX = {"ATP": "Q6581097", "WTA": "Q6581072"}  # male, female
HANDS = {"Q3039938": "Right", "Q789447": "Left"}  # right-/left-handedness; tennis variants are read from their labels
# Hand-checked answers where the name alone can't decide (source name -> Wikidata QID).
# Keyed by tour and our display name.
OVERRIDES: dict[str, dict[str, str | None]] = {
    "ATP": {
        "Statham R.": None,             # Rubin and Jose Statham are brothers; Wikidata mixes them
        "Statham J.": None,
        "Blanch D.": None,              # Darwin or Dali Blanch (brothers)
        "Bu Y.": "Q112965927",          # Buyunchaokete (one-word label)
        "Nakashima B.": "Q60676610",    # Brandon, not his brother Bryce
    },
    "WTA": {
        "Dolehide C.": "Q34114014",     # Caroline, not her sister Courtney
        "Kostyuk M.": "Q28535267",      # Marta, not Mariya
        "Yuan Y.": "Q56248480",         # Yuan Yue (current player), not Xin Yuan or Yuan Meng
    },
}
# Letters NFKD does not reduce to ASCII.
TRANSLIT = str.maketrans({"đ": "dj", "Đ": "Dj", "ð": "d", "ł": "l", "Ł": "L", "ø": "o", "Ø": "O", "æ": "ae", "ß": "ss", "þ": "th", "ı": "i"})


def key(s: str) -> str:
    """Letters only, lower case, accents dropped (same idea as tennis_import.name_key)."""
    return re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", s.translate(TRANSLIT)).encode("ascii", "ignore").decode().lower())


def split_ours(name: str) -> tuple[str, str, str | None]:
    """"Del Potro J.M." -> ("delpotro", "jm", None); "Pliskova Ka." -> ("pliskova", "k", "ka");
    "Zhang Ze" -> ("zhang", "z", "ze")... the last only via the prefix rule below."""
    toks = name.replace(",", " ").split()
    initials = []
    # An initials token ends in a dot ("J.", "J.M.", "Ka.", "Xiy.") or is bare capitals ("K", "JC");
    # "Agut", "Wild", "Maia" are surname words, not initials.
    while len(toks) > 1 and (re.fullmatch(r"(?:[A-Z][a-z]{0,3}[.-]?)*[A-Z][a-z]{0,3}\.", toks[-1]) or re.fullmatch(r"[A-Z]{1,3}", toks[-1])):
        initials.insert(0, toks.pop())
    prefix = None
    if len(initials) == 1 and re.fullmatch(r"[A-Z][a-z]+\.?", initials[0]):
        prefix = key(initials[0])  # "Ka.", "Xiy.", "Zh.": the start of the first given name
    letters = key(initials[0])[:1] + "".join(key(t)[:1] for t in initials[1:]) if prefix else key("".join(initials))
    return key(" ".join(toks)), letters, prefix


def initials_of(words: list[str]) -> str:
    """First letter of each word and of each hyphen part: "Ye-ra" -> "yr", "Jean-Rene" -> "jr"."""
    return "".join(key(part)[:1] for w in words for part in w.split("-") if key(part))


def their_keys(person: dict) -> set[tuple[str, str, str, int]]:
    """Every (surname key, given initials, first given name key, strength) reading of a person.
    Strength: 3 = "Given Surname" from the label, 2 = family-name field, 1 = "Surname Given"."""
    out = set()
    label = person.get("label") or ""
    toks = [t for t in label.split() if t]
    given = [g for g in person.get("given") or [] if key(g)]
    for fam in person.get("family") or []:
        rest = [t for t in toks if key(t) and key(t) not in key(fam)]
        for gs in (given, rest):
            if gs:
                out.add((key(fam), initials_of(gs), key(gs[0]), 2))
    for k in range(1, len(toks)):
        a, b = toks[:k], toks[k:]
        if all(key(t) for t in toks):
            out.add((key(" ".join(b)), initials_of(a), key(a[0]), 3))   # Given Surname
            out.add((key(" ".join(a)), initials_of(b), key(b[0]), 1))   # Surname Given (East Asian order)
            if given:
                out.add((key(" ".join(b)), initials_of(given), key(given[0]), 2))
    return {r for r in out if r[0]}


def plausible(person: dict, first_year: int, last_year: int) -> bool:
    dob = person.get("dob")
    if not dob:
        return True
    born = int(dob[:4])
    # Judged on the latest season: the source sometimes uses one name for a
    # parent and child ("Ruud C."), and the page is about the recent player.
    return last_year - 48 <= born <= last_year - 14


def match(players: list[dict], people: dict[str, list[dict]]) -> list[dict]:
    """players: {player_id, tour, name, first_year, last_year}. Returns one row per player:
    qid (or None), method, candidates."""
    index: dict[str, dict[str, list[tuple[str, dict]]]] = {}
    for tour, plist in people.items():
        idx = defaultdict(list)
        for p in plist:
            if p.get("sex") not in (SEX[tour], None):
                continue
            for sur, ini, first_given, strength in their_keys(p):
                idx[sur].append((ini, first_given, strength, p))
        index[tour] = idx
    by_qid = {p["qid"]: p for plist in people.values() for p in plist}
    out = []
    for pl in players:
        tour, name = pl["tour"], pl["name"]
        if name in OVERRIDES.get(tour, {}):
            q = OVERRIDES[tour][name]
            out.append({**pl, "qid": q, "method": "override" if q else "override-none", "candidates": 1 if q else 0,
                        "person": by_qid.get(q) if q else None})
            continue
        sur, ini, prefix = split_ours(name)
        cands = {}
        for their_ini, first_given, strength, p in index[tour].get(sur, []):
            if not ini or not their_ini or their_ini[0] != ini[0]:
                continue
            # With two or more initials on both sides they must agree ("Y.H." is not "Y.R.").
            if len(ini) > 1 and len(their_ini) > 1 and not (ini.startswith(their_ini) or their_ini.startswith(ini)):
                continue
            if prefix and not first_given.startswith(prefix):
                continue
            if not plausible(p, pl["first_year"], pl["last_year"]):
                continue
            exact = their_ini.startswith(ini)
            cur = cands.get(p["qid"])
            cands[p["qid"]] = (p, (cur[1] if cur else False) or exact, max(strength, cur[2] if cur else 0))
        if len(cands) > 1:  # prefer the strongest reading of the name
            top = max(v[2] for v in cands.values())
            cands = {q: v for q, v in cands.items() if v[2] == top}
        if len(cands) > 1:  # prefer full-initials agreement ("J.M." over "J.")
            exact = {q: v for q, v in cands.items() if v[1]}
            if len(exact) == 1:
                cands = exact
        if len(cands) > 1:  # prefer people with a known birth date in range over undated ones
            dated = {q: v for q, v in cands.items() if v[0].get("dob")}
            if len(dated) == 1:
                cands = dated
        if len(cands) == 1:
            (q, (p, exact, _)), = cands.items()
            out.append({**pl, "qid": q, "method": "name+initials" if exact else "name+initial", "candidates": 1, "person": p})
        else:
            out.append({**pl, "qid": None, "method": "ambiguous" if cands else "none", "candidates": len(cands),
                        "person": None, "options": [v[0]["label"] for v in cands.values()][:5]})
    return one_player_per_person(out)


def one_player_per_person(rows: list[dict]) -> list[dict]:
    """A Wikidata person may match two of our players (spellings not merged, or
    a namesake). Keep the override, else the player with most matches
    ("Fernandez L.A.", 270, over "Fernandez L.", 8), and leave the others
    unmatched."""
    rank = {"override": 1}
    groups = defaultdict(list)
    for r in rows:
        if r["qid"]:
            groups[(r["tour"], r["qid"])].append(r)
    for g in groups.values():
        if len(g) > 1:
            g.sort(key=lambda r: (rank.get(r["method"], 0), r.get("matches", 0)), reverse=True)
            for r in g[1:]:
                r.update(qid=None, person=None, method="taken", options=[g[0]["name"]])
    return rows


# Country entities without an ISO code (historic or "Kingdom of ..." items).
COUNTRY_QID = {
    "Q756617": "DK",   # Kingdom of Denmark (Wikidata often uses this, which has no ISO code)
    "Q29999": "NL",    # Kingdom of the Netherlands
}
# Hand-checked nation played for, where Wikidata lists two current ones (Wikidata QID -> alpha-2).
COUNTRY_OVERRIDES = {
    "Q23678983": "KZ",   # Alexander Bublik, for Kazakhstan since 2016
    "Q110287122": "KZ",  # Alexander Shevchenko, for Kazakhstan since 2024
}
# Historic states (Soviet Union, Yugoslavia, Czechoslovakia...) are left out on
# purpose: they sit beside the current country and would make it ambiguous.


def countries(p: dict) -> tuple[list[str], list[str]]:
    sport = sorted(set(p.get("sport") or []) | {COUNTRY_QID[q] for q in p.get("sportq") or [] if q in COUNTRY_QID})
    cit = sorted(set(p.get("cit") or []) | {COUNTRY_QID[q] for q in p.get("citq") or [] if q in COUNTRY_QID})
    return sport, cit


def hand_of(p: dict) -> str | None:
    """Wikidata also uses tennis-specific values ("right-handed, two-handed
    backhand"), so read the labels; the plain QIDs cover files without them."""
    labels = " ".join(p.get("hands") or []).lower()
    right, left = "right" in labels, "left" in labels
    if right != left:
        return "Right" if right else "Left"
    return HANDS.get(p.get("hand") or "")


def person_row(m: dict) -> dict | None:
    p = m.get("person")
    if not p:
        return None
    sport, cit = countries(p)
    # The nation a player represents now: a preferred P1532 statement, else one
    # with no end date, else the only P1532, else the only citizenship.
    country = COUNTRY_OVERRIDES.get(m["qid"])
    for options in () if country else (p.get("sportpref") or [], p.get("sportnow") or [], sport, [] if sport else cit):
        if len(set(options)) == 1:
            country = options[0]
            break
        if len(set(options)) > 1:
            break
    return {
        "player_id": m["player_id"], "wikidata_qid": m["qid"], "full_name": p.get("label"),
        "country": country, "all_countries": sorted(set(sport) | set(cit)),
        "birth_date": p.get("dob"), "hand": hand_of(p), "match_method": m["method"],
    }


def load_players(sb) -> list[dict]:
    out, start = [], 0
    while True:
        page = (sb.table("tennis_players").select("player_id,tour,name,first_year,last_year,matches,recent_matches")
                .order("player_id").range(start, start + 999).execute().data)
        out += page
        if len(page) < 1000:
            return out
        start += 1000


def report(rows: list[dict]) -> list[str]:
    """Printed every run; returns the problems that should fail the job."""
    by = defaultdict(int)
    for r in rows:
        by[r["method"]] += 1
    total = sum(r.get("matches", 0) for r in rows) or 1
    covered = sum(r.get("matches", 0) for r in rows if r["qid"])
    print(f"players {len(rows)}: " + ", ".join(f"{k} {v}" for k, v in sorted(by.items())))
    print(f"matches played by a matched player: {covered / total:.1%}")
    regulars = [r for r in rows if r.get("recent_matches", 0) >= 50]
    missing = [r for r in regulars if not r["qid"]]
    no_country = [r for r in regulars if r["qid"] and not (person_row(r) or {}).get("country")]
    for r in missing:
        print(f"  UNMATCHED regular: {r['tour']} {r['name']} ({r['method']}; {r.get('options')})")
    for r in no_country:
        print(f"  no country: {r['tour']} {r['name']} -> {r['qid']}")
    return [f"{len(missing)} regular(s) unmatched"] if missing else []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", help="fetch from Wikidata and write this JSON file, then stop")
    ap.add_argument("--from", dest="src", help="use a JSON file written by --fetch instead of fetching")
    ap.add_argument("--dry-run", action="store_true", help="match and report, write nothing")
    args = ap.parse_args()
    if args.fetch:
        data = fetch()
        with open(args.fetch, "w", encoding="utf-8") as f:
            json.dump({"fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(), **data}, f, ensure_ascii=False)
        return 0

    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    run = None if args.dry_run else sb.table("pipeline_runs").insert({"job_name": "tennis_people", "status": "running"}).execute().data[0]
    try:
        people = json.load(open(args.src, encoding="utf-8")) if args.src else fetch()
        rows = match(load_players(sb), {t: people[t] for t in PROPS})
        problems = report(rows)
        out = [r for r in (person_row(m) for m in rows) if r]
        summary = f"{len(out)} of {len(rows)} players matched"
        if not args.dry_run:
            n = sb.rpc("tennis_set_people", {"rows": out}).execute().data
            summary = f"{n} player details written; " + summary
            sb.table("pipeline_runs").update({"status": "failed" if problems else "success", "summary": summary,
                                              "error_message": "; ".join(problems) or None, "finished_at": "now()"}
                                             ).eq("run_id", run["run_id"]).execute()
        print(("FAILED: " + "; ".join(problems)) if problems else "OK: " + summary)
        return 1 if problems else 0
    except Exception as e:  # noqa: BLE001
        if run:
            sb.table("pipeline_runs").update({"status": "failed", "error_message": str(e)[:4000], "finished_at": "now()"}
                                             ).eq("run_id", run["run_id"]).execute()
        raise


if __name__ == "__main__":
    sys.exit(main())
