#!/usr/bin/env python3
# ============================================================================
# scripts/history_backfill_europe.py
#
# One-off load of European top-flight history from football-data.co.uk,
# alongside scripts/history_backfill.py (English tiers 1-4), whose helpers it
# reuses. Kept as its own script so the two loads never edit the same file.
# Run from GitHub Actions (workflow history-backfill-europe.yml): the sandbox
# that plans this work cannot reach football-data.co.uk, and this needs the
# service key. Commands:
#
#   stage-eu    Download the football-data.co.uk files for the targets and
#               engsoccerdata's tier-1 results for the same countries into the
#               scratch table historic_source_rows_europe, so club names can be
#               mapped and results cross-checked in SQL. Idempotent: each
#               league-season's rows are replaced.
#
#   import-eu   Import the targets into matches, as import-daily.ts would
#               (same fields, same natural-key upsert, one match_import_runs
#               row per league-season, error_message starting 'history
#               <label>'). Two layouts:
#                 * main leagues (SP1, D1, I1, F1, P1, B1, T1, G1, N1, SC0):
#                   one file per season, /mmz4281/<label>/<code>.csv;
#                 * extra leagues (AUT, DNK, NOR, POL, ROU, SWE, SWZ, FIN):
#                   one all-seasons file, /new/<code>.csv, filtered to the
#                   season -- '2016/2017' for split-year leagues, '2016' for
#                   calendar-year ones (NOR, SWE, FIN), stored under the season
#                   that starts in that year, as footballDataCsv.ts does.
#                   Promotion/relegation play-off rows against lower-division
#                   clubs are excluded by the same rule as footballDataCsv.ts
#                   (a club with under a quarter of the season's median games).
#               Refuses seasons from 2025/26 on (the daily imports own them).
#               Raw rows are NOT archived and no match_odds are made unless
#               --with-odds is given: no European league has odds for its
#               current seasons, and odds for 2011-2024 only would change the
#               pooled overround trend on the market page. See the docs.
#
# Targets: 'CODE:FIRST-LAST' start years, comma-separated, e.g.
#   'SP1:2011-2020,D1:2011-2020,AUT:2016-2024'  or 'all' (the planned load).
#
# Every command ends with one pipeline_runs row (job_name history_backfill).
# See docs/history-backfill.md ("European leagues").
# ============================================================================

import argparse
import csv
import io
import os
from datetime import datetime, timezone

from supabase import create_client

from history_backfill import (FD_SOURCE, ESD_SOURCE, ODDS_HOME_COLS, STAT_COLS, archive_rows, chunks, decode,
                              fd_url, fetch, filled, iso_date, label_for, log_import_run, log_pipeline, parse_fd,
                              to_int, to_result, upsert_matches)

MAIN_CODES = ["SP1", "D1", "I1", "F1", "P1", "B1", "T1", "G1", "N1", "SC0"]
EXTRA_CODES = ["AUT", "DNK", "NOR", "POL", "ROU", "SWE", "SWZ", "FIN"]
CALENDAR_YEAR = {"NOR", "SWE", "FIN"}
LAST_START_YEAR = 2024  # 2025/26 onwards belongs to the daily imports

# The planned load (docs/history-backfill.md): big five back to 2011/12, the
# other main-file leagues and the extra leagues back to 2016(/17), filling
# every season up to 2024(/25) that the database lacks.
ALL_TARGETS = ("SP1:2011-2020,D1:2011-2020,I1:2011-2020,F1:2011-2020,"
               "P1:2016-2024,B1:2016-2024,T1:2016-2024,G1:2016-2024,N1:2016-2024,SC0:2016-2024,"
               "AUT:2016-2024,DNK:2016-2024,NOR:2016-2024,POL:2016-2024,ROU:2016-2024,SWE:2016-2024,"
               "SWZ:2016-2024,FIN:2016-2024")

ESD_BASE = "https://raw.githubusercontent.com/jalapic/engsoccerdata/master/data-raw/"
ESD_FILE = {"SP1": "spain", "D1": "germany", "I1": "italy", "F1": "france", "P1": "portugal", "B1": "belgium",
            "T1": "turkey", "G1": "greece", "N1": "holland", "SC0": "scotland"}

# (league code, raw football-data.co.uk name, last season start year it means
# this club, team slug): same-spelling-different-club cases, as ERA_OVERRIDES
# in history_backfill.py. None is needed for the seasons loaded so far: no
# spelling means two clubs within them (docs/history-backfill.md).
EU_ERA_OVERRIDES: list[tuple[str, str, int, str]] = []


def extra_url(code: str) -> str:
    return f"https://football-data.co.uk/new/{code}.csv"


def parse_targets(spec: str | None) -> list[tuple[str, int]]:
    spec = ALL_TARGETS if not spec or spec == "all" else spec
    out = []
    for item in spec.split(","):
        code, years = item.strip().split(":")
        first, _, last = years.partition("-")
        first_y, last_y = int(first), int(last or first)
        if code not in MAIN_CODES + EXTRA_CODES:
            raise ValueError(f"unknown league code {code}")
        out.extend((code, y) for y in range(last_y, first_y - 1, -1))  # newest first
    return out


def season_key(code: str, y: int) -> str:
    return str(y) if code in CALENDAR_YEAR else f"{y}/{y + 1}"


def extra_rows_for(code: str, rows: list[dict], y: int) -> tuple[list[dict], list[tuple[dict, str]]]:
    """Main-shape rows for season y from an all-seasons file, split into kept
    and excluded (play-offs against clubs with under a quarter of the median
    games) -- the rule footballDataCsv.ts applies."""
    want = season_key(code, y)
    cand = []
    for r in rows:
        if (r.get("Season") or "").strip() != want:
            continue
        cand.append({"Date": r.get("Date", ""), "Time": r.get("Time", ""), "HomeTeam": r.get("Home", ""),
                     "AwayTeam": r.get("Away", ""), "FTHG": r.get("HG", ""), "FTAG": r.get("AG", ""),
                     "FTR": r.get("Res", "")})
    games: dict[str, int] = {}
    for r in cand:
        for club in (r["HomeTeam"], r["AwayTeam"]):
            games[club] = games.get(club, 0) + 1
    if not cand:
        return [], []
    counts = sorted(games.values())
    min_games = max(1, counts[len(counts) // 2] // 4)
    kept, excluded = [], []
    for r in cand:
        occasional = [c for c in (r["HomeTeam"], r["AwayTeam"]) if games[c] < min_games]
        if occasional:
            excluded.append((r, f"{', '.join(occasional)} played under a quarter of the season's median games"))
        else:
            kept.append(r)
    return kept, excluded


class Files:
    """Downloads each file once per run."""

    def __init__(self):
        self.cache: dict[str, tuple[str, list[str], list[dict]]] = {}

    def get(self, url: str):
        if url not in self.cache:
            text = decode(fetch(url))
            headers, rows = parse_fd(text)
            self.cache[url] = (text, headers, rows)
        return self.cache[url]

    def season(self, code: str, y: int):
        """(url, text, headers, kept rows, excluded rows, all rows in file)."""
        if code in EXTRA_CODES:
            url = extra_url(code)
            text, headers, rows = self.get(url)
            kept, excluded = extra_rows_for(code, rows, y)
            return url, text, headers, kept, excluded, rows
        url = fd_url(code, y)
        text, headers, rows = self.get(url)
        return url, text, headers, rows, [], rows


# ---------------------------------------------------------------- stage ----

def stage_eu(sb, targets: list[tuple[str, int]], with_esd: bool) -> str:
    files, notes = Files(), []
    for code, y in targets:
        try:
            url, _, headers, kept, excluded, _ = files.season(code, y)
        except Exception as e:  # noqa: BLE001 -- recorded, next file continues
            notes.append(f"{code} {y}: {e}")
            continue
        staged = []
        for i, (r, note) in enumerate([(r, None) for r in kept] + excluded, start=1):
            h, a = r.get("HomeTeam") or "", r.get("AwayTeam") or ""
            if not h or not a:
                continue
            staged.append({
                "source_name": FD_SOURCE, "league_code": code, "season_start_year": y, "row_number": i,
                "season_raw": season_key(code, y) if code in EXTRA_CODES else None,
                "match_date": iso_date(r.get("Date")), "kickoff_time": r.get("Time") or None,
                "home_name": h, "away_name": a,
                "home_goals": to_int(r.get("FTHG")), "away_goals": to_int(r.get("FTAG")),
                "result": r.get("FTR") or None,
                "ht_home_goals": to_int(r.get("HTHG")), "ht_away_goals": to_int(r.get("HTAG")),
                "has_stats": filled(r, STAT_COLS), "has_odds": filled(r, ODDS_HOME_COLS), "note": note,
            })
        sb.table("historic_source_rows_europe").delete().eq("source_name", FD_SOURCE).eq("league_code", code) \
            .eq("season_start_year", y).execute()
        for part in chunks(staged, 500):
            sb.table("historic_source_rows_europe").insert(part).execute()
        print(f"{code} {y}: {len(staged)} rows staged ({len(excluded)} excluded); headers: {','.join(headers[:12])}...")
        notes.append(f"{code} {y}={len(staged)}" + (f"(excl {len(excluded)})" if excluded else ""))

    if with_esd:
        wanted: dict[str, set[int]] = {}
        for code, y in targets:
            if code in ESD_FILE:
                wanted.setdefault(code, set()).add(y)
        for code, years in wanted.items():
            try:
                text = decode(fetch(ESD_BASE + ESD_FILE[code] + ".csv"))
            except Exception as e:  # noqa: BLE001
                notes.append(f"engsoccerdata {code}: {e}")
                continue
            by_year: dict[int, list[dict]] = {}
            for r in csv.DictReader(io.StringIO(text)):
                try:
                    y = int(r["Season"])
                except (KeyError, ValueError):
                    continue
                if str(r.get("tier", "")).strip() == "1" and y in years:
                    by_year.setdefault(y, []).append(r)
            for y, rs in sorted(by_year.items()):
                staged = []
                for i, r in enumerate(rs, start=1):
                    hg, ag = to_int(r.get("hgoal")), to_int(r.get("vgoal"))
                    note = " ".join(x for x in [r.get("division"), r.get("round"), r.get("group"), r.get("notes")]
                                    if x and x != "NA") or None
                    staged.append({
                        "source_name": ESD_SOURCE, "league_code": code, "season_start_year": y, "row_number": i,
                        "match_date": r.get("Date") or None, "home_name": r["home"], "away_name": r["visitor"],
                        "home_goals": hg, "away_goals": ag,
                        "result": None if hg is None or ag is None else ("H" if hg > ag else "A" if hg < ag else "D"),
                        "note": note,
                    })
                sb.table("historic_source_rows_europe").delete().eq("source_name", ESD_SOURCE) \
                    .eq("league_code", code).eq("season_start_year", y).execute()
                for part in chunks(staged, 500):
                    sb.table("historic_source_rows_europe").insert(part).execute()
            notes.append(f"engsoccerdata {code}: {sum(len(v) for v in by_year.values())} rows")
    return "stage-eu: " + "; ".join(notes)


# ---------------------------------------------------------------- import ---

def load_lookups_eu(sb):
    aliases, start = {}, 0
    while True:
        data = sb.table("team_aliases").select("team_id,raw_name").eq("source_name", FD_SOURCE) \
            .range(start, start + 999).execute().data or []
        for a in data:
            aliases[a["raw_name"]] = a["team_id"]
        if len(data) < 1000:
            break
        start += 1000
    leagues = {l["code"]: l["league_id"] for l in
               sb.table("leagues").select("league_id,code").in_("code", MAIN_CODES + EXTRA_CODES).execute().data}
    seasons = {s["start_year"]: s["season_id"] for s in sb.table("seasons").select("season_id,start_year").execute().data}
    overrides: dict[tuple[str, str], list[tuple[int, int]]] = {}
    if EU_ERA_OVERRIDES:
        slugs = [s for *_, s in EU_ERA_OVERRIDES]
        ids = {t["slug"]: t["team_id"] for t in sb.table("teams").select("team_id,slug").in_("slug", slugs).execute().data}
        for code, raw, last_year, slug in EU_ERA_OVERRIDES:
            if slug not in ids:
                raise RuntimeError(f"era override team '{slug}' not found in teams")
            overrides.setdefault((code, raw), []).append((last_year, ids[slug]))
    return aliases, leagues, seasons, overrides


def team_for_eu(code: str, raw: str, year: int, aliases: dict, overrides: dict) -> int | None:
    for last_year, team_id in sorted(overrides.get((code, raw), [])):
        if year <= last_year:
            return team_id
    return aliases.get(raw)


def import_eu(sb, targets: list[tuple[str, int]], with_odds: bool) -> str:
    aliases, leagues, seasons, overrides = load_lookups_eu(sb)
    files, notes, total, failures = Files(), [], 0, 0
    for code, y in targets:
        started = datetime.now(timezone.utc).isoformat()
        label = label_for(y)
        if y > LAST_START_YEAR or y not in seasons:
            log_import_run(sb, code, started, None, None, "failed", f"history {label}: not a historic season")
            failures += 1
            continue
        try:
            url, text, headers, kept, excluded, all_rows = files.season(code, y)
        except Exception as e:  # noqa: BLE001 -- recorded, next file continues
            log_import_run(sb, code, started, None, None, "failed", f"history {label}: {e}")
            failures += 1
            continue
        skipped = [f"{r['HomeTeam']} vs {r['AwayTeam']} on {iso_date(r.get('Date'))} -- {why}" for r, why in excluded]
        inserts, seen_keys = [], set()
        for r in kept:
            d, h, a = iso_date(r.get("Date")), r.get("HomeTeam") or "", r.get("AwayTeam") or ""
            fthg, ftag, ftr = to_int(r.get("FTHG")), to_int(r.get("FTAG")), to_result(r.get("FTR"))
            if not d or not h or not a or fthg is None or ftag is None or ftr is None:
                continue  # blank trailing row or unplayed fixture, as import-daily.ts
            hid, aid = team_for_eu(code, h, y, aliases, overrides), team_for_eu(code, a, y, aliases, overrides)
            if not hid or not aid:
                skipped.append(f"{h} vs {a} on {d} -- no team_aliases mapping")
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
        rows_seen = len(kept) + len(excluded)
        try:
            upserted = upsert_matches(sb, inserts)
            archived = archive_rows(sb, code, y, url, text, headers, all_rows) \
                if with_odds and code in MAIN_CODES else 0
        except Exception as e:  # noqa: BLE001
            log_import_run(sb, code, started, rows_seen, None, "failed", f"history {label}: {e}")
            failures += 1
            continue
        note = f"history {label}; raw rows archived: {archived}"
        if skipped:
            note += f"; {len(skipped)} played row(s) skipped: " + "; ".join(skipped[:10]) + (" ..." if len(skipped) > 10 else "")
        log_import_run(sb, code, started, rows_seen, upserted, "success", note)
        print(f"{code} {label}: upserted {upserted}, skipped {len(skipped)}, archived {archived}")
        for s in skipped:
            print("   skipped:", s)
        total += upserted
        notes.append(f"{code} {label}={upserted}" + (f"(skip {len(skipped)})" if skipped else ""))
    odds_note = ""
    if with_odds:
        added = sb.rpc("backfill_match_odds", {}).execute().data
        odds_note = f"; odds rows added: {added}"
    return f"import-eu: {total} matches upserted, {failures} file(s) failed{odds_note}; " + ", ".join(notes)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["stage-eu", "import-eu"])
    p.add_argument("--targets", default="all", help="'all' or e.g. 'SP1:2011-2020,AUT:2016-2024'")
    p.add_argument("--no-esd", action="store_true", help="stage-eu: skip engsoccerdata")
    p.add_argument("--with-odds", action="store_true", help="import-eu: archive raw rows and fill match_odds")
    args = p.parse_args()

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    started = datetime.now(timezone.utc).isoformat()
    try:
        if args.command == "stage-eu":
            summary = stage_eu(sb, parse_targets(args.targets), not args.no_esd)
        else:
            summary = import_eu(sb, parse_targets(args.targets), args.with_odds)
    except Exception as e:  # noqa: BLE001 -- logged, then the run fails
        log_pipeline(sb, "failed", f"{args.command} failed", started, str(e)[:2000])
        raise
    failed = "failed" in summary and " 0 file(s) failed" not in summary
    log_pipeline(sb, "warning" if failed else "success", summary, started)
    print(summary)


if __name__ == "__main__":
    main()
