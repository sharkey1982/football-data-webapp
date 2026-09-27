#!/usr/bin/env python3
# ============================================================================
# scripts/history_backfill.py
#
# One-off load of English league history (tiers 1-4, 1992/93 to 2013/14;
# tier 5, the Conference / National League, 2004/05 to 2013/14).
# Run from GitHub Actions (workflow history-backfill.yml): the sandbox that
# plans this work cannot reach football-data.co.uk, and this needs the
# service key. Three commands:
#
#   stage       Download the football-data.co.uk files named by --targets
#               (default E0-E3, 1993/94 to 2013/14; 'EC' = tier 5 2004/05 to
#               2013/14) and engsoccerdata's results for the same divisions
#               (england.csv for tiers 1-4, england_nonleague.csv for tier 5)
#               into the scratch table historic_source_rows, so club names can
#               be mapped and every result cross-checked in SQL. Idempotent:
#               each file's rows are replaced.
#
#   import-fd   Import football-data.co.uk files into matches, like
#               scripts/import-daily.ts (same fields, same natural-key upsert,
#               same raw-row archive keys, then backfill_match_odds()), one
#               match_import_runs row per file. Differences, and why this is
#               not import-daily.ts:
#                 * era-specific names (ERA_OVERRIDES): football-data.co.uk
#                   spells two pairs of different clubs the same way
#                   ("Halifax", "Chester"), and team_aliases can hold only one
#                   team per spelling -- the current clubs keep the alias;
#                 * refuses seasons from 2014/15 on, so it can never touch
#                   the seasons the model and the daily import own;
#                 * old files are not always UTF-8.
#
#   import-esd  Import engsoccerdata results (full-time scores only) for the
#               seasons football-data.co.uk lacks (1992/93; --esd-codes picks
#               the divisions, e.g. EC for tier 5), with
#               source_name 'engsoccerdata', names through team_aliases rows
#               with source_name 'engsoccerdata'.
#
# Every command ends with one pipeline_runs row (job_name history_backfill).
# See docs/history-backfill.md.
# ============================================================================

import argparse
import csv
import hashlib
import io
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

from supabase import create_client

FD_SOURCE = "football-data.co.uk"
ESD_SOURCE = "engsoccerdata"
ESD_URL = "https://raw.githubusercontent.com/jalapic/engsoccerdata/master/data-raw/england.csv"
ESD_NONLEAGUE_URL = "https://raw.githubusercontent.com/jalapic/engsoccerdata/master/data-raw/england_nonleague.csv"
USER_AGENT = "Mozilla/5.0 (compatible; football-data-webapp-importer/1.0)"
LEAGUES = ["E0", "E1", "E2", "E3"]          # what target 'all' means
ALL_CODES = LEAGUES + ["EC"]
TIER_TO_CODE = {"1": "E0", "2": "E1", "3": "E2", "4": "E3", "5": "EC"}
FIRST_HISTORIC_START_YEAR = {"E0": 1993, "E1": 1993, "E2": 1993, "E3": 1993, "EC": 2004}  # football-data.co.uk files
LAST_HISTORIC_START_YEAR = 2013  # 2014/15 onwards belongs to the regular imports

# (raw football-data.co.uk name, last season start year it means this club, team slug).
# After that year the name falls through to team_aliases (the current club).
ERA_OVERRIDES = [
    ("Halifax", 2007, "halifax-town"),   # Halifax Town (wound up 2008); later FC Halifax Town
    ("Chester", 2009, "chester-city"),   # Chester City (expelled 2010); later Chester FC
]

# (league code, season start year, team slug): clubs whose record for that
# division-season was expunged, so none of their matches are imported from
# either source. Chester City were expelled from the Conference on 26 Feb 2010
# and their 2009/10 results expunged on 8 Mar 2010.
EXPUNGED = [
    ("EC", 2009, "chester-city"),
]

# football-data.co.uk results that disagree with engsoccerdata where a third
# source (11v11.com match records, checked 2026-09-27) sides with
# engsoccerdata. Keyed (code, season start year, ISO date, raw home, raw
# away) -> (home goals, away goals, swap home/away). Applied on import so a
# re-run cannot bring the wrong score back. The one disagreement where
# 11v11 sides with football-data.co.uk (E2 1994/95 Blackpool 2-1 Oxford,
# 1995-02-11) is left as the file has it. See docs/history-backfill.md.
CORRECTIONS = {
    ("E2", 1993, "1994-03-26", "Bristol Rvs", "Barnet"): (5, 2, False),
    ("E1", 1994, "1995-03-19", "Swindon", "West Brom"): (2, 5, True),   # venue reversed in file
    ("E1", 1994, "1994-08-31", "West Brom", "Swindon"): (0, 0, True),   # venue reversed in file
    ("E2", 1994, "1995-04-29", "Hull", "Wrexham"): (3, 2, False),
    ("E3", 1994, "1995-05-06", "Carlisle", "Lincoln"): (1, 3, False),
    ("E1", 1995, "1996-02-24", "Huddersfield", "Crystal Palace"): (3, 0, False),
    ("E2", 1995, "1996-03-09", "Blackpool", "Notts County"): (1, 0, False),
    ("E2", 1995, "1996-05-04", "York", "Blackpool"): (0, 2, False),
    ("E3", 1995, "1996-04-02", "Lincoln", "Scarborough"): (3, 1, False),
    ("E3", 1995, "1996-02-24", "Northampton", "Doncaster"): (3, 3, False),
    ("E3", 1995, "1996-03-23", "Scunthorpe", "Fulham"): (3, 1, False),
    ("E1", 1996, "1997-04-16", "Man City", "Grimsby"): (3, 1, False),
    ("E1", 1996, "1997-03-28", "Tranmere", "Southend"): (3, 0, False),
    ("E2", 1996, "1996-11-30", "Wrexham", "Wycombe"): (1, 0, False),
    ("E3", 1996, "1997-03-18", "Cardiff", "Scarborough"): (1, 1, False),
    ("E3", 1999, "2000-04-08", "Rochdale", "Hartlepool"): (2, 0, False),
    ("E2", 2012, "2012-10-20", "Portsmouth", "Shrewsbury"): (3, 1, False),
}

# Bookmaker home-price columns: any filled means the row carries odds.
ODDS_HOME_COLS = ["B365H", "BWH", "IWH", "LBH", "PSH", "WHH", "SJH", "VCH", "GBH", "BSH", "SBH", "SOH",
                  "BbMxH", "BbAvH", "MaxH", "AvgH", "PSCH"]
STAT_COLS = ["HS", "AS", "HST", "AST", "HC", "AC", "HF", "AF"]


def label_for(y: int) -> str:
    return f"{y % 100:02d}{(y + 1) % 100:02d}"


def fd_url(code: str, y: int) -> str:
    return f"https://football-data.co.uk/mmz4281/{label_for(y)}/{code}.csv"


def fetch(url: str) -> bytes:
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 -- retried, then re-raised
            last = e
            time.sleep(2 + attempt * 3)
    raise RuntimeError(f"download failed: {url}: {last}")


def decode(raw: bytes) -> str:
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")


def parse_fd(text: str) -> tuple[list[str], list[dict]]:
    """Rows as {header: trimmed value}, blank lines dropped -- the same shape
    import-daily.ts builds, so raw_data and row keys match it."""
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return [], []
    reader = csv.reader(io.StringIO("\n".join(lines)))
    rows = list(reader)
    headers = [h.replace("﻿", "").strip() for h in rows[0]]
    out = []
    for cells in rows[1:]:
        out.append({h: (cells[i].strip() if i < len(cells) else "") for i, h in enumerate(headers) if h})
    return headers, out


def iso_date(raw: str | None) -> str | None:
    if not raw:
        return None
    parts = raw.split("/")
    if len(parts) != 3:
        return None
    dd, mm, yy = parts
    if len(yy) == 2:
        n = int(yy)
        yy = str(2000 + n if n < 50 else 1900 + n)
    try:
        return datetime(int(yy), int(mm), int(dd)).date().isoformat()
    except ValueError:
        return None


def to_int(raw) -> int | None:
    if raw is None or str(raw).strip() == "":
        return None
    try:
        f = float(raw)
    except ValueError:
        return None
    return int(f) if f == int(f) else None


def to_result(raw) -> str | None:
    return raw if raw in ("H", "D", "A") else None


def home_team(r: dict) -> str:
    return r.get("HomeTeam") or r.get("HT") or ""


def away_team(r: dict) -> str:
    return r.get("AwayTeam") or r.get("AT") or ""


def filled(r: dict, cols: list[str]) -> bool:
    return any((r.get(c) or "").strip() for c in cols)


def chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def log_pipeline(sb, status: str, summary: str, started: str, error: str | None = None) -> None:
    sb.table("pipeline_runs").insert({"job_name": "history_backfill", "status": status, "summary": summary[:4000],
                                      "started_at": started, "finished_at": datetime.now(timezone.utc).isoformat(),
                                      "error_message": error}).execute()


def parse_targets(spec: str | None) -> list[tuple[str, int]]:
    """'all' -> every E0-E3 (code, year) newest season first; a bare code
    such as 'EC' -> every season of that division; else 'E0:1314,EC:0405'."""
    if not spec or spec == "all":
        return [(c, y) for y in range(LAST_HISTORIC_START_YEAR, 1992, -1) for c in LEAGUES]
    out = []
    for item in spec.split(","):
        item = item.strip()
        if item in ALL_CODES:
            out += [(item, y) for y in range(LAST_HISTORIC_START_YEAR, FIRST_HISTORIC_START_YEAR[item] - 1, -1)]
            continue
        code, label = item.split(":")
        yy = int(label[:2])
        out.append((code, 1900 + yy if yy >= 50 else 2000 + yy))
    return out


# ---------------------------------------------------------------- stage ----

def stage(sb, targets: list[tuple[str, int]], with_esd: bool) -> str:
    notes = []
    for code, y in targets:
        url = fd_url(code, y)
        try:
            headers, rows = parse_fd(decode(fetch(url)))
        except Exception as e:  # noqa: BLE001 -- recorded, next file continues
            notes.append(f"{code} {label_for(y)}: {e}")
            continue
        staged = []
        for i, r in enumerate(rows, start=1):
            h, a = home_team(r), away_team(r)
            if not h or not a:
                continue
            staged.append({
                "source_name": FD_SOURCE, "league_code": code, "season_start_year": y, "row_number": i,
                "match_date": iso_date(r.get("Date")), "home_name": h, "away_name": a,
                "home_goals": to_int(r.get("FTHG") or r.get("HG")), "away_goals": to_int(r.get("FTAG") or r.get("AG")),
                "result": r.get("FTR") or r.get("Res") or None,
                "ht_home_goals": to_int(r.get("HTHG")), "ht_away_goals": to_int(r.get("HTAG")),
                "has_stats": filled(r, STAT_COLS), "has_odds": filled(r, ODDS_HOME_COLS),
            })
        sb.table("historic_source_rows").delete().eq("source_name", FD_SOURCE).eq("league_code", code) \
            .eq("season_start_year", y).execute()
        for part in chunks(staged, 500):
            sb.table("historic_source_rows").insert(part).execute()
        print(f"{code} {label_for(y)}: {len(staged)} rows staged; headers: {','.join(headers[:12])}...")
        notes.append(f"{code} {label_for(y)}={len(staged)}")

    if with_esd:
        codes = {c for c, _ in targets}
        # tiers 1-4: every season 1992-2013 (as first staged); tier 5: the targets' seasons
        by_key = esd_rows(codes, None if codes & set(LEAGUES) else sorted({y for _, y in targets}))
        for (code, y), rs in sorted(by_key.items()):
            staged = []
            for i, r in enumerate(rs, start=1):
                hg, ag = to_int(r["hgoal"]), to_int(r["vgoal"])
                staged.append({
                    "source_name": ESD_SOURCE, "league_code": code, "season_start_year": y, "row_number": i,
                    "match_date": r["Date"] or None, "home_name": r["home"], "away_name": r["visitor"],
                    "home_goals": hg, "away_goals": ag,
                    "result": None if hg is None or ag is None else ("H" if hg > ag else "A" if hg < ag else "D"),
                })
            sb.table("historic_source_rows").delete().eq("source_name", ESD_SOURCE).eq("league_code", code) \
                .eq("season_start_year", y).execute()
            for part in chunks(staged, 500):
                sb.table("historic_source_rows").insert(part).execute()
        notes.append(f"engsoccerdata: {sum(len(v) for v in by_key.values())} rows in {len(by_key)} division-seasons")
    return "stage: " + "; ".join(notes)


# ---------------------------------------------------------------- import ---

def load_lookups(sb, source: str):
    aliases = {}
    start = 0
    while True:
        data = sb.table("team_aliases").select("team_id,raw_name").eq("source_name", source) \
            .range(start, start + 999).execute().data or []
        for a in data:
            aliases[a["raw_name"]] = a["team_id"]
        if len(data) < 1000:
            break
        start += 1000
    leagues = {l["code"]: l["league_id"] for l in sb.table("leagues").select("league_id,code").in_("code", ALL_CODES).execute().data}
    seasons = {s["start_year"]: s["season_id"] for s in sb.table("seasons").select("season_id,start_year").execute().data}
    return aliases, leagues, seasons


def resolve_overrides(sb) -> dict[str, list[tuple[int, int]]]:
    slugs = [s for _, _, s in ERA_OVERRIDES]
    ids = {t["slug"]: t["team_id"] for t in sb.table("teams").select("team_id,slug").in_("slug", slugs).execute().data}
    out: dict[str, list[tuple[int, int]]] = {}
    for raw, last_year, slug in ERA_OVERRIDES:
        if slug not in ids:
            raise RuntimeError(f"era override team '{slug}' not found in teams")
        out.setdefault(raw, []).append((last_year, ids[slug]))
    return out


def resolve_expunged(sb) -> dict[tuple[str, int], set[int]]:
    slugs = [s for _, _, s in EXPUNGED]
    ids = {t["slug"]: t["team_id"] for t in sb.table("teams").select("team_id,slug").in_("slug", slugs).execute().data}
    out: dict[tuple[str, int], set[int]] = {}
    for code, y, slug in EXPUNGED:
        if slug not in ids:
            raise RuntimeError(f"expunged team '{slug}' not found in teams")
        out.setdefault((code, y), set()).add(ids[slug])
    return out


def team_for(raw: str, year: int, aliases: dict, overrides: dict) -> int | None:
    for last_year, team_id in sorted(overrides.get(raw, [])):
        if year <= last_year:
            return team_id
    return aliases.get(raw)


def upsert_matches(sb, inserts: list[dict]) -> int:
    n = 0
    for part in chunks(inserts, 500):
        sb.table("matches").upsert(part, on_conflict="league_id,season_id,match_date,home_team_id,away_team_id").execute()
        n += len(part)
    return n


def log_import_run(sb, code: str, started: str, seen, upserted, status: str, note: str | None) -> None:
    sb.table("match_import_runs").insert({
        "started_at": started, "finished_at": datetime.now(timezone.utc).isoformat(), "league_code": code,
        "rows_seen": seen, "rows_upserted": upserted, "status": status, "error_message": note,
    }).execute()


def archive_rows(sb, code: str, y: int, url: str, text: str, headers: list[str], rows: list[dict]) -> int:
    content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    found = sb.table("raw_match_files").select("raw_file_id").eq("source_name", FD_SOURCE).eq("source_url", url) \
        .eq("content_hash", content_hash).execute().data
    if found:
        raw_file_id = found[0]["raw_file_id"]
    else:
        raw_file_id = sb.table("raw_match_files").insert({
            "source_name": FD_SOURCE, "source_url": url, "source_code": code, "competition_code": code,
            "season_label": label_for(y), "content_hash": content_hash, "row_count": len(rows),
            "column_names": [h for h in headers if h],
            "file_metadata": {"content_length": len(text), "archived_by": "history_backfill"},
        }).execute().data[0]["raw_file_id"]
    now = datetime.now(timezone.utc).isoformat()
    archive = []
    for i, r in enumerate(rows, start=1):
        if not r.get("Date") or not home_team(r) or not away_team(r):
            continue
        archive.append({
            "raw_file_id": raw_file_id, "source_competition_id": None,
            "source_row_key": f"{code}|{r.get('Date', '')}|{home_team(r)}|{away_team(r)}",
            "source_row_number": i, "source_home_team": home_team(r) or None, "source_away_team": away_team(r) or None,
            "source_match_date": iso_date(r.get("Date")), "source_kickoff_time": r.get("Time") or None,
            "raw_data": r, "raw_hash": f"file:{content_hash}:row:{i}", "last_seen_at": now,
        })
    for part in chunks(archive, 200):
        sb.table("source_match_rows").upsert(part, on_conflict="raw_file_id,source_row_key", ignore_duplicates=True).execute()
    return len(archive)


def import_fd(sb, targets: list[tuple[str, int]], archive_odds: bool) -> str:
    aliases, leagues, seasons = load_lookups(sb, FD_SOURCE)
    overrides = resolve_overrides(sb)
    expunged = resolve_expunged(sb)
    notes, total, failures = [], 0, 0
    for code, y in targets:
        started = datetime.now(timezone.utc).isoformat()
        url = fd_url(code, y)
        if y > LAST_HISTORIC_START_YEAR or y not in seasons:
            log_import_run(sb, code, started, None, None, "failed", f"history {label_for(y)}: not a historic season")
            failures += 1
            continue
        try:
            text = decode(fetch(url))
            headers, rows = parse_fd(text)
        except Exception as e:  # noqa: BLE001 -- recorded, next file continues
            log_import_run(sb, code, started, None, None, "failed", f"history {label_for(y)}: {e}")
            failures += 1
            continue
        inserts, skipped, seen_keys, corrected, dropped = [], [], set(), 0, 0
        for r in rows:
            d, h, a = iso_date(r.get("Date")), home_team(r), away_team(r)
            fthg, ftag, ftr = to_int(r.get("FTHG")), to_int(r.get("FTAG")), to_result(r.get("FTR"))
            if not d or not h or not a or fthg is None or ftag is None or ftr is None:
                continue  # blank trailing row or unplayed fixture, as import-daily.ts
            fix = CORRECTIONS.get((code, y, d, h, a))
            if fix:
                fthg, ftag, swap = fix
                ftr = "H" if fthg > ftag else "A" if fthg < ftag else "D"
                if swap:
                    h, a = a, h
                    r = dict(r)
                    for x, z in [("HTHG", "HTAG"), ("HS", "AS"), ("HST", "AST"), ("HC", "AC"), ("HF", "AF"),
                                 ("HY", "AY"), ("HR", "AR")]:
                        r[x], r[z] = r.get(z, ""), r.get(x, "")
                    r["HTR"] = {"H": "A", "A": "H"}.get(r.get("HTR", ""), r.get("HTR", ""))
                corrected += 1
            hid, aid = team_for(h, y, aliases, overrides), team_for(a, y, aliases, overrides)
            if not hid or not aid:
                skipped.append(f"{h} vs {a} on {d} -- no team_aliases mapping")
                continue
            if {hid, aid} & expunged.get((code, y), set()):
                dropped += 1  # record expunged (EXPUNGED)
                continue
            key = (d, hid, aid)
            if key in seen_keys:
                skipped.append(f"{h} vs {a} on {d} -- duplicate row in file")
                continue
            seen_keys.add(key)
            inserts.append({
                "league_id": leagues[code], "season_id": seasons[y], "home_team_id": hid, "away_team_id": aid,
                "match_date": d, "kickoff_time": f"{r['Time']}:00" if r.get("Time") else None,
                "referee": r.get("Referee") or None,
                "full_time_home_goals": fthg, "full_time_away_goals": ftag, "full_time_result": ftr,
                "half_time_home_goals": to_int(r.get("HTHG")), "half_time_away_goals": to_int(r.get("HTAG")),
                "half_time_result": to_result(r.get("HTR")),
                "home_shots": to_int(r.get("HS")), "away_shots": to_int(r.get("AS")),
                "home_shots_on_target": to_int(r.get("HST")), "away_shots_on_target": to_int(r.get("AST")),
                "home_corners": to_int(r.get("HC")), "away_corners": to_int(r.get("AC")),
                "home_fouls": to_int(r.get("HF")), "away_fouls": to_int(r.get("AF")),
                "home_yellow_cards": to_int(r.get("HY")) or 0, "away_yellow_cards": to_int(r.get("AY")) or 0,
                "home_red_cards": to_int(r.get("HR")) or 0, "away_red_cards": to_int(r.get("AR")) or 0,
                "source_name": FD_SOURCE, "source_file": url,
            })
        try:
            upserted = upsert_matches(sb, inserts)
            archived = archive_rows(sb, code, y, url, text, headers, rows) if archive_odds else 0
        except Exception as e:  # noqa: BLE001
            log_import_run(sb, code, started, len(rows), None, "failed", f"history {label_for(y)}: {e}")
            failures += 1
            continue
        note = f"history {label_for(y)}; raw rows archived: {archived}; results corrected: {corrected}"
        if dropped:
            note += f"; {dropped} expunged match(es) not imported"
        if skipped:
            note += f"; {len(skipped)} played row(s) skipped: " + "; ".join(skipped[:10]) + (" ..." if len(skipped) > 10 else "")
        log_import_run(sb, code, started, len(rows), upserted, "success", note)
        print(f"{code} {label_for(y)}: upserted {upserted}, skipped {len(skipped)}, archived {archived}")
        total += upserted
        notes.append(f"{code} {label_for(y)}={upserted}" + (f"(skip {len(skipped)})" if skipped else ""))
    odds_note = ""
    if archive_odds:
        added = sb.rpc("backfill_match_odds", {}).execute().data
        odds_note = f"; odds rows added: {added}"
    return f"import-fd: {total} matches upserted, {failures} file(s) failed{odds_note}; " + ", ".join(notes)


def esd_rows(codes: set[str], years: list[int] | None) -> dict[tuple[str, int], list[dict]]:
    """engsoccerdata rows by (code, season start year): tiers 1-4 from
    england.csv, tier 5 (division 'conference') from england_nonleague.csv.
    years None = 1992 to LAST_HISTORIC_START_YEAR."""
    by_key: dict[tuple[str, int], list[dict]] = {}
    urls = ([ESD_URL] if codes & set(LEAGUES) else []) + ([ESD_NONLEAGUE_URL] if "EC" in codes else [])
    for url in urls:
        for r in csv.DictReader(io.StringIO(decode(fetch(url)))):
            y = int(r["Season"])
            code = TIER_TO_CODE.get(str(r["tier"]).strip())
            if code not in codes or (code == "EC" and r.get("division") != "conference"):
                continue
            if (years is None and not (1992 <= y <= LAST_HISTORIC_START_YEAR)) or (years is not None and y not in years):
                continue
            if r["Date"] == "NA":
                r["Date"] = ""
            by_key.setdefault((code, y), []).append(dict(r, _url=url))
    return by_key


def import_esd(sb, years: list[int], codes: set[str]) -> str:
    aliases, leagues, seasons = load_lookups(sb, ESD_SOURCE)
    expunged = resolve_expunged(sb)
    notes, total = [], 0
    by_key = esd_rows(codes, years)
    for (code, y), rs in sorted(by_key.items()):
        started = datetime.now(timezone.utc).isoformat()
        if y > LAST_HISTORIC_START_YEAR or y not in seasons:
            raise RuntimeError(f"{y} is not a historic season")
        inserts, skipped = [], []
        for r in rs:
            hg, ag = to_int(r["hgoal"]), to_int(r["vgoal"])
            hid, aid = aliases.get(r["home"]), aliases.get(r["visitor"])
            if hg is None or ag is None or not r["Date"]:
                continue
            if not hid or not aid:
                skipped.append(f"{r['home']} vs {r['visitor']} on {r['Date']} -- no team_aliases mapping")
                continue
            if {hid, aid} & expunged.get((code, y), set()):
                continue
            inserts.append({
                "league_id": leagues[code], "season_id": seasons[y], "home_team_id": hid, "away_team_id": aid,
                "match_date": r["Date"], "full_time_home_goals": hg, "full_time_away_goals": ag,
                "full_time_result": "H" if hg > ag else "A" if hg < ag else "D",
                "home_yellow_cards": 0, "away_yellow_cards": 0, "home_red_cards": 0, "away_red_cards": 0,
                "source_name": ESD_SOURCE, "source_file": r["_url"],
            })
        upserted = upsert_matches(sb, inserts)
        note = f"history {label_for(y)} from engsoccerdata"
        if skipped:
            note += f"; {len(skipped)} played row(s) skipped: " + "; ".join(skipped[:10])
        log_import_run(sb, code, started, len(rs), upserted, "success", note)
        total += upserted
        notes.append(f"{code} {label_for(y)}={upserted}" + (f"(skip {len(skipped)})" if skipped else ""))
    return f"import-esd: {total} matches upserted; " + ", ".join(notes)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["stage", "import-fd", "import-esd"])
    p.add_argument("--targets", default="all", help="'all' or e.g. 'E0:1314,E3:9394' (football-data.co.uk files)")
    p.add_argument("--no-esd", action="store_true", help="stage: skip engsoccerdata")
    p.add_argument("--no-odds", action="store_true", help="import-fd: do not archive raw rows / fill match_odds")
    p.add_argument("--esd-years", default="1992", help="import-esd: comma-separated season start years")
    p.add_argument("--esd-codes", default="E0,E1,E2,E3", help="import-esd: divisions, e.g. EC")
    args = p.parse_args()

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    started = datetime.now(timezone.utc).isoformat()
    try:
        if args.command == "stage":
            summary = stage(sb, parse_targets(args.targets), not args.no_esd)
        elif args.command == "import-fd":
            summary = import_fd(sb, parse_targets(args.targets), not args.no_odds)
        else:
            summary = import_esd(sb, [int(x) for x in args.esd_years.split(",")],
                                 {c.strip() for c in args.esd_codes.split(",")})
    except Exception as e:  # noqa: BLE001 -- logged, then the run fails
        log_pipeline(sb, "failed", f"{args.command} failed", started, str(e)[:2000])
        raise
    failed = "failed" in summary and " 0 file(s) failed" not in summary
    log_pipeline(sb, "warning" if failed else "success", summary, started)
    print(summary)


if __name__ == "__main__":
    main()
