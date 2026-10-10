#!/usr/bin/env python3
# ============================================================================
# scripts/ffs_team_news.py
#
# Fantasy Football Scout's predicted line-ups, for /admin/lineup-compare
# (10 Oct 2026). Chris: their team-news page is public
# (https://www.fantasyfootballscout.co.uk/team-news; robots.txt allows
# everything) and the comparison should fill itself.
#
# Fetches that one page (twice a day, plus on demand), reads each club's
# predicted XI -- a club heading followed by a list of eleven names, then
# "Out:", "Doubts:", "Banned:" -- matches the names to the club's FPL squad
# and saves them to fpl_external_lineups for the next gameweek, replacing
# that club's previous FFS line-up. A club whose XI can't be read with at
# least 10 names matched keeps its previous line-up. Every run is logged per
# club in fpl_external_lineup_runs (names not matched included), and in
# pipeline_runs. Admin-only data; not a projection input.
#
# Positions are NOT read from FFS. If they ever are: FFS's line-up graphics
# put the goalkeeper at the TOP, so their left-hand side is the team's
# right. The 14 Sep role seed read them the other way and every left/right
# role came out mirrored (fixed 10 Oct 2026, migration 20261010150000).
#
#   python scripts/ffs_team_news.py            # fetch and save
#   python scripts/ffs_team_news.py --probe    # store page structure in analysis_results, save nothing
#
# Needs SUPABASE_URL, SUPABASE_SERVICE_KEY.
# ============================================================================

from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone

URL = "https://www.fantasyfootballscout.co.uk/team-news"
SOURCE = "fantasy_football_scout"
UA = "FixtureShark/1.0 (personal FPL analysis; fetches team-news twice daily)"

STOP_LABELS = ("out", "doubts", "doubtful", "banned", "suspended", "latest news", "injuries", "next match")

CLUB_ALIASES = {
    "manchester united": ["man utd", "man united", "manchester utd"],
    "manchester city": ["man city"],
    "tottenham": ["spurs", "tottenham hotspur"],
    "nottingham forest": ["nott'm forest", "nottm forest", "forest"],
    "wolverhampton": ["wolves", "wolverhampton wanderers"],
    "aston villa": ["villa"],
    "crystal palace": ["palace"],
    "brighton": ["brighton and hove albion", "brighton & hove albion"],
    "newcastle": ["newcastle united"],
    "west ham": ["west ham united"],
    "leeds": ["leeds united"],
    "coventry": ["coventry city"],
    "hull": ["hull city"],
    "ipswich": ["ipswich town"],
    "sunderland": ["sunderland afc"],
    "bournemouth": ["afc bournemouth"],
}


def fold(s: str | None) -> str:
    if not s:
        return ""
    s = s.replace("ø", "o").replace("Ø", "O").replace("æ", "ae").replace("ß", "ss")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z]", "", s.lower())


def words(s: str | None) -> list[str]:
    return [fold(w) for w in re.split(r"[\s.\-']+", s or "") if fold(w)]


def club_keys(names: list[str]) -> set[str]:
    out: set[str] = set()
    for n in names:
        if not n:
            continue
        out.add(fold(n))
        for key, extra in CLUB_ALIASES.items():
            if fold(key) == fold(n):
                out.update(fold(e) for e in extra)
    return out


def lev(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def match_name(text: str, squad: list[dict]) -> dict | None:
    """One written name to one squad player, or None if not sure.
    Exact (web name, surname, full name) -> every written word is one of the
    player's name words ("Gabriel Magalhaes", "Raya Martin") -> ends-with ->
    spelling distance <= 2 (<= 1 for short names)."""
    t = fold(text)
    if len(t) < 2:
        return None
    tw = set(words(text))

    def keys(p):
        k = {fold(p.get("web_name")), fold(p.get("second_name")), fold((p.get("first_name") or "") + (p.get("second_name") or ""))}
        k.update(w for w in words(p.get("web_name")) if len(w) > 2)
        return {x for x in k if x}

    def pwords(p):
        return set(words(p.get("first_name"))) | set(words(p.get("second_name"))) | set(words(p.get("web_name")))

    for test in (
        lambda p: t in keys(p),
        lambda p: bool(tw) and tw <= pwords(p) and any(len(w) >= 3 for w in tw),
        lambda p: any(min(len(k), len(t)) >= 4 and (t.endswith(k) or k.endswith(t)) for k in keys(p)),
    ):
        hits = [p for p in squad if test(p)]
        if len(hits) == 1:
            return hits[0]
        if len(hits) > 1:
            return None
    if len(t) >= 4:
        limit = 2 if len(t) >= 7 else 1
        near = sorted(((min(lev(t, k) for k in keys(p)), i) for i, p in enumerate(squad) if keys(p)))
        near = [(d, i) for d, i in near if d <= limit]
        if len(near) == 1 or (len(near) > 1 and near[0][0] < near[1][0]):
            return squad[near[0][1]]
    return None


def parse_page(html: str, clubs: dict[int, set[str]]) -> dict[int, dict]:
    """{team_id: {"names": [...], "updated": str|None}} from the team-news page.
    Walks the document in order: a heading naming a club starts its block;
    list items are its predicted XI until a label (Out, Doubts, ...) or the
    next club heading."""
    import lxml.html

    doc = lxml.html.fromstring(html)
    out: dict[int, dict] = {}
    current: int | None = None
    collecting = False
    for el in doc.iter():
        tag = el.tag if isinstance(el.tag, str) else ""
        if tag in ("h1", "h2", "h3", "h4"):
            key = fold(el.text_content())
            hit = next((tid for tid, ks in clubs.items() if key in ks), None)
            if hit is not None:
                current, collecting = hit, True
                out.setdefault(hit, {"names": [], "updated": None})
            elif current is not None and key:
                collecting = False
            continue
        if current is None:
            continue
        own = (el.text or "").strip().lower().rstrip(":")
        if tag in ("strong", "b", "p", "span", "div", "h5", "h6", "dt") and any(own.startswith(lbl) for lbl in STOP_LABELS):
            if own.startswith("next match"):
                continue
            collecting = False
        if tag in ("em", "i", "p", "span") and own.startswith("last updated"):
            out[current]["updated"] = (el.text or "").strip()
        if collecting and tag == "li":
            name = re.sub(r"\s+", " ", el.text_content()).strip()
            if name and len(out[current]["names"]) < 11:
                out[current]["names"].append(name)
    return out


def main() -> None:
    import httpx
    from supabase import create_client

    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    args = ap.parse_args()

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    resp = httpx.get(URL, headers={"User-Agent": UA, "Accept": "text/html"}, timeout=30, follow_redirects=True)
    print(f"GET {URL}: {resp.status_code}, {len(resp.text)} chars")

    season = sb.rpc("fpl_current_season_id").execute().data
    teams = sb.table("fpl_teams").select("canonical_team_id, name, short_name, teams!inner(display_name, canonical_name)").eq("season_id", season).execute().data
    clubs = {int(t["canonical_team_id"]): club_keys([t["name"], t["teams"]["display_name"], t["teams"]["canonical_name"]]) for t in teams}
    parsed = parse_page(resp.text, clubs) if resp.is_success else {}

    if args.probe:
        import collections
        import lxml.html
        doc = lxml.html.fromstring(resp.text)
        classes = collections.Counter(c for el in doc.iter() if isinstance(el.tag, str) for c in (el.get("class") or "").split())
        i = resp.text.find("Arsenal")
        sb.table("analysis_results").insert({"analysis_id": "ffs_team_news_probe", "code_ref": os.environ.get("GITHUB_SHA", "local"), "result": {
            "status": resp.status_code, "length": len(resp.text),
            "parsed": {str(k): v for k, v in parsed.items()},
            "top_classes": classes.most_common(60),
            "around_arsenal": resp.text[max(0, i - 1500): i + 6000] if i >= 0 else None,
        }}).execute()
        print(f"Probe saved: {len(parsed)} clubs parsed")
        return

    run = sb.table("pipeline_runs").insert({"job_name": "ffs_team_news", "status": "running"}).execute().data[0]["run_id"]
    try:
        if not resp.is_success:
            raise RuntimeError(f"team-news page answered {resp.status_code}")
        now = datetime.now(timezone.utc).isoformat()
        gws = sb.table("fpl_gameweeks").select("fpl_event_id, deadline_time").eq("season_id", season).gt("deadline_time", now).order("deadline_time").limit(1).execute().data
        if not gws:
            raise RuntimeError("no upcoming gameweek")
        event = int(gws[0]["fpl_event_id"])
        players = sb.table("fpl_players").select("fpl_player_id, web_name, first_name, second_name, canonical_team_id, status").eq("season_id", season).neq("status", "u").execute().data
        squads: dict[int, list[dict]] = {}
        for p in players:
            if p["canonical_team_id"] is not None:
                squads.setdefault(int(p["canonical_team_id"]), []).append(p)

        saved = kept = 0
        for team_id, block in parsed.items():
            ids, unmatched = [], []
            for name in block["names"]:
                m = match_name(name, squads.get(team_id, []))
                if m and m["fpl_player_id"] not in ids:
                    ids.append(int(m["fpl_player_id"]))
                elif not m:
                    unmatched.append(name)
            ok = len(ids) >= 10
            if ok:
                sb.table("fpl_external_lineups").delete().eq("source", SOURCE).eq("season_id", season).eq("fpl_event_id", event).eq("team_id", team_id).execute()
                sb.table("fpl_external_lineups").insert([{"source": SOURCE, "season_id": season, "fpl_event_id": event, "team_id": team_id, "fpl_player_id": pid, "entered_by": None} for pid in ids]).execute()
                saved += 1
            else:
                kept += 1
            sb.table("fpl_external_lineup_runs").insert({"source": SOURCE, "season_id": season, "fpl_event_id": event, "team_id": team_id,
                                                         "names_read": len(block["names"]), "matched": len(ids), "unmatched": unmatched,
                                                         "saved": ok, "source_updated": block["updated"]}).execute()
            print(f"team {team_id}: {len(block['names'])} names, {len(ids)} matched, unmatched {unmatched}, {'saved' if ok else 'kept previous'}")

        summary = f"GW{event}: {len(parsed)} clubs read, {saved} saved, {kept} kept previous"
        status = "success" if len(parsed) >= 18 and kept == 0 else "warning"
        sb.table("pipeline_runs").update({"finished_at": "now()", "status": status, "summary": summary}).eq("run_id", run).execute()
        print(f"::notice::{summary}")
        if len(parsed) == 0:
            sys.exit("No club line-ups found on the page -- its layout may have changed.")
    except Exception as e:
        sb.table("pipeline_runs").update({"finished_at": "now()", "status": "failed", "error_message": str(e)[:500]}).eq("run_id", run).execute()
        raise


if __name__ == "__main__":
    main()
