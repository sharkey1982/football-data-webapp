"""International squads from Wikipedia (daily).

Every national team's English Wikipedia page has a "Current squad" table and
usually a "Recent call-ups" table, written with the {{nat fs g player}} and
{{nat fs r player}} templates: number, position, name, date of birth, caps,
goals, club and (for call-ups) the latest call-up. Editors update them within
hours of an announcement. This reads them for every current nation through
the MediaWiki API (50 pages a request, with a User-Agent as the API asks) and
writes them through public.intl_replace_squads. A page with no squad table is
skipped and keeps whatever was stored before. Content: Wikipedia, CC BY-SA --
the pages credit it.

    python intl_squads.py               # read teams from Supabase, write squads
    python intl_squads.py --dry-run     # parse and print, write nothing
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = "https://en.wikipedia.org/w/api.php"
UA = "FixtureShark/1.0 (https://fixtureshark.com; international squads import)"

# Our team name (martj42 lineage) -> page title, where "<name> national football team" doesn't redirect to it.
TITLE_OVERRIDES = {
    "United States": "United States men's national soccer team",
    "Canada": "Canada men's national soccer team",
    "Australia": "Australia men's national soccer team",
    "New Zealand": "New Zealand men's national football team",
    "Republic of Ireland": "Republic of Ireland national football team",
    "DR Congo": "DR Congo national football team",
    "Ivory Coast": "Ivory Coast national football team",
    "China PR": "China national football team",
    "Germany": "Germany national football team",
    "Russia": "Russia national football team",
    "Serbia": "Serbia national football team",
    "Czech Republic": "Czech Republic national football team",
    "North Macedonia": "North Macedonia national football team",
    "Eswatini": "Eswatini national football team",
    "São Tomé and Príncipe": "São Tomé and Príncipe national football team",
    "Curaçao": "Curaçao national football team",
    "Sweden": "Sweden men's national football team",
}

STATUS = ("INJ", "WD", "RET", "PRE", "SUS", "COV", "SEN", "U21", "U23", "DEC", "ILL", "OTH", "TRA")


def page_title(team: str) -> str:
    return TITLE_OVERRIDES.get(team, f"{team} national football team")


# ---------------------------------------------------------------------------
# Wikitext helpers
# ---------------------------------------------------------------------------

def templates(text: str, names: tuple) -> list[tuple[int, str]]:
    """Top-level {{...}} templates whose name (case-insensitive) is in names: (position, inner text)."""
    out, i, n = [], 0, len(text)
    lower = tuple(x.lower() for x in names)
    while True:
        i = text.find("{{", i)
        if i < 0:
            return out
        depth, j = 0, i
        while j < n:
            if text.startswith("{{", j):
                depth += 1
                j += 2
            elif text.startswith("}}", j):
                depth -= 1
                j += 2
                if depth == 0:
                    break
            else:
                j += 1
        inner = text[i + 2:j - 2]
        name = re.split(r"[|\n]", inner, maxsplit=1)[0].strip().lower().replace("_", " ")
        if name in lower:
            out.append((i, inner))
        i = j if name in lower else i + 2


def params(inner: str) -> dict:
    """Named parameters of a template, splitting on top-level pipes only."""
    parts, depth_t, depth_l, cur = [], 0, 0, ""
    k = 0
    while k < len(inner):
        two = inner[k:k + 2]
        if two == "{{":
            depth_t += 1; cur += two; k += 2; continue
        if two == "}}":
            depth_t -= 1; cur += two; k += 2; continue
        if two == "[[":
            depth_l += 1; cur += two; k += 2; continue
        if two == "]]":
            depth_l -= 1; cur += two; k += 2; continue
        c = inner[k]
        if c == "|" and depth_t == 0 and depth_l == 0:
            parts.append(cur); cur = ""
        else:
            cur += c
        k += 1
    parts.append(cur)
    out = {}
    for p in parts[1:]:
        if "=" in p:
            key, val = p.split("=", 1)
            out[key.strip().lower()] = val.strip()
    return out


def link(val: str) -> tuple[str, str | None]:
    """(display text, link target) from a wikilink value like [[Target|Shown]]
    or a {{sortname|First|Last|optional target}} template."""
    sn = re.search(r"\{\{\s*sortname\s*\|([^{}]*)\}\}", val, re.I)
    if sn:
        bits = [b.strip() for b in sn.group(1).split("|") if "=" not in b]
        if len(bits) >= 2:
            shown = f"{bits[0]} {bits[1]}".strip()
            return shown, (bits[2] if len(bits) > 2 and bits[2] else shown)
    m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", val)
    if not m:
        return plain(val), None
    return plain(m.group(2) or m.group(1)), m.group(1).strip()


def plain(val: str) -> str:
    """Wikitext to plain text: no refs, comments, templates or markup."""
    s = re.sub(r"<!--.*?-->", "", val, flags=re.S)
    s = re.sub(r"<ref[^>/]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    for _ in range(4):  # innermost templates first
        s = re.sub(r"\{\{(?:fb\w*|flagicon|flag)\|([^{}|]+)[^{}]*\}\}", r"\1", s, flags=re.I)
        s = re.sub(r"\{\{(?:sort)\|[^{}|]*\|([^{}]*)\}\}", r"\1", s, flags=re.I)
        s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[(?:[^\]|]+\|)?([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"\[https?://\S+ ([^\]]+)\]", r"\1", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("'''", "").replace("''", "").replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", s).strip()


def birth_date(val: str) -> str | None:
    m = re.search(r"\{\{\s*birth date(?: and age)?\s*\|([^}]*)\}\}", val, re.I)
    if not m:
        return None
    nums = [x.strip() for x in m.group(1).split("|") if re.fullmatch(r"\s*\d+\s*", x)]
    if len(nums) < 3:
        return None
    y, mo, d = (int(x) for x in nums[:3])
    return f"{y:04d}-{mo:02d}-{d:02d}" if 1900 < y < 2100 and 1 <= mo <= 12 and 1 <= d <= 31 else None


def to_int(val: str | None) -> int | None:
    m = re.match(r"\s*(\d+)", plain(val or ""))
    return int(m.group(1)) if m else None


def section(text: str, heading: str) -> str | None:
    """Body of the first section whose heading matches, up to the next heading of the same or higher level."""
    m = re.search(r"^(=+)\s*" + heading + r"\s*\1\s*$", text, re.M | re.I)
    if not m:
        return None
    level = len(m.group(1))
    rest = text[m.end():]
    nxt = re.search(r"^={1,%d}[^=].*?=+\s*$" % level, rest, re.M)
    return rest[: nxt.start()] if nxt else rest


def parse_players(body: str, kind: str) -> list[dict]:
    name = "nat fs g player" if kind == "current" else "nat fs r player"
    rows = []
    for _, inner in templates(body, (name,)):
        p = params(inner)
        player, target = link(p.get("name", ""))
        if not player:
            continue
        latest = p.get("latest", "")
        lm = re.search(r"\{\{\s*sort\s*\|\s*(\d{4}-\d{2}-\d{2})", latest, re.I)
        tail = inner[inner.find("latest="):] if "latest=" in inner else inner
        status = next((s for s in STATUS if re.search(rf"<sup>\s*{s}\s*</sup>|\b{s}\b</sup>", tail)), None)
        club, club_wiki = link(p.get("club", ""))
        rows.append({
            "list": kind, "number": to_int(p.get("no")), "position": (p.get("pos") or "").strip().upper()[:2] or None,
            "player": player, "wiki_title": target, "birth_date": birth_date(p.get("age", "")),
            "caps": to_int(p.get("caps")), "goals": to_int(p.get("goals")), "club": club or None, "club_wiki": club_wiki,
            "club_country": (p.get("clubnat") or "").strip().upper() or None,
            "latest_date": lm.group(1) if lm else None,
            "latest_text": (re.sub(r"\s*(?:%s)\s*$" % "|".join(STATUS), "", plain(latest)) or None) if kind == "recent" else None,
            "status": status,
        })
    return rows


def parse_page(team: str, title: str, text: str, revision_at: str | None) -> dict | None:
    body = section(text, r"Current squad")
    if body is None:
        # Some pages list the squad straight under "Players", before its first sub-heading.
        players_body = section(text, r"Players")
        body = re.split(r"^=+[^=\n]+=+\s*$", players_body, maxsplit=1, flags=re.M)[0] if players_body else None
    if body is None:
        return None
    current = parse_players(body, "current")
    if not current:
        return None
    before = body.split("{{nat fs g start", 1)[0]
    unlinked = re.sub(r"\[\[(?:[^\]|]+\|)?([^\]]+)\]\]", r"\1", re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", before, flags=re.S))
    asof = re.search(r"(?:correct|updated|goals)\s+(?:as\s+)?(?:of|on)\s+([A-Za-z0-9][^.'<|}]*?\d{4})", unlinked, re.I)
    intro_text = re.split(r"(?i)caps and goals", plain(before))[0].strip()
    recent_body = section(text, r"Recent call[- ]ups") or ""
    recent = parse_players(recent_body, "recent")
    players = []
    for lst in (current, recent):
        for i, r in enumerate(lst):
            players.append({"team": team, "seq": i, **r})
    return {"squad": {"team": team, "wiki_title": title, "revision_at": revision_at, "intro": intro_text[:600] or None,
                      "caps_as_of": asof.group(1).strip() if asof else None, "players": len(current)},
            "players": players}


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------

def api(**p) -> dict:
    p.update(format="json", formatversion="2")
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(p), headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:  # noqa: BLE001
            if attempt == 2:
                raise
            time.sleep(5 * (attempt + 1))
    return {}


def fetch(teams: list[str]) -> list[tuple[str, str, str, str | None]]:
    """(team, page title, wikitext, revision time) for each team whose page exists."""
    by_title = {page_title(t): t for t in teams}
    out = []
    titles = list(by_title)
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        d = api(action="query", prop="revisions", rvprop="content|timestamp", rvslots="main", titles="|".join(batch), redirects=1)
        q = d.get("query", {})
        # requested title -> final title (normalised, then redirected)
        final = {t: t for t in batch}
        for step in ("normalized", "redirects"):
            for x in q.get(step, []):
                for k, v in list(final.items()):
                    if v == x["from"]:
                        final[k] = x["to"]
        pages = {pg["title"]: pg for pg in q.get("pages", []) if "revisions" in pg}
        for req, fin in final.items():
            pg = pages.get(fin)
            if pg:
                rev = pg["revisions"][0]
                out.append((by_title[req], pg["title"], rev["slots"]["main"]["content"], rev.get("timestamp")))
        time.sleep(1)
    return out


# ---------------------------------------------------------------------------
# Clubs: league country, FixtureShark club page, ClubElo rating
# ---------------------------------------------------------------------------

CLUBELO_URL = "http://api.clubelo.com/{date}"
# ClubElo country codes that differ from FIFA's.
CLUBELO_COUNTRY = {"ROM": "ROU", "SLO": "SVN", "BOS": "BIH", "MAC": "MKD", "LAT": "LVA", "LIT": "LTU", "NIR": "NIR"}


def read_clubelo(text: str) -> list[dict]:
    """ClubElo's daily CSV (Rank,Club,Country,Level,Elo,From,To) -> rows, ranked by Elo."""
    import csv
    import io
    rows = [r for r in csv.DictReader(io.StringIO(text)) if r.get("Club") and r.get("Elo")]
    rows.sort(key=lambda r: -float(r["Elo"]))
    return [{"club": r["Club"], "country": r.get("Country") or None, "level": int(r["Level"]) if (r.get("Level") or "").isdigit() else None,
             "elo": round(float(r["Elo"]), 1), "rank": i + 1} for i, r in enumerate(rows)]


def site_country(fifa: str | None) -> str | None:
    import club_match as cm
    name = cm.FIFA_COUNTRIES.get((fifa or "").upper())
    return cm.SITE_COUNTRY.get(name, name)


def build_indexes(site_teams: list[dict], elo_rows: list[dict]):
    """(FixtureShark index, ClubElo index, ClubElo row by FixtureShark slug)."""
    import club_match as cm
    site = cm.Index()
    for t in site_teams:
        site.add(t.get("country"), t, t.get("canonical_name"), t.get("display_name"), *(t.get("aliases") or []))
    elo = cm.Index()
    by_slug = {}
    for r in elo_rows:
        fifa = CLUBELO_COUNTRY.get(r["country"] or "", r["country"])
        country = site_country(fifa)
        elo.add(country, r, r["club"])
        t = site.find(country, r["club"])
        if t is not None:
            r["club_slug"] = t["slug"]
            by_slug.setdefault(t["slug"], r)
    return site, elo, by_slug


def enrich(players: list[dict], site, elo, elo_by_slug) -> dict:
    """Adds club_league_country, club_slug, clubelo_name, club_elo, club_elo_rank to each player."""
    import club_match as cm
    n = {"players": 0, "site": 0, "elo": 0}
    for p in players:
        country = site_country(p.get("club_country"))
        p["club_league_country"] = cm.FIFA_COUNTRIES.get((p.get("club_country") or "").upper())
        t = site.find(country, p.get("club"), p.get("club_wiki")) if p.get("club") else None
        e = (elo_by_slug.get(t["slug"]) if t else None) or (elo.find(country, p.get("club"), p.get("club_wiki")) if p.get("club") else None)
        p["club_slug"] = t["slug"] if t else None
        p["clubelo_name"], p["club_elo"], p["club_elo_rank"] = (e["club"], e["elo"], e["rank"]) if e else (None, None, None)
        n["players"] += 1
        n["site"] += t is not None
        n["elo"] += e is not None
    return n


def load_site_teams(sb) -> list[dict]:
    countries = {c["country_id"]: c["name"] for c in sb.table("countries").select("country_id,name").execute().data}
    teams = sb.table("teams").select("team_id,slug,canonical_name,display_name,country_id").limit(5000).execute().data
    aliases, start = [], 0
    while True:
        page = sb.table("team_aliases").select("team_id,raw_name").range(start, start + 999).execute().data
        aliases += page
        if len(page) < 1000:
            break
        start += 1000
    by_team = {}
    for a in aliases:
        by_team.setdefault(a["team_id"], []).append(a["raw_name"])
    return [{**t, "country": countries.get(t["country_id"]), "aliases": by_team.get(t["team_id"], [])} for t in teams]


def fetch_clubelo() -> list[dict]:
    from datetime import date
    req = urllib.request.Request(CLUBELO_URL.format(date=date.today().isoformat()), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return read_clubelo(r.read().decode("utf-8", "replace"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--teams", help="comma-separated team names (default: every current nation)")
    args = ap.parse_args()
    sb = None
    if args.teams:
        teams = [t.strip() for t in args.teams.split(",")]
    else:
        from supabase import create_client
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
        rows = sb.table("intl_team_summary").select("team,elo_rank").not_.is_("elo_rank", "null").execute().data
        teams = sorted(r["team"] for r in rows)
    pages = fetch(teams)
    squads, players, missing = [], [], []
    got = set()
    for team, title, text, ts in pages:
        r = parse_page(team, title, text, ts)
        if r:
            squads.append(r["squad"]); players += r["players"]; got.add(team)
    missing = sorted(set(teams) - got)
    note = f"{len(squads)} squads ({len(players)} players) from {len(pages)} pages; no squad table for {len(missing)}: {', '.join(missing[:40])}"
    print(note)
    club_note = ""
    elo_rows = []
    if sb is not None:
        try:
            elo_rows = fetch_clubelo()
        except Exception as e:  # noqa: BLE001 -- ratings are a bonus; squads still load
            print(f"::warning::ClubElo not read: {e}")
        site, elo, by_slug = build_indexes(load_site_teams(sb), elo_rows)
        n = enrich(players, site, elo, by_slug)
        club_note = f"; clubs: {n['site']}/{n['players']} matched to FixtureShark, {n['elo']} rated by ClubElo ({len(elo_rows)} clubs)"
        note += club_note
        print(club_note)
    if args.dry_run:
        for s in squads[:3]:
            print(json.dumps(s, ensure_ascii=False))
        print(json.dumps(players[:3], ensure_ascii=False))
        return
    if sb is None:
        from supabase import create_client
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    if len(squads) < 50:
        print(f"::error::only {len(squads)} squads parsed -- refusing to write")
        sys.exit(1)
    run = sb.table("pipeline_runs").insert({"job_name": "intl_squads", "status": "running"}).execute().data[0]
    try:
        for i in range(0, len(squads), 40):
            chunk = squads[i:i + 40]
            names = {s["team"] for s in chunk}
            sb.rpc("intl_replace_squads", {"payload": {"squads": chunk, "players": [p for p in players if p["team"] in names]}}).execute()
        if elo_rows:
            from datetime import date
            try:
                sb.rpc("intl_replace_club_elo", {"payload": [{**r, "fetched_on": date.today().isoformat()} for r in elo_rows]}).execute()
            except Exception as e:  # noqa: BLE001
                if "intl_replace_club_elo" not in str(e):
                    raise
                print("intl_replace_club_elo not there yet; skipped")
        sb.table("pipeline_runs").update({"status": "success", "summary": note, "finished_at": "now()"}).eq("run_id", run["run_id"]).execute()
    except Exception as e:  # noqa: BLE001
        sb.table("pipeline_runs").update({"status": "failed", "summary": "intl_squads failed", "error_message": str(e)[:2000],
                                          "finished_at": "now()"}).eq("run_id", run["run_id"]).execute()
        raise


if __name__ == "__main__":
    main()
