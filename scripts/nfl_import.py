#!/usr/bin/env python3
# ============================================================================
# scripts/nfl_import.py
#
# Daily NFL load (workflow nfl-import.yml), kept separate from the football
# imports so a failure here never touches them.
#
# Source: nflverse (github.com/nflverse/nfldata)
#   games.csv  every game since 1999: schedule, scores, closing lines
#   teams.csv  each team code's full name per season
# Loads seasons from FIRST_SEASON (2002, the current 8-division alignment)
# through public.nfl_upsert_team_seasons / public.nfl_upsert_games, which
# write the unexposed nfl schema. Every write is an upsert on game_id, and a
# file can never blank a score already held.
#
# Then player stats (nflverse-data releases): players/players.csv bios and
# stats_player/stats_player_week_<season>.csv weekly stats for QB, RB, FB,
# WR, TE and K, from PLAYER_FIRST_SEASON (2016). A daily run loads the
# latest season only; --player-seasons loads others (e.g. the backfill).
# Fantasy points are computed in the database (nfl.points_std) and checked
# against nflverse's own points by check_nfl_integrity().
#
# Then team stats (stats_team/stats_team_week_<season>.csv) into
# nfl.team_weeks, from 2002: the latest season daily; --team-seasons for others
# (the backfill: --team-seasons 2002-2026). Reconciled per season.
#
# After loading, it reconciles against the file it just read: game count,
# scored-game count and total points per season must match nfl.games via
# public.nfl_games exactly. Any difference fails the run. One pipeline_runs
# row (job_name nfl_import) per run.
#
#   python scripts/nfl_import.py              games from 2002, players latest season
#   python scripts/nfl_import.py --seasons 2026
#   python scripts/nfl_import.py --player-seasons 2016-2026
# ============================================================================

import argparse
import csv
import io
import os
import sys
import re
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict

from supabase import create_client

GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
TEAMS_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/teams.csv"
FIRST_SEASON = 2002
PLAYER_FIRST_SEASON = 2016
PLAYERS_URL = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
PLAYER_WEEK_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.csv"
TEAM_WEEK_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_{season}.csv"
PLAYER_POSITIONS = {"QB", "RB", "FB", "WR", "TE", "K"}
TEAM_CODES = {"ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND",
              "JAX", "KC", "LA", "LAC", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA",
              "SF", "TB", "TEN", "WAS", "OAK", "SD", "STL"}
BATCH = 500
USER_AGENT = "Mozilla/5.0 (compatible; fixtureshark-nfl-importer/1.0)"


def fetch_csv(url: str) -> list[dict]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        return list(csv.DictReader(io.StringIO(r.read().decode("utf-8"))))


def num(v: str):
    v = (v or "").strip()
    if v in ("", "NA"):
        return None
    f = float(v)
    return int(f) if f.is_integer() else f


def game_row(g: dict) -> dict:
    return {
        "game_id": g["game_id"],
        "season": int(g["season"]),
        "game_type": g["game_type"],
        "week": int(g["week"]),
        "gameday": g["gameday"],
        "gametime": (g.get("gametime") or "").strip() or None,
        "away_code": g["away_team"],
        "home_code": g["home_team"],
        "away_score": num(g["away_score"]),
        "home_score": num(g["home_score"]),
        "overtime": None if num(g["overtime"]) is None else num(g["overtime"]) == 1,
        "neutral_site": g["location"] == "Neutral",
        "div_game": num(g["div_game"]) == 1,
        "spread_line": num(g["spread_line"]),
        "total_line": num(g["total_line"]),
        "away_moneyline": num(g["away_moneyline"]),
        "home_moneyline": num(g["home_moneyline"]),
        "roof": g.get("roof") or None,
        "surface": (g.get("surface") or "").strip() or None,
        "stadium": g.get("stadium") or None,
        "away_qb_name": g.get("away_qb_name") or None,
        "home_qb_name": g.get("home_qb_name") or None,
        "away_coach": g.get("away_coach") or None,
        "home_coach": g.get("home_coach") or None,
        # Modelling inputs (2026-10-04): rest days, starting QBs, weather, both prices.
        "away_rest": num(g.get("away_rest", "")),
        "home_rest": num(g.get("home_rest", "")),
        "temp": num(g.get("temp", "")),
        "wind": num(g.get("wind", "")),
        "away_qb_id": g.get("away_qb_id") or None,
        "home_qb_id": g.get("home_qb_id") or None,
        "away_spread_odds": num(g.get("away_spread_odds", "")),
        "home_spread_odds": num(g.get("home_spread_odds", "")),
        "over_odds": num(g.get("over_odds", "")),
        "under_odds": num(g.get("under_odds", "")),
    }


def inum(v) -> int:
    n = num(v)
    return 0 if n is None else int(n)


def week_row(r: dict) -> dict:
    """One nflverse player-week as an nfl.player_weeks row (every NOT NULL column set)."""
    fg_0_39 = inum(r.get("fg_made_0_19")) + inum(r.get("fg_made_20_29")) + inum(r.get("fg_made_30_39"))
    return {
        "player_id": r["player_id"], "game_id": r["game_id"], "season": int(r["season"]), "week": int(r["week"]),
        "season_type": r["season_type"], "team": r["team"], "opponent": r["opponent_team"], "position": r["position"],
        "completions": inum(r["completions"]), "attempts": inum(r["attempts"]), "passing_yards": inum(r["passing_yards"]),
        "passing_tds": inum(r["passing_tds"]), "interceptions": inum(r["passing_interceptions"]),
        "sacks": inum(r["sacks_suffered"]), "passing_2pt": inum(r["passing_2pt_conversions"]),
        "carries": inum(r["carries"]), "rushing_yards": inum(r["rushing_yards"]), "rushing_tds": inum(r["rushing_tds"]),
        "rushing_2pt": inum(r["rushing_2pt_conversions"]), "receptions": inum(r["receptions"]), "targets": inum(r["targets"]),
        "receiving_yards": inum(r["receiving_yards"]), "receiving_tds": inum(r["receiving_tds"]),
        "receiving_2pt": inum(r["receiving_2pt_conversions"]),
        "fumbles_lost": inum(r["rushing_fumbles_lost"]) + inum(r["receiving_fumbles_lost"]) + inum(r["sack_fumbles_lost"]),
        "special_teams_tds": inum(r["special_teams_tds"]),
        "target_share": num(r["target_share"]), "air_yards_share": num(r["air_yards_share"]), "wopr": num(r["wopr"]),
        "fg_made_0_39": fg_0_39, "fg_made_40_49": inum(r.get("fg_made_40_49")),
        "fg_made_50_plus": inum(r.get("fg_made_50_59")) + inum(r.get("fg_made_60_")),
        "fg_att": inum(r.get("fg_att")), "fg_missed": inum(r.get("fg_missed")),
        "pat_made": inum(r.get("pat_made")), "pat_missed": inum(r.get("pat_missed")),
        "src_points_std": num(r["fantasy_points"]), "src_points_ppr": num(r["fantasy_points_ppr"]),
    }


def team_week_row(r: dict) -> dict:
    """One nflverse team-game as an nfl.team_weeks row (every NOT NULL column set)."""
    return {
        "game_id": r["game_id"], "team": r["team"], "opponent": r["opponent_team"], "season": int(r["season"]),
        "week": int(r["week"]), "season_type": r["season_type"],
        "completions": inum(r["completions"]), "attempts": inum(r["attempts"]), "passing_yards": inum(r["passing_yards"]),
        "passing_tds": inum(r["passing_tds"]), "passing_interceptions": inum(r["passing_interceptions"]),
        "sacks_suffered": inum(r["sacks_suffered"]), "sack_yards_lost": inum(r["sack_yards_lost"]),
        "passing_first_downs": inum(r["passing_first_downs"]), "passing_epa": num(r["passing_epa"]),
        "carries": inum(r["carries"]), "rushing_yards": inum(r["rushing_yards"]), "rushing_tds": inum(r["rushing_tds"]),
        "rushing_first_downs": inum(r["rushing_first_downs"]), "rushing_epa": num(r["rushing_epa"]),
        "fumbles_lost": inum(r["fumbles_lost_total"]), "special_teams_tds": inum(r["special_teams_tds"]),
        "def_sacks": num(r["def_sacks"]) or 0, "def_interceptions": inum(r["def_interceptions"]),
        "def_tds": inum(r["def_tds"]), "def_safeties": inum(r["def_safeties"]),
        "fumble_recovery_opp": inum(r["fumble_recovery_opp"]),
        "def_blocks": inum(r["def_punt_blocks"]) + inum(r["def_fg_blocks"]) + inum(r["def_pat_blocks"]),
        "penalties": inum(r["penalties"]), "penalty_yards": inum(r["penalty_yards"]),
        "fg_made": inum(r["fg_made"]), "fg_att": inum(r["fg_att"]), "pat_made": inum(r["pat_made"]), "pat_att": inum(r["pat_att"]),
    }


def load_team_weeks(sb, seasons: list[int]) -> str:
    """Team stats per game for the given seasons, reconciled per season. Returns a summary line."""
    per_season: dict[int, int] = {}
    written = 0
    for season in seasons:
        try:
            source = fetch_csv(TEAM_WEEK_URL.format(season=season))
        except urllib.error.HTTPError as e:
            if e.code == 404 and season == max(seasons):
                continue  # the file appears with the season's first game
            raise
        keys = [(r["game_id"], r["team"]) for r in source]
        if len(keys) != len(set(keys)):
            raise RuntimeError(f"duplicate team-game in stats_team_week_{season}.csv")
        bad = {c for r in source for c in (r["team"], r["opponent_team"]) if c not in TEAM_CODES}
        if bad:
            raise RuntimeError(f"unmapped team codes in {season} team stats: {sorted(bad)}")
        rows = [team_week_row(r) for r in source]
        for i in range(0, len(rows), BATCH):
            written += sb.rpc("nfl_upsert_team_weeks", {"rows": rows[i:i + BATCH]}).execute().data or 0
        per_season[season] = len(rows)
    diffs = []
    for season, n in per_season.items():
        held = sb.table("nfl_team_games").select("game_id", count="exact").eq("season", season).limit(1).execute().count
        if held != n:
            diffs.append(f"{season}: file {n} v db {held}")
    if diffs:
        raise RuntimeError("team stats reconciliation failed -- " + "; ".join(diffs))
    return f"team-games {written} ({','.join(map(str, per_season))}) reconciled"


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "player"


def season_list(spec: str) -> list[int]:
    out: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-")
            out.update(range(int(a), int(b) + 1))
        else:
            out.add(int(part))
    return sorted(out)


def load_players(sb, seasons: list[int]) -> str:
    """Bios + weekly stats for the given seasons. Returns a summary line."""
    bios = {p["gsis_id"]: p for p in fetch_csv(PLAYERS_URL)}
    weeks: list[dict] = []
    per_season: dict[int, int] = {}
    for season in seasons:
        try:
            source = fetch_csv(PLAYER_WEEK_URL.format(season=season))
        except urllib.error.HTTPError as e:
            # A season's file appears with its first game; before that, skip it.
            if e.code == 404 and season == max(seasons):
                continue
            raise
        rows = [r for r in source if r["position"] in PLAYER_POSITIONS]
        keys = [(r["player_id"], r["game_id"]) for r in rows]
        if len(keys) != len(set(keys)):
            raise RuntimeError(f"duplicate player-week in stats_player_week_{season}.csv")
        bad = {c for r in rows for c in (r["team"], r["opponent_team"]) if c not in TEAM_CODES}
        if bad:
            raise RuntimeError(f"unmapped team codes in {season} player stats: {sorted(bad)}")
        weeks += [week_row(r) for r in rows]
        per_season[season] = len(rows)

    # Players: insert any new ones (slug assigned once, never changed), refresh bios.
    existing: dict[str, str] = {}
    page = 0
    while True:
        chunk = sb.table("nfl_players").select("player_id,slug").range(page * 1000, page * 1000 + 999).execute().data
        existing.update({c["player_id"]: c["slug"] for c in chunk})
        if len(chunk) < 1000:
            break
        page += 1
    taken = set(existing.values())
    names = {}
    for r in weeks:
        names.setdefault(r["player_id"], r)
    players = []
    for pid, w in names.items():
        b = bios.get(pid, {})
        name = b.get("display_name") or pid
        slug = existing.get(pid)
        if slug is None:
            base = slugify(name)
            for cand in (base, f"{base}-{(b.get('position') or w['position']).lower()}", f"{base}-{pid[-4:]}"):
                if cand not in taken:
                    slug = cand
                    break
            else:
                raise RuntimeError(f"no free slug for {pid} {name}")
            taken.add(slug)
        players.append({
            "player_id": pid, "slug": slug, "name": name,
            "position": b.get("position") or w["position"], "position_group": b.get("position_group") or None,
            "latest_team": b.get("latest_team") if b.get("latest_team") in TEAM_CODES else None,
            "birth_date": b.get("birth_date") or None, "height_in": num(b.get("height", "")),
            "weight_lb": num(b.get("weight", "")), "college": b.get("college_name") or None,
            "rookie_season": num(b.get("rookie_season", "")), "draft_year": num(b.get("draft_year", "")),
            "draft_round": num(b.get("draft_round", "")), "draft_pick": num(b.get("draft_pick", "")),
            "draft_team": b.get("draft_team") or None, "jersey_number": num(b.get("jersey_number", "")),
            "status": b.get("status") or None, "years_exp": num(b.get("years_of_experience", "")),
        })
    for i in range(0, len(players), BATCH):
        sb.rpc("nfl_upsert_players", {"rows": players[i:i + BATCH]}).execute()
    written = 0
    for i in range(0, len(weeks), BATCH):
        written += sb.rpc("nfl_upsert_player_weeks", {"rows": weeks[i:i + BATCH]}).execute().data or 0

    # Reconcile: rows held per season must equal the file's.
    diffs = []
    for season, n in per_season.items():
        held = sb.table("nfl_player_weeks").select("player_id", count="exact").eq("season", season).limit(1).execute().count
        if held != n:
            diffs.append(f"{season}: file {n} v db {held}")
    if diffs:
        raise RuntimeError("player reconciliation failed -- " + "; ".join(diffs))
    return f"players {len(players)}, player-weeks {written} ({','.join(map(str, seasons))}) reconciled"


def season_totals(rows) -> dict:
    """(games, scored games, total points) per season."""
    out = defaultdict(lambda: [0, 0, 0])
    for r in rows:
        t = out[int(r["season"])]
        t[0] += 1
        if r["home_score"] is not None:
            t[1] += 1
            t[2] += r["home_score"] + r["away_score"]
    return {k: tuple(v) for k, v in out.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", default="", help="comma-separated seasons; default all from 2002")
    ap.add_argument("--player-seasons", default="", help="e.g. 2016-2026; default the latest season only")
    ap.add_argument("--team-seasons", default="", help="team stats, e.g. 2002-2026; default the player seasons (or the latest)")
    args = ap.parse_args()
    wanted = {int(s) for s in args.seasons.split(",") if s.strip()}

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    run = sb.table("pipeline_runs").insert({"job_name": "nfl_import", "status": "running"}).execute().data[0]

    def finish(status: str, summary: str, error: str | None = None) -> None:
        sb.table("pipeline_runs").update({"status": status, "summary": summary, "error_message": error,
                                          "finished_at": "now()"}).eq("run_id", run["run_id"]).execute()
        print(summary if not error else f"::error::{error}")

    try:
        keep = lambda s: int(s) >= FIRST_SEASON and (not wanted or int(s) in wanted)

        teams = [{"season": int(t["season"]), "code": t["team"], "full_name": t["full"]}
                 for t in fetch_csv(TEAMS_URL) if keep(t["season"])]
        sb.rpc("nfl_upsert_team_seasons", {"rows": teams}).execute()

        source = [g for g in fetch_csv(GAMES_URL) if keep(g["season"])]
        ids = [g["game_id"] for g in source]
        if len(ids) != len(set(ids)):
            raise RuntimeError("duplicate game_id in games.csv")
        rows = [game_row(g) for g in source]
        written = 0
        for i in range(0, len(rows), BATCH):
            written += sb.rpc("nfl_upsert_games", {"rows": rows[i:i + BATCH]}).execute().data or 0

        # Reconcile against what was just read.
        expected = season_totals(rows)
        held = []
        for season in sorted(expected):
            page = 0
            while True:
                chunk = (sb.table("nfl_games").select("season,home_score,away_score")
                         .eq("season", season).range(page * 1000, page * 1000 + 999).execute().data)
                held += chunk
                if len(chunk) < 1000:
                    break
                page += 1
        actual = season_totals(held)
        diffs = [f"{s}: file {expected[s]} v db {actual.get(s)}" for s in sorted(expected) if actual.get(s) != expected[s]]
        if diffs:
            raise RuntimeError("reconciliation failed (games, scored, points) -- " + "; ".join(diffs))

        latest = max(expected)
        g, scored, _ = expected[latest]
        player_seasons = [s for s in season_list(args.player_seasons) if s >= PLAYER_FIRST_SEASON] or [latest]
        players = load_players(sb, player_seasons)
        # Team stats: the same seasons as player stats, but back to 2002.
        team_seasons = [s for s in season_list(args.team_seasons or args.player_seasons) if s >= FIRST_SEASON] or [latest]
        team_stats = load_team_weeks(sb, team_seasons)
        finish("success", f"{len(rows)} games ({min(expected)}-{latest}), {written} written; "
                          f"{latest}: {scored}/{g} scored; reconciled per season; {players}; {team_stats}")
    except Exception as e:  # noqa: BLE001 -- record any failure, then fail the job
        finish("failed", "nfl_import failed", str(e)[:2000])
        sys.exit(1)


if __name__ == "__main__":
    main()
