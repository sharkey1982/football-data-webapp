#!/usr/bin/env python3
# ============================================================================
# scripts/fpl_gameweek_report.py
#
# FPL gameweek reflection (and, from phase 1, preview) for the weekly log at
# /fpl/gameweek/<season>/<gw>/<kind>. Design: project doc
# claude/fpl-gameweek-preview-reflection-design-2026-10-12.md (Chris, 12 Oct
# 2026): reflection on Tuesday, preview on Thursday.
#
# The reflection is about what the gameweek did to the model, not a
# scorecard:
#   goals       each match: the model's expected goals at the deadline v
#               actual goals v FPL xG; each team's season so far v the
#               market's closing prices; each team's next 5 gameweeks'
#               projected goals now v at the deadline.
#   minutes     deadline start chances v who started; early substitutions;
#               positions played (BBC line-ups) v the role the model used;
#               the biggest moves in next gameweek's start chances.
#   set_pieces  FPL's set-piece orders, deadline v now; penalties missed;
#               FPL's first-choice penalty taker v the model's hierarchy.
#   captaincy   the premium (FPL's most captained), a form pick, the model's
#               top projection and the hindsight best: this gameweek and
#               the season so far.
#   during      injuries, red cards, price changes and model changes since
#               the deadline.
#
# Everything is read point in time where it matters:
#   - the deadline's expected goals come from the deadline snapshot; for
#     GW6 (before the snapshot recorded market goals) they are recomputed
#     with scripts/market_ratings.py from closing prices of matches played
#     before the deadline day, as the projection did that morning;
#   - start chances and roles come from the pre-deadline projection snapshot.
# Text is filled in by template from the numbers, never free text.
#
#   python scripts/fpl_gameweek_report.py --kind reflection --gw 6 [--publish]
#   python scripts/fpl_gameweek_report.py --auto          (pipeline step)
# Needs SUPABASE_DB_URL. Drafts are written unless --publish (or --auto,
# which publishes when a report is due). Writes a GitHub output 'published'.
# ============================================================================

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))

SITE = "https://fixtureshark.com"
POS = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}
SET_PIECE_FIELDS = {
    "penalties_order": "Penalties",
    "direct_freekicks_order": "Direct free kicks",
    "corners_and_indirect_freekicks_order": "Corners and indirect free kicks",
}


def f(x, nd=None):
    if x is None:
        return None
    v = float(x)
    return round(v, nd) if nd is not None else v


def season_label(start_year: int) -> str:
    return f"{start_year}-{str(start_year + 1)[-2:]}"


class Data:
    """Thin read layer over the database."""

    def __init__(self, db):
        self.db = db

    def all(self, sql, params=None):
        return self.db.query(sql, params, fetch="all")

    def one(self, sql, params=None):
        return self.db.query(sql, params, fetch="one")


# ---------------------------------------------------------------------------
# Common lookups
# ---------------------------------------------------------------------------

def load_context(d: Data, gw: int) -> dict:
    season_id = d.one("select public.fpl_current_season_id()")
    start_year = d.one("select start_year from public.seasons where season_id = %s", (season_id,))
    gws = d.all("""select fpl_event_id gw, deadline_time, finished, is_current, is_next,
                          coalesce((source_payload->>'data_checked')::boolean, false) data_checked,
                          (source_payload->>'most_captained')::int most_captained,
                          (source_payload->>'average_entry_score')::int average
                     from public.fpl_gameweeks where season_id = %s order by 1""", (season_id,))
    teams = {r["fpl_team_id"]: r for r in d.all(
        """select ft.fpl_team_id, ft.canonical_team_id team_id, coalesce(t.display_name, t.canonical_name) name, ft.short_name
             from public.fpl_teams ft left join public.teams t on t.team_id = ft.canonical_team_id
            where ft.season_id = %s""", (season_id,))}
    players = {r["fpl_player_id"]: r for r in d.all(
        """select fpl_player_id, web_name, element_type, fpl_team_id, now_cost, selected_by_percent::float8 own, status, news
             from public.fpl_players where season_id = %s""", (season_id,))}
    fixtures = d.all(
        """select ff.fpl_fixture_id, ff.canonical_fixture_id fixture_id, ff.fpl_event_id gw, ff.kickoff_time,
                  ff.fpl_home_team_id h, ff.fpl_away_team_id a, ff.team_h_score hs, ff.team_a_score as_,
                  -- played: FPL's final whistle (provisional) from the live feed; FPL's own
                  -- 'finished' waits for bonus to be confirmed.
                  (coalesce(ff.finished, false) or coalesce(lf.finished_provisional, false)) finished,
                  coalesce(ff.finished, false) confirmed,
                  ff.started, ff.team_h_difficulty fdr_h, ff.team_a_difficulty fdr_a,
                  f.home_team_id, f.away_team_id, f.market_home_goals mh, f.market_away_goals ma,
                  f.predicted_home_goals ph, f.predicted_away_goals pa
             from public.fpl_fixtures ff left join public.fixtures f on f.fixture_id = ff.canonical_fixture_id
             left join public.fpl_live_fixtures lf on lf.season_id = ff.season_id and lf.fpl_fixture_id = ff.fpl_fixture_id
            where ff.season_id = %s order by ff.kickoff_time""", (season_id,))
    return {"season_id": season_id, "label": season_label(start_year), "gws": {g["gw"]: g for g in gws},
            "teams": teams, "players": players, "fixtures": fixtures, "gw": gw}


def team_name(ctx, fpl_team_id):
    t = ctx["teams"].get(fpl_team_id)
    return (t or {}).get("name") or f"team {fpl_team_id}"


def player_label(ctx, pid):
    p = ctx["players"].get(pid) or {}
    return {"id": pid, "name": p.get("web_name") or str(pid), "team": team_name(ctx, p.get("fpl_team_id")),
            "pos": POS.get(p.get("element_type")), "own": f(p.get("own"), 1)}


# ---------------------------------------------------------------------------
# Expected goals at a deadline
# ---------------------------------------------------------------------------

def deadline_expected_goals(d: Data, ctx: dict, gw: int, fixture_ids: list[int]) -> tuple[dict, str]:
    """{canonical fixture_id: (home, away)} as the model had them at gw's deadline, and how."""
    sid = ctx["season_id"]
    snap = d.all("""select fixture_id, market_home_goals mh, market_away_goals ma, predicted_home_goals ph, predicted_away_goals pa
                      from public.fpl_projection_fixture_snapshots
                     where season_id = %s and fpl_event_id = %s and snapshot_kind in ('pre_deadline', 'late')
                     order by snapshot_at desc""", (sid, gw))
    have_market = {r["fixture_id"]: (f(r["mh"]), f(r["ma"])) for r in snap if r["mh"] is not None}
    if fixture_ids and all(fid in have_market for fid in fixture_ids):
        return have_market, "deadline snapshot (market goals)"
    hz = d.all("""select fixture_id, market_home_goals mh, market_away_goals ma from public.fpl_deadline_fixture_horizon
                   where season_id = %s and fpl_event_id = %s and market_home_goals is not null""", (sid, gw))
    have = {r["fixture_id"]: (f(r["mh"]), f(r["ma"])) for r in hz}
    if fixture_ids and all(fid in have for fid in fixture_ids):
        return have, "deadline snapshot (market goals)"
    deadline = ctx["gws"][gw]["deadline_time"]
    return recompute_market(d, ctx, deadline.date(), fixture_ids), \
        f"recomputed: market ratings from closing prices of matches before {deadline:%d %b} (as the projection did that morning)"


def recompute_market(d: Data, ctx: dict, as_of: date, fixture_ids: list[int]) -> dict:
    import numpy as np
    from market_ratings import WINDOW_DAYS, lines_from_rows, market_ratings
    rows = d.all("""select match_date, home_team_id, away_team_id, p_home, p_away, p_over
                      from public.market_closing_lines
                     where league_id = 1 and match_date >= %s and match_date < %s
                       and p_home is not null and p_away is not null and p_over is not null""",
                 (as_of - timedelta(days=WINDOW_DAYS), as_of))
    rated = market_ratings(lines_from_rows(rows), as_of - timedelta(days=1))
    out = {}
    if rated is None:
        return out
    idx, c0, hfa, att, dfn = rated
    fx = {r["fixture_id"]: r for r in ctx["fixtures"]}
    for fid in fixture_ids:
        r = fx.get(fid)
        if not r or r["home_team_id"] not in idx or r["away_team_id"] not in idx:
            continue
        h, a = idx[r["home_team_id"]], idx[r["away_team_id"]]
        out[fid] = (float(np.exp(c0 + hfa + att[h] - dfn[a])), float(np.exp(c0 + att[a] - dfn[h])))
    return out


def recompute_check(d: Data, ctx: dict) -> float | None:
    """Recompute today's ratings and compare with the stored market goals (same method, same day)."""
    sched = [r for r in ctx["fixtures"] if not r["finished"] and r["mh"] is not None and r["fixture_id"]]
    if not sched:
        return None
    today = recompute_market_inclusive(d, ctx, date.today(), [r["fixture_id"] for r in sched])
    diffs = [abs(today[r["fixture_id"]][0] - float(r["mh"])) for r in sched if r["fixture_id"] in today]
    return max(diffs) if diffs else None


def recompute_market_inclusive(d, ctx, as_of, fixture_ids):
    """As refresh_market_goals.py: lines up to and including as_of, rated as of as_of."""
    import numpy as np
    from market_ratings import WINDOW_DAYS, lines_from_rows, market_ratings
    rows = d.all("""select match_date, home_team_id, away_team_id, p_home, p_away, p_over
                      from public.market_closing_lines
                     where league_id = 1 and match_date >= %s and match_date <= %s""",
                 (as_of - timedelta(days=WINDOW_DAYS), as_of))
    rated = market_ratings(lines_from_rows(rows), as_of)
    idx, c0, hfa, att, dfn = rated
    fx = {r["fixture_id"]: r for r in ctx["fixtures"]}
    out = {}
    for fid in fixture_ids:
        r = fx[fid]
        if r["home_team_id"] in idx and r["away_team_id"] in idx:
            h, a = idx[r["home_team_id"]], idx[r["away_team_id"]]
            out[fid] = (float(np.exp(c0 + hfa + att[h] - dfn[a])), float(np.exp(c0 + att[a] - dfn[h])))
    return out


# ---------------------------------------------------------------------------
# Reflection sections
# ---------------------------------------------------------------------------

def team_xg_by_fixture(d: Data, ctx: dict) -> dict:
    """{fpl_fixture_id: {fpl_team_id: xG}} from FPL player xG."""
    rows = d.all("""select pg.fpl_fixture_id, pg.was_home, sum(coalesce(pg.expected_goals, 0))::float8 xg
                      from public.fpl_player_gameweeks pg
                     where pg.season_id = %s and pg.minutes > 0 group by 1, 2""", (ctx["season_id"],))
    fx = {r["fpl_fixture_id"]: r for r in ctx["fixtures"]}
    out = defaultdict(dict)
    for r in rows:
        x = fx.get(r["fpl_fixture_id"])
        if x:
            out[r["fpl_fixture_id"]][x["h"] if r["was_home"] else x["a"]] = r["xg"]
    return out


def section_goals(d: Data, ctx: dict, gw: int) -> dict:
    fixtures = [r for r in ctx["fixtures"] if r["gw"] == gw]
    exp, how = deadline_expected_goals(d, ctx, gw, [r["fixture_id"] for r in fixtures if r["fixture_id"]])
    xg = team_xg_by_fixture(d, ctx)
    matches = []
    for r in fixtures:
        e = exp.get(r["fixture_id"])
        x = xg.get(r["fpl_fixture_id"], {})
        matches.append({
            "home": team_name(ctx, r["h"]), "away": team_name(ctx, r["a"]), "finished": bool(r["finished"]),
            "exp_home": f(e[0], 2) if e else None, "exp_away": f(e[1], 2) if e else None,
            "goals_home": r["hs"], "goals_away": r["as_"],
            "xg_home": f(x.get(r["h"]), 2), "xg_away": f(x.get(r["a"]), 2),
        })

    # Season so far per team: FPL xG v the market's closing-price expectation.
    lines = d.all("""select l.home_team_id, l.away_team_id, l.match_date, l.p_home, l.p_away, l.p_over
                       from public.market_closing_lines l
                      where l.league_id = 1 and l.season_id = %s""", (ctx["season_id"],))
    from market_ratings import implied_goals
    implied = {}
    for l in lines:
        if l["p_home"] is None or l["p_over"] is None:
            continue
        lh, la, _ = implied_goals(float(l["p_home"]), float(l["p_away"]), float(l["p_over"]))
        implied[(l["home_team_id"], l["away_team_id"])] = (lh, la)
    agg = defaultdict(lambda: {"n": 0, "xgf": 0.0, "xga": 0.0, "gf": 0, "ga": 0, "ef": 0.0, "ea": 0.0})
    for r in ctx["fixtures"]:
        if not r["finished"] or r["gw"] > gw:
            continue
        key = (r["home_team_id"], r["away_team_id"])
        x = xg.get(r["fpl_fixture_id"], {})
        if key not in implied or r["h"] not in x or r["a"] not in x:
            continue
        lh, la = implied[key]
        for t, o, gf, ga, ef, ea in ((r["h"], r["a"], r["hs"], r["as_"], lh, la), (r["a"], r["h"], r["as_"], r["hs"], la, lh)):
            s = agg[t]
            s["n"] += 1; s["xgf"] += x[t]; s["xga"] += x[o]; s["gf"] += gf or 0; s["ga"] += ga or 0; s["ef"] += ef; s["ea"] += ea
    season = []
    for t, s in agg.items():
        season.append({"team": team_name(ctx, t), "matches": s["n"],
                       "goals_for": s["gf"], "xg_for": f(s["xgf"], 1), "market_for": f(s["ef"], 1),
                       "goals_against": s["ga"], "xg_against": f(s["xga"], 1), "market_against": f(s["ea"], 1),
                       "attack_vs_market": f(s["xgf"] - s["ef"], 1), "defence_vs_market": f(s["ea"] - s["xga"], 1)})
    season.sort(key=lambda r: -(r["attack_vs_market"] + r["defence_vs_market"]))

    # Next 5 gameweeks: projected goals now v at the deadline.
    nxt = [r for r in ctx["fixtures"] if gw + 1 <= r["gw"] <= gw + 5 and r["fixture_id"]]
    ids = [r["fixture_id"] for r in nxt]
    before = {}
    hz = d.all("""select fixture_id, market_home_goals mh, market_away_goals ma, predicted_home_goals ph, predicted_away_goals pa
                    from public.fpl_deadline_fixture_horizon where season_id = %s and fpl_event_id = %s""", (ctx["season_id"], gw))
    if hz:
        before = {r["fixture_id"]: (f(r["mh"] if r["mh"] is not None else r["ph"]), f(r["ma"] if r["ma"] is not None else r["pa"])) for r in hz}
        before_how = "deadline snapshot"
    else:
        before = recompute_market(d, ctx, ctx["gws"][gw]["deadline_time"].date(), ids)
        before_how = "recomputed point in time (no horizon snapshot before GW7)"
    tot = defaultdict(lambda: {"fb": 0.0, "fn": 0.0, "ab": 0.0, "an": 0.0, "n": 0})
    for r in nxt:
        b = before.get(r["fixture_id"])
        now = (f(r["mh"] if r["mh"] is not None else r["ph"]), f(r["ma"] if r["ma"] is not None else r["pa"]))
        if not b or now[0] is None:
            continue
        for t, fb, fn, ab, an in ((r["h"], b[0], now[0], b[1], now[1]), (r["a"], b[1], now[1], b[0], now[0])):
            s = tot[t]
            s["fb"] += fb; s["fn"] += fn; s["ab"] += ab; s["an"] += an; s["n"] += 1
    next5 = [{"team": team_name(ctx, t), "fixtures": s["n"], "for_before": f(s["fb"], 2), "for_now": f(s["fn"], 2),
              "against_before": f(s["ab"], 2), "against_now": f(s["an"], 2),
              "for_change": f(s["fn"] - s["fb"], 2), "against_change": f(s["an"] - s["ab"], 2)} for t, s in tot.items()]
    next5.sort(key=lambda r: -abs(r["for_change"]) - abs(r["against_change"]))
    return {"matches": matches, "expected_from": how, "season": season, "next5": next5,
            "next5_from": before_how, "next5_gws": [gw + 1, gw + 5]}


def deadline_rows(d: Data, ctx: dict, gw: int) -> list[dict]:
    kinds = d.all("""select snapshot_kind, max(snapshot_at) at from public.fpl_projection_snapshots
                      where season_id = %s and fpl_event_id = %s group by 1""", (ctx["season_id"], gw))
    order = [k["snapshot_kind"] for k in kinds]
    kind = "pre_deadline" if "pre_deadline" in order else ("late" if "late" in order else None)
    if kind is None:
        return []
    model = d.one("""select model_version from public.fpl_projection_snapshots
                      where season_id = %s and fpl_event_id = %s and snapshot_kind = %s
                      order by projection_generated_at desc limit 1""", (ctx["season_id"], gw, kind))
    return d.all("""select s.fixture_id, s.fpl_player_id, s.start_probability::float8 p, s.expected_minutes::float8 xmin,
                           s.tactical_role, s.expected_fpl_points::float8 xpts, s.minutes_source
                      from public.fpl_projection_snapshots s
                     where s.season_id = %s and s.fpl_event_id = %s and s.snapshot_kind = %s and s.model_version = %s""",
                 (ctx["season_id"], gw, kind, model))


def actual_rows(d: Data, ctx: dict, gw: int) -> dict:
    rows = d.all("""select pg.fpl_player_id, pg.fpl_fixture_id, pg.minutes, pg.total_points pts,
                           coalesce((pg.source_payload->'stats'->>'starts')::int, 0) starts, pg.red_cards, pg.penalties_missed,
                           pg.goals_scored, pg.assists
                      from public.fpl_player_gameweeks pg where pg.season_id = %s and pg.fpl_event_id = %s""", (ctx["season_id"], gw))
    fx = {r["fpl_fixture_id"]: r["fixture_id"] for r in ctx["fixtures"]}
    return {(fx.get(r["fpl_fixture_id"]), r["fpl_player_id"]): r for r in rows}


def deadline_state(d: Data, ctx: dict, gw: int) -> dict:
    rows = d.all("""select distinct on (fpl_player_id) fpl_player_id, status, news, now_cost, selected_by_percent::float8 own,
                           chance_of_playing_next_round cop, source_payload
                      from public.fpl_deadline_player_state where season_id = %s and fpl_event_id = %s
                     order by fpl_player_id, snapshot_at""", (ctx["season_id"], gw))
    return {r["fpl_player_id"]: r for r in rows}


def latest_state(d: Data, ctx: dict) -> dict:
    rows = d.all("""select distinct on (fpl_player_id) fpl_player_id, status, news, now_cost, selected_by_percent::float8 own,
                           chance_of_playing_next_round cop, source_payload, snapshot_date
                      from public.fpl_player_snapshots where season_id = %s
                     order by fpl_player_id, snapshot_date desc, captured_at desc""", (ctx["season_id"],))
    return {r["fpl_player_id"]: r for r in rows}


def norm_role(r: str | None) -> str | None:
    if not r or r in ("DEF", "MID"):
        return None  # generic seeded roles say nothing about position
    return {"LCB": "CB", "RCB": "CB"}.get(r, r)


LINE = {"GK": "goal", "CB": "defence", "LB": "defence", "RB": "defence", "LWB": "defence", "RWB": "defence",
        "DM": "midfield", "CM": "midfield", "AM": "midfield", "LW": "wide", "RW": "wide", "CF": "attack"}


def relevant(ctx, pid, top_ids) -> bool:
    p = ctx["players"].get(pid) or {}
    return (p.get("own") or 0) >= 1.0 or pid in top_ids


def top_projected(d: Data, ctx: dict, gw_from: int, gw_to: int, n: int = 50) -> set:
    rows = d.all("""select p.fpl_player_id, sum(p.expected_fpl_points) x
                      from public.fpl_player_projections p
                      join public.fpl_fixtures ff on ff.canonical_fixture_id = p.fixture_id and ff.season_id = p.season_id
                     where p.season_id = %s and ff.fpl_event_id between %s and %s and coalesce(p.scenario_key, 'baseline') = 'baseline'
                       and p.model_version = (select model_version from public.fpl_player_projections where season_id = %s order by generated_at desc limit 1)
                     group by 1 order by 2 desc limit %s""", (ctx["season_id"], gw_from, gw_to, ctx["season_id"], n))
    return {r["fpl_player_id"] for r in rows}


def section_minutes(d: Data, ctx: dict, gw: int, top_ids: set) -> dict:
    snap = deadline_rows(d, ctx, gw)
    act = actual_rows(d, ctx, gw)
    state = deadline_state(d, ctx, gw)
    finished_fx = {r["fixture_id"] for r in ctx["fixtures"] if r["gw"] == gw and r["finished"]}
    brier, n, starters, absences, early = 0.0, 0, [], [], []
    for s in snap:
        if s["fixture_id"] not in finished_fx or s["p"] is None:
            continue
        a = act.get((s["fixture_id"], s["fpl_player_id"]))
        started = bool(a and a["starts"])
        brier += (s["p"] - started) ** 2; n += 1
        st = state.get(s["fpl_player_id"]) or {}
        flagged = (st.get("status") or "a") != "a"
        lab = player_label(ctx, s["fpl_player_id"])
        if started and s["p"] < 0.3:
            starters.append({**lab, "p": f(s["p"], 2), "minutes": a["minutes"], "pts": a["pts"]})
        if not started and s["p"] > 0.7:
            absences.append({**lab, "p": f(s["p"], 2), "flagged": flagged, "news": st.get("news") or None,
                             "minutes": a["minutes"] if a else 0})
        if started and a["minutes"] < 60 and (s["xmin"] or 0) >= 70 and not a["red_cards"]:
            early.append({**lab, "xmin": f(s["xmin"], 0), "minutes": a["minutes"]})
    keyf = lambda r: -(r.get("own") or 0)
    starters.sort(key=lambda r: r["p"]); absences.sort(key=keyf); early.sort(key=keyf)

    # Positions: BBC line-ups v the role the model used.
    pos_rows = d.all("""select lp.fixture_id, lp.fpl_player_id, lp.tactical_role played
                          from public.fixture_lineup_positions lp where lp.fixture_id = any(%s)""",
                     ([r["fixture_id"] for r in ctx["fixtures"] if r["gw"] == gw and r["fixture_id"]],))
    model_role = {(s["fixture_id"], s["fpl_player_id"]): s["tactical_role"] for s in snap}
    positions = []
    for r in pos_rows:
        m = model_role.get((r["fixture_id"], r["fpl_player_id"]))
        if norm_role(m) and norm_role(r["played"]) and norm_role(m) != norm_role(r["played"]):
            moved = LINE.get(norm_role(m)) != LINE.get(norm_role(r["played"]))
            positions.append({**player_label(ctx, r["fpl_player_id"]), "model_role": m, "played_role": r["played"],
                              "kind": "line" if moved else "side"})
    positions.sort(key=lambda r: (r["kind"] != "line", -(r.get("own") or 0)))
    lineups_covered = len({r["fixture_id"] for r in pos_rows})

    # Next gameweek's start chances now v this deadline (same player).
    nxt = gw + 1
    now_rows = d.all("""select p.fpl_player_id, max(p.start_probability)::float8 p, max(p.expected_minutes)::float8 xmin, max(p.minutes_source) src
                          from public.fpl_player_projections p
                          join public.fpl_fixtures ff on ff.canonical_fixture_id = p.fixture_id and ff.season_id = p.season_id
                         where p.season_id = %s and ff.fpl_event_id = %s and coalesce(p.scenario_key, 'baseline') = 'baseline'
                           and p.model_version = (select model_version from public.fpl_player_projections where season_id = %s order by generated_at desc limit 1)
                         group by 1""", (ctx["season_id"], nxt, ctx["season_id"]))
    before = defaultdict(float)
    for s in snap:
        before[s["fpl_player_id"]] = max(before[s["fpl_player_id"]], s["p"] or 0)
    latest = latest_state(d, ctx)
    rec = {r["fpl_player_id"]: r for r in d.all("select fpl_player_id, starts, available_matches from public.fpl_player_start_record")}
    moves = []
    for r in now_rows:
        pid = r["fpl_player_id"]
        if pid not in before or not relevant(ctx, pid, top_ids):
            continue
        delta = (r["p"] or 0) - before[pid]
        if abs(delta) < 0.2:
            continue
        st_now, st_then = latest.get(pid) or {}, state.get(pid) or {}
        if (st_now.get("status") or "a") != "a":
            reason = st_now.get("news") or "flagged by FPL"
        elif (st_then.get("status") or "a") != "a":
            reason = "fit again (FPL flag cleared)"
        else:
            sr = rec.get(pid)
            reason = f"start record {sr['starts']} of {sr['available_matches']}" if sr else "pecking order"
        moves.append({**player_label(ctx, pid), "before": f(before[pid], 2), "now": f(r["p"], 2), "change": f(delta, 2), "reason": reason})
    moves.sort(key=lambda r: -abs(r["change"]))
    return {"brier": f(brier / n, 4) if n else None, "players": n,
            "surprise_starters": starters[:12], "surprise_absences": absences[:15], "early_subs": early[:12],
            "positions": positions[:30], "lineups_covered": lineups_covered,
            "fixtures": len([r for r in ctx["fixtures"] if r["gw"] == gw]),
            "next_gw": nxt, "next_gw_moves": moves[:15]}


def first_choice(state: dict, field: str, ctx: dict) -> dict:
    """{fpl_team_id: [fpl_player_id, ...]} of players at order 1 for this set piece."""
    out = defaultdict(list)
    for pid, r in state.items():
        sp = r.get("source_payload") or {}
        if sp.get(field) == 1:
            p = ctx["players"].get(pid) or {}
            out[p.get("fpl_team_id") or sp.get("team")].append(pid)
    return out


def section_set_pieces(d: Data, ctx: dict, gw: int) -> dict:
    then, now = deadline_state(d, ctx, gw), latest_state(d, ctx)
    changes = []
    for field, label in SET_PIECE_FIELDS.items():
        a, b = first_choice(then, field, ctx), first_choice(now, field, ctx)
        for t in sorted(set(a) | set(b), key=lambda t: team_name(ctx, t)):
            if sorted(a.get(t, [])) != sorted(b.get(t, [])):
                changes.append({"team": team_name(ctx, t), "type": label,
                                "before": [player_label(ctx, p)["name"] for p in a.get(t, [])],
                                "now": [player_label(ctx, p)["name"] for p in b.get(t, [])]})
    act = actual_rows(d, ctx, gw)
    missed = [{**player_label(ctx, r["fpl_player_id"]), "count": r["penalties_missed"]} for r in act.values() if r["penalties_missed"]]
    # FPL's first-choice taker v the model's penalty hierarchy.
    hier = d.all("""select h.team_id, h.source_player_id, h.player_name, h.updated_at
                      from public.set_piece_hierarchies h
                     where h.season_id = %s and h.set_piece_type = 'penalty' and h.rank = 1 and h.valid_to is null""", (ctx["season_id"],))
    canon_to_fpl = {t["team_id"]: k for k, t in ctx["teams"].items() if t.get("team_id")}
    fpl_now = first_choice(now, "penalties_order", ctx)
    mism = []
    for h in hier:
        t = canon_to_fpl.get(h["team_id"])
        fpl_ids = fpl_now.get(t, [])
        if not fpl_ids:
            continue
        model_id = int(h["source_player_id"]) if str(h["source_player_id"] or "").isdigit() else None
        if model_id not in fpl_ids:
            mism.append({"team": team_name(ctx, t), "fpl": [player_label(ctx, p)["name"] for p in fpl_ids],
                         "model": h["player_name"]})
    hier_updated = max((h["updated_at"] for h in hier), default=None)
    return {"order_changes": changes, "penalties_missed": missed, "model_mismatches": mism,
            "hierarchy_updated": hier_updated.date().isoformat() if hier_updated else None,
            "note": "Who took each penalty isn't recorded: FPL's data doesn't say which goals were penalties."}


def section_captaincy(d: Data, ctx: dict, gw: int) -> dict:
    sid = ctx["season_id"]
    pts = defaultdict(dict)   # gw -> pid -> points
    start = defaultdict(dict)
    for r in d.all("""select fpl_player_id, fpl_event_id gw, sum(total_points) p,
                             max(coalesce((source_payload->'stats'->>'starts')::int, 0)) st
                        from public.fpl_player_gameweeks where season_id = %s and fpl_event_id <= %s group by 1, 2""", (sid, gw)):
        pts[r["gw"]][r["fpl_player_id"]] = r["p"]
        start[r["gw"]][r["fpl_player_id"]] = r["st"]
    # The pool: midfielders and forwards who cost 7.0m+ at the start of the
    # season. Fixed and point in time (FPL's per-gameweek ownership and price
    # aren't stored for this season).
    pool = {r["fpl_player_id"] for r in d.all(
        """select fpl_player_id from public.fpl_players
            where season_id = %s and element_type in (3, 4)
              and now_cost - coalesce((source_payload->>'cost_change_start')::int, 0) >= 70""", (sid,))}
    model = {}
    for r in d.all("""select distinct on (fpl_event_id) fpl_event_id gw, fpl_player_id, x from (
                         select fpl_event_id, fpl_player_id, sum(expected_fpl_points) x from public.fpl_projection_snapshots
                          where season_id = %s and snapshot_kind = 'pre_deadline'
                            and model_version = (select model_version from public.fpl_projection_snapshots s2
                                                  where s2.season_id = %s and s2.fpl_event_id = fpl_projection_snapshots.fpl_event_id
                                                    and s2.snapshot_kind = 'pre_deadline' order by projection_generated_at desc limit 1)
                          group by 1, 2) x order by fpl_event_id, x desc""", (sid, sid)):
        model[r["gw"]] = r["fpl_player_id"]
    weeks = []
    for g in range(1, gw + 1):
        if not pts.get(g):
            continue
        played = [p for p in pool if p in pts[g]]
        form = None
        if g > 1:
            cands = [p for p in played if start.get(g - 1, {}).get(p)]
            if cands:
                form = max(cands, key=lambda p: (sum(pts.get(h, {}).get(p, 0) for h in range(max(1, g - 3), g)), -p))
        prem_id = ctx["gws"].get(g, {}).get("most_captained")
        field = played + ([prem_id] if prem_id and prem_id not in played and prem_id in pts[g] else [])
        best = max(field, key=lambda p: pts[g].get(p, 0)) if field else None
        prem = prem_id
        pick = lambda p: None if p is None else {**player_label(ctx, p), "pts": pts[g].get(p, 0)}
        weeks.append({"gw": g, "premium": pick(prem), "form": pick(form), "model": pick(model.get(g)), "best": pick(best),
                      "average": ctx["gws"].get(g, {}).get("average")})

    def total(key, ws):
        vals = [w[key]["pts"] for w in ws if w[key]]
        return sum(vals), len(vals)

    span = [w for w in weeks if w["form"] and w["premium"]]
    season = []
    for key, label, defn in (
        ("premium", "Premium every week", "FPL's most-captained player each gameweek"),
        ("form", "Form pick", "most points in the previous 3 gameweeks, among midfielders and forwards who cost £7.0m+ at the start of the season and started their last match"),
        ("best", "Hindsight best", "the top scorer among those players and the premium (a ceiling, not a strategy)"),
    ):
        t, n = total(key, span)
        beat = sum(1 for w in span if w[key]["pts"] > w["premium"]["pts"]) if key != "premium" else None
        worst = min((w[key]["pts"] for w in span), default=None)
        season.append({"key": key, "label": label, "definition": defn, "weeks": n, "points": t, "captain_points": 2 * t,
                       "beat_premium": beat, "worst": worst})
    mweeks = [w for w in weeks if w["model"] and w["premium"]]
    if mweeks:
        t, n = total("model", mweeks)
        season.append({"key": "model", "label": "Model's top projection", "definition": "the highest projection at each deadline (saved from GW6)",
                       "weeks": n, "points": t, "captain_points": 2 * t,
                       "beat_premium": sum(1 for w in mweeks if w["model"]["pts"] > w["premium"]["pts"]),
                       "worst": min(w["model"]["pts"] for w in mweeks),
                       "premium_same_weeks": sum(w["premium"]["pts"] for w in mweeks)})
    return {"weeks": weeks, "season": season, "span": [span[0]["gw"], span[-1]["gw"]] if span else None,
            "context": {"top_pick_blank_rate": 27.7, "top_pick_best_rate": 19.9, "seasons": "2022/23 to 2025/26",
                        "article": "/fpl/articles/always-captain-the-top-pick", "haaland_article": "/fpl/articles/should-you-always-captain-haaland"}}


def section_during(d: Data, ctx: dict, gw: int, top_ids: set) -> dict:
    then, now = deadline_state(d, ctx, gw), latest_state(d, ctx)
    injuries, prices = [], []
    for pid, b in now.items():
        a = then.get(pid)
        if not a or not relevant(ctx, pid, top_ids):
            continue
        if (a.get("status") or "a") != (b.get("status") or "a"):
            injuries.append({**player_label(ctx, pid), "before": a.get("status"), "now": b.get("status"), "news": b.get("news") or None})
        if a.get("now_cost") != b.get("now_cost") and a.get("now_cost") is not None and b.get("now_cost") is not None:
            prices.append({**player_label(ctx, pid), "before": a["now_cost"] / 10, "now": b["now_cost"] / 10})
    keyf = lambda r: -(r.get("own") or 0)
    injuries.sort(key=keyf); prices.sort(key=keyf)
    reds = [player_label(ctx, r["fpl_player_id"]) for r in actual_rows(d, ctx, gw).values() if r["red_cards"]]
    deadline = ctx["gws"][gw]["deadline_time"]
    changes = d.all("""select changed_at, area, title from public.model_change_log where changed_at >= %s order by changed_at, title""",
                    (deadline.date(),))
    return {"injuries": injuries[:25], "prices": prices[:25], "red_cards": reds,
            "model_changes": [{"date": c["changed_at"].isoformat(), "area": c["area"], "title": c["title"]} for c in changes]}


# ---------------------------------------------------------------------------
# Text
# ---------------------------------------------------------------------------

def fmt_signed(v, nd=1):
    if v is None:
        return "–"
    return f"{'+' if v > 0 else '−' if v < 0 else ''}{abs(v):.{nd}f}"


def headlines(p: dict) -> list[str]:
    out = []
    ms = [m for m in p["goals"]["matches"] if m["exp_home"] is not None and m["goals_home"] is not None]
    if ms:
        def surprise(m):
            return max((m["goals_home"] - m["exp_home"], m["home"], m["away"], m["goals_home"], m["goals_away"], m["exp_home"], m["exp_away"]),
                       (m["goals_away"] - m["exp_away"], m["away"], m["home"], m["goals_away"], m["goals_home"], m["exp_away"], m["exp_home"]),
                       key=lambda x: abs(x[0]))
        s = max((surprise(m) for m in ms), key=lambda x: abs(x[0]))
        out.append(f"{s[1]} scored {s[3]} against {s[2]} where the model expected {s[5]:.1f}.")
    cap = {r["key"]: r for r in p["captaincy"]["season"]}
    if "premium" in cap and "form" in cap and cap["premium"]["weeks"]:
        a, b = cap["premium"], cap["form"]
        out.append(f"Captaincy since GW{p['captaincy']['span'][0]}: the premium every week has {a['captain_points']} captain points; "
                   f"the form pick {b['captain_points']}, ahead in {b['beat_premium']} of {b['weeks']} weeks.")
    mins = p["minutes"]
    if mins["surprise_absences"]:
        r = mins["surprise_absences"][0]
        out.append(f"{r['name']} ({r['team']}) was {round(r['p'] * 100)}% to start and didn't" + (" (flagged)." if r["flagged"] else "."))
    elif mins["brier"] is not None:
        out.append(f"Start predictions: Brier score {mins['brier']:.3f} over {mins['players']} players.")
    return out


def reddit_md(p: dict, url: str) -> str:
    gw = p["gw"]
    lines = [f"**FPL GW{gw} reflection: what the gameweek did to the numbers**", ""]
    for h in p["headlines"]:
        lines.append(f"- {h}")
    lines += ["", "**Goals v the model (deadline expected goals)**", "", "| Match | Expected | Goals | xG |", "|---|---|---|---|"]
    for m in p["goals"]["matches"]:
        if m["goals_home"] is None:
            continue
        e = f"{m['exp_home']:.1f}–{m['exp_away']:.1f}" if m["exp_home"] is not None else "–"
        x = f"{m['xg_home']:.1f}–{m['xg_away']:.1f}" if m["xg_home"] is not None else "–"
        lines.append(f"| {m['home']} v {m['away']} | {e} | {m['goals_home']}–{m['goals_away']} | {x} |")
    cap = p["captaincy"]
    if cap["season"]:
        lines += ["", f"**Captaincy, GW{cap['span'][0]}–GW{cap['span'][1]} (captain points)**", "", "| Approach | Points | Beat the premium |", "|---|---|---|"]
        for r in cap["season"]:
            if r["key"] == "model":
                continue
            beat = "–" if r["beat_premium"] is None else f"{r['beat_premium']} of {r['weeks']}"
            lines.append(f"| {r['label']} | {r['captain_points']} | {beat} |")
    lines += ["", f"Full reflection (minutes, positions, set pieces, injuries): {url}"]
    return "\n".join(lines)


def x_thread(p: dict, url: str) -> list[str]:
    gw = p["gw"]
    posts = [f"FPL GW{gw} reflection: what the gameweek did to our numbers. 🧵"]
    posts += [h[:270] for h in p["headlines"]]
    posts.append(f"Goals v the model, minutes and positions, set pieces and captaincy: {url}")
    return posts[:5]


# ---------------------------------------------------------------------------
# Preview (phase 1)
# ---------------------------------------------------------------------------
#
# Live versions read the current projections; the frozen version, written
# once the deadline has passed, reads the deadline snapshot (fpl_projection_
# snapshots for the gameweek, fpl_deadline_*_horizon for the 10 weeks), so
# the record is exactly what the projections said before kick-off.

SIM_WORLDS = 20000
# The automatic step publishes reflections from this gameweek on. GW6 is held
# for Chris's review of the reworked layout (13 Oct 2026) and published by
# hand (workflow gameweek-report, publish ticked).
REFLECTION_AUTO_FROM_GW = 7


def projection_rows(d: Data, ctx: dict, gw: int, frozen: bool) -> list[dict]:
    """Per player per fixture for gw..gw+9: xpts, start chance, minutes, role."""
    sid = ctx["season_id"]
    if frozen:
        return d.all("""select h.fixture_id, h.fixture_event_id gw, h.fpl_player_id, h.expected_fpl_points::float8 xpts,
                               h.start_probability::float8 p, h.expected_minutes::float8 xmin, h.tactical_role, h.minutes_source
                          from public.fpl_deadline_player_horizon h
                         where h.season_id = %s and h.fpl_event_id = %s and h.snapshot_kind in ('pre_deadline', 'late')""", (sid, gw))
    return d.all("""select p.fixture_id, ff.fpl_event_id gw, p.fpl_player_id, p.expected_fpl_points::float8 xpts,
                           p.start_probability::float8 p, p.expected_minutes::float8 xmin, p.tactical_role, p.minutes_source
                      from public.fpl_player_projections p
                      join public.fpl_fixtures ff on ff.canonical_fixture_id = p.fixture_id and ff.season_id = p.season_id
                     where p.season_id = %s and ff.fpl_event_id between %s and %s and coalesce(p.scenario_key, 'baseline') = 'baseline'
                       and p.model_version = (select model_version from public.fpl_player_projections where season_id = %s order by generated_at desc limit 1)""",
                 (sid, gw, gw + 9, sid))


def fixture_goals(d: Data, ctx: dict, gw: int, frozen: bool) -> dict:
    """{canonical fixture_id: (home, away)} for gw..gw+9 (market where priced, else Dixon-Coles)."""
    if frozen:
        rows = d.all("""select fixture_id, coalesce(market_home_goals, predicted_home_goals)::float8 h,
                               coalesce(market_away_goals, predicted_away_goals)::float8 a
                          from public.fpl_deadline_fixture_horizon
                         where season_id = %s and fpl_event_id = %s and snapshot_kind in ('pre_deadline', 'late')""", (ctx["season_id"], gw))
        return {r["fixture_id"]: (r["h"], r["a"]) for r in rows}
    out = {}
    for r in ctx["fixtures"]:
        if gw <= r["gw"] <= gw + 9 and r["fixture_id"]:
            h = r["mh"] if r["mh"] is not None else r["ph"]
            a = r["ma"] if r["ma"] is not None else r["pa"]
            if h is not None and a is not None:
                out[r["fixture_id"]] = (float(h), float(a))
    return out


def sim_players(d: Data, ctx: dict, gw: int, frozen: bool, ids: list[int]) -> tuple[list, dict]:
    """The inputs simulate() needs, for the given players in gw."""
    import numpy as np
    sid = ctx["season_id"]
    cols = """fixture_id, fpl_player_id, start_probability, sub_appearance_probability, expected_goals, expected_assists, expected_saves,
              defensive_contribution_probability, expected_bonus, xpts_cards_own_goals, xpts_penalties, expected_fpl_points"""
    if frozen:
        rows = d.all(f"""select {cols} from public.fpl_projection_snapshots s
                          where season_id = %s and fpl_event_id = %s and snapshot_kind in ('pre_deadline', 'late')
                            and model_version = (select model_version from public.fpl_projection_snapshots
                                                  where season_id = %s and fpl_event_id = %s order by projection_generated_at desc limit 1)
                            and fpl_player_id = any(%s)""", (sid, gw, sid, gw, ids))
    else:
        rows = d.all(f"""select {cols} from public.fpl_player_projections p
                          where season_id = %s and coalesce(scenario_key, 'baseline') = 'baseline' and fpl_player_id = any(%s)
                            and model_version = (select model_version from public.fpl_player_projections where season_id = %s order by generated_at desc limit 1)
                            and fixture_id in (select canonical_fixture_id from public.fpl_fixtures where season_id = %s and fpl_event_id = %s)""",
                     (sid, ids, sid, sid, gw))
    goals = fixture_goals(d, ctx, gw, frozen)
    fx = {r["fixture_id"]: r for r in ctx["fixtures"]}
    fixtures = {}
    for fid in {r["fixture_id"] for r in rows}:
        g = goals.get(fid)
        if g:
            fixtures[fid] = {"market_home_goals": g[0], "market_away_goals": g[1], "predicted_home_goals": g[0], "predicted_away_goals": g[1]}
    bands = {b["fpl_player_id"]: b for b in d.all(
        "select fpl_player_id, p_off_before_60, p_off_60_84, p_full from public.fpl_player_exit_bands where season_id = %s", (sid,))}
    num = lambda v: float(v or 0)
    players = []
    for r in rows:
        f, m = fx.get(r["fixture_id"]), ctx["players"].get(r["fpl_player_id"])
        if not f or not m or r["fixture_id"] not in fixtures:
            continue
        home = m["fpl_team_id"] == f["h"]
        g = goals[r["fixture_id"]]
        b = bands.get(r["fpl_player_id"]) or {"p_off_before_60": 0, "p_off_60_84": 0, "p_full": 1}
        players.append({
            "id": r["fpl_player_id"], "pos": m["element_type"], "fixture": r["fixture_id"], "home": home,
            "lam_for": g[0] if home else g[1], "lam_against": g[1] if home else g[0],
            "p_start": min(max(num(r["start_probability"]), 0), 1), "p_sub": min(max(num(r["sub_appearance_probability"]), 0), 1),
            "xg": num(r["expected_goals"]), "xa": num(r["expected_assists"]), "xsaves": num(r["expected_saves"]),
            "p_dc": num(r["defensive_contribution_probability"]), "bonus": num(r["expected_bonus"]),
            "flat": num(r["xpts_cards_own_goals"]) + num(r["xpts_penalties"]), "xpts": num(r["expected_fpl_points"]),
            "bands": np.array([num(b["p_off_before_60"]), num(b["p_off_60_84"]), num(b["p_full"])]),
        })
    return players, fixtures


def captain_chances(d: Data, ctx: dict, gw: int, frozen: bool, ids: list[int]) -> dict:
    """{player id: chance of the most points among ids} (20,000 worlds; a double gameweek sums both fixtures)."""
    import numpy as np
    from analysis_squad_variance import simulate
    players, fixtures = sim_players(d, ctx, gw, frozen, ids)
    if not players:
        return {}
    rng = np.random.default_rng(gw * 1000 + 13)
    pts = simulate(players, fixtures, SIM_WORLDS, rng)
    order = sorted({p["id"] for p in players})
    col = {pid: k for k, pid in enumerate(order)}
    tot = np.zeros((SIM_WORLDS, len(order)), dtype=np.float32)
    for j, p in enumerate(players):
        tot[:, col[p["id"]]] += pts[:, j]
    best = tot.max(axis=1, keepdims=True)
    winners = (tot == best)
    share = winners / winners.sum(axis=1, keepdims=True)   # ties split
    means = tot.mean(axis=0)
    return {pid: {"top": float(share[:, col[pid]].mean()), "sim_mean": float(means[col[pid]])} for pid in order}


def section_fixtures(ctx: dict, gw: int, goals: dict) -> list[dict]:
    out = []
    for r in ctx["fixtures"]:
        if r["gw"] != gw:
            continue
        g = goals.get(r["fixture_id"])
        out.append({"home": team_name(ctx, r["h"]), "away": team_name(ctx, r["a"]), "kickoff": r["kickoff_time"].isoformat() if r["kickoff_time"] else None,
                    "goals_home": f(g[0], 2) if g else None, "goals_away": f(g[1], 2) if g else None,
                    "cs_home": f(math.exp(-g[1]), 3) if g else None, "cs_away": f(math.exp(-g[0]), 3) if g else None,
                    "fdr_home": r["fdr_h"], "fdr_away": r["fdr_a"]})
    return out


def section_fixture_run(ctx: dict, gw: int, goals: dict) -> list[dict]:
    """Per team: each of the next 10 gameweeks' fixtures with goals for and against."""
    teams = defaultdict(lambda: defaultdict(list))
    for r in ctx["fixtures"]:
        if not (gw <= r["gw"] <= gw + 9):
            continue
        g = goals.get(r["fixture_id"])
        if not g:
            continue
        for t, o, gf, ga, home in ((r["h"], r["a"], g[0], g[1], True), (r["a"], r["h"], g[1], g[0], False)):
            teams[t][r["gw"]].append({"opp": (ctx["teams"].get(o) or {}).get("short_name") or team_name(ctx, o), "home": home,
                                      "for": f(gf, 2), "against": f(ga, 2)})
    out = []
    for t, by_gw in teams.items():
        weeks = [{"gw": g, "fixtures": by_gw.get(g, [])} for g in range(gw, gw + 10)]
        out.append({"team": team_name(ctx, t), "weeks": weeks,
                    "for_5": f(sum(x["for"] for w in weeks[:5] for x in w["fixtures"]), 1),
                    "against_5": f(sum(x["against"] for w in weeks[:5] for x in w["fixtures"]), 1),
                    "for_10": f(sum(x["for"] for w in weeks for x in w["fixtures"]), 1),
                    "against_10": f(sum(x["against"] for w in weeks for x in w["fixtures"]), 1)})
    out.sort(key=lambda r: -(r["for_5"] - r["against_5"]))
    return out


def section_changes(d: Data, ctx: dict, gw: int, frozen: bool, top_ids: set) -> dict:
    """Since the previous deadline: availability, prices, set pieces, model changes, blanks and doubles."""
    prev = gw - 1
    then = deadline_state(d, ctx, prev) if prev >= 1 else {}
    now = deadline_state(d, ctx, gw) if frozen else latest_state(d, ctx)
    injuries, prices = [], []
    for pid, b in now.items():
        a = then.get(pid)
        if not a or not relevant(ctx, pid, top_ids):
            continue
        if (a.get("status") or "a") != (b.get("status") or "a") or (b.get("status") or "a") != "a" and a.get("news") != b.get("news"):
            injuries.append({**player_label(ctx, pid), "before": a.get("status"), "now": b.get("status"), "news": b.get("news") or None})
        if a.get("now_cost") is not None and b.get("now_cost") is not None and a["now_cost"] != b["now_cost"]:
            prices.append({**player_label(ctx, pid), "before": a["now_cost"] / 10, "now": b["now_cost"] / 10})
    keyf = lambda r: -(r.get("own") or 0)
    injuries.sort(key=keyf); prices.sort(key=keyf)
    sp = []
    if then:
        for field, label in SET_PIECE_FIELDS.items():
            a, b = first_choice(then, field, ctx), first_choice(now, field, ctx)
            for t in sorted(set(a) | set(b), key=lambda t: team_name(ctx, t)):
                if sorted(a.get(t, [])) != sorted(b.get(t, [])):
                    sp.append({"team": team_name(ctx, t), "type": label, "before": [player_label(ctx, p)["name"] for p in a.get(t, [])],
                               "now": [player_label(ctx, p)["name"] for p in b.get(t, [])]})
    since = ctx["gws"][prev]["deadline_time"].date() if prev in ctx["gws"] else None
    changes = d.all("select changed_at, area, title from public.model_change_log where changed_at >= %s order by changed_at, title", (since,)) if since else []
    count = defaultdict(int)
    for r in ctx["fixtures"]:
        if r["gw"] == gw:
            count[r["h"]] += 1; count[r["a"]] += 1
    blanks = [team_name(ctx, t) for t in ctx["teams"] if count.get(t, 0) == 0]
    doubles = [team_name(ctx, t) for t, c in count.items() if c > 1]
    return {"since_gw": prev, "injuries": injuries[:25], "prices": prices[:25], "set_pieces": sp,
            "model_changes": [{"date": c["changed_at"].isoformat(), "area": c["area"], "title": c["title"]} for c in changes],
            "blanks": sorted(blanks), "doubles": sorted(doubles)}


def build_preview(d: Data, gw: int, frozen: bool = False) -> dict:
    ctx = load_context(d, gw)
    rows = projection_rows(d, ctx, gw, frozen)
    if not rows:
        raise SystemExit(f"No {'deadline snapshot' if frozen else 'projections'} for GW{gw}.")
    goals = fixture_goals(d, ctx, gw, frozen)
    state = deadline_state(d, ctx, gw) if frozen else latest_state(d, ctx)
    agg = defaultdict(lambda: {"gw": 0.0, "g5": 0.0, "g10": 0.0, "p": 0.0, "xmin": 0.0, "fx": 0})
    for r in rows:
        a = agg[r["fpl_player_id"]]
        x = r["xpts"] or 0
        a["g10"] += x
        if r["gw"] < gw + 5:
            a["g5"] += x
        if r["gw"] == gw:
            a["gw"] += x; a["p"] = max(a["p"], r["p"] or 0); a["xmin"] += r["xmin"] or 0; a["fx"] += 1
    top_ids = {pid for pid, _ in sorted(agg.items(), key=lambda kv: -kv[1]["g5"])[:50]}

    def row(pid):
        a, m, st = agg[pid], ctx["players"].get(pid) or {}, state.get(pid) or {}
        cost = st.get("now_cost") or m.get("now_cost")
        own = st.get("own") if st.get("own") is not None else m.get("own")
        return {**player_label(ctx, pid), "own": f(own, 1), "price": cost / 10 if cost else None,
                "gw_xpts": f(a["gw"], 2), "xpts_5": f(a["g5"], 1), "xpts_10": f(a["g10"], 1),
                "start": f(a["p"], 2), "xmin": f(a["xmin"], 0), "fixtures": a["fx"],
                "status": st.get("status") or "a", "news": st.get("news") or None}

    capt = sorted((pid for pid in agg if agg[pid]["fx"]), key=lambda pid: -agg[pid]["gw"])[:8]
    chances = captain_chances(d, ctx, gw, frozen, capt)
    captains = [{**row(pid), "top_chance": f(chances.get(pid, {}).get("top"), 3)} for pid in capt]

    by_pos = {}
    for pos, label in POS.items():
        ids = [pid for pid in agg if (ctx["players"].get(pid) or {}).get("element_type") == pos]
        by_pos[label] = [row(pid) for pid in sorted(ids, key=lambda pid: -agg[pid]["g5"])[:8]]
    value_pool = [pid for pid in agg if agg[pid]["p"] >= 0.7 and (row(pid)["price"] or 0) > 0]
    value = sorted((row(pid) for pid in value_pool), key=lambda r: -(r["xpts_5"] / r["price"]))[:8]
    for r in value:
        r["per_m"] = f(r["xpts_5"] / r["price"], 2)
    diffs = sorted((row(pid) for pid in agg if (row(pid)["own"] or 0) < 5 and agg[pid]["p"] >= 0.7),
                   key=lambda r: -r["xpts_5"])[:8]
    rec = {r["fpl_player_id"]: r for r in d.all("select fpl_player_id, starts, available_matches from public.fpl_player_start_record")}
    watch = []
    for pid, a in agg.items():
        m = ctx["players"].get(pid) or {}
        if not a["fx"] or a["p"] >= 0.7:
            continue
        r = row(pid)
        if (r["own"] or 0) < 5 and pid not in top_ids:
            continue
        sr = rec.get(pid)
        if r["status"] != "a":
            why = r["news"] or statusish(r["status"])
        elif sr and sr["available_matches"] and sr["starts"] / sr["available_matches"] < 0.7:
            why = f"started {sr['starts']} of {sr['available_matches']} available"
        else:
            why = "pecking order"
        watch.append({**r, "why": why})
    watch.sort(key=lambda r: -(r["own"] or 0))

    p = {"kind": "preview", "season": ctx["label"], "gw": gw, "frozen": frozen,
         "deadline": ctx["gws"][gw]["deadline_time"].isoformat(),
         "generated_at": datetime.now(timezone.utc).isoformat(),
         "source": "deadline snapshot" if frozen else "live projections",
         "fixtures": section_fixtures(ctx, gw, goals),
         "captains": captains, "sim_worlds": SIM_WORLDS,
         "picks": by_pos, "value": value, "differentials": diffs, "minutes_watch": watch[:15],
         "fixture_run": section_fixture_run(ctx, gw, goals),
         "changes": section_changes(d, ctx, gw, frozen, top_ids)}
    p["headlines"] = preview_headlines(p)
    return p


def statusish(s):
    return {"d": "doubtful", "i": "injured", "s": "suspended", "u": "unavailable", "n": "not in the squad"}.get(s, s)


def preview_headlines(p: dict) -> list[str]:
    out = []
    c = p["captains"]
    if c:
        top = c[0]
        ch = f" and a {round(top['top_chance'] * 100)}% chance of outscoring the other seven" if top.get("top_chance") is not None else ""
        out.append(f"{top['name']} leads the captaincy table on {top['gw_xpts']:.1f} projected points{ch}.")
    fx = [x for x in p["fixtures"] if x["goals_home"] is not None]
    if fx:
        m = max(fx, key=lambda x: abs(x["goals_home"] - x["goals_away"]))
        fav, dog, gf = (m["home"], m["away"], m["goals_home"]) if m["goals_home"] >= m["goals_away"] else (m["away"], m["home"], m["goals_away"])
        out.append(f"The most one-sided fixture: {fav} against {dog}, {gf:.1f} goals expected for {fav}.")
    inj = [r for r in p["changes"]["injuries"] if (r["now"] or "a") != "a"]
    if inj:
        r = inj[0]
        out.append(f"{r['name']} ({r['team']}, {r['own']}% owned): {r['news'] or statusish(r['now'])}.")
    return out


def preview_key(p: dict) -> str:
    """What counts as a material change between live versions."""
    return json.dumps({"c": [(r["id"], round(r["gw_xpts"], 1)) for r in p["captains"]],
                       "w": [(r["id"], r["status"]) for r in p["minutes_watch"]],
                       "i": [(r["id"], r["now"]) for r in p["changes"]["injuries"]]}, sort_keys=True)


def preview_reddit_md(p: dict, url: str) -> str:
    lines = [f"**FPL GW{p['gw']} preview: projections, captaincy and fixtures**", ""]
    lines += [f"- {h}" for h in p["headlines"]]
    lines += ["", "**Captaincy**", "", "| Player | xPts | Chance of top score | Start |", "|---|---|---|---|"]
    for r in p["captains"]:
        tc = f"{round(r['top_chance'] * 100)}%" if r.get("top_chance") is not None else "–"
        lines.append(f"| {r['name']} ({r['team']}) | {r['gw_xpts']:.1f} | {tc} | {round((r['start'] or 0) * 100)}% |")
    lines += ["", "**Fixtures (expected goals; clean-sheet chance)**", "", "| Match | Goals | Clean sheet |", "|---|---|---|"]
    for x in p["fixtures"]:
        if x["goals_home"] is None:
            continue
        lines.append(f"| {x['home']} v {x['away']} | {x['goals_home']:.1f}–{x['goals_away']:.1f} | {round(x['cs_home'] * 100)}% / {round(x['cs_away'] * 100)}% |")
    lines += ["", f"Picks by position, 5 and 10-gameweek views, minutes watch and what's changed: {url}"]
    return "\n".join(lines)


def preview_x_thread(p: dict, url: str) -> list[str]:
    posts = [f"FPL GW{p['gw']} preview from the FixtureShark projections. 🧵"]
    posts += [h[:270] for h in p["headlines"]]
    posts.append(f"Captaincy, picks by position, fixtures and the 10-week view: {url}")
    return posts[:5]


# ---------------------------------------------------------------------------
# Build, store
# ---------------------------------------------------------------------------

def build_reflection(d: Data, gw: int) -> dict:
    ctx = load_context(d, gw)
    top_ids = top_projected(d, ctx, gw + 1, gw + 5)
    p = {"kind": "reflection", "season": ctx["label"], "gw": gw,
         "deadline": ctx["gws"][gw]["deadline_time"].isoformat(),
         "generated_at": datetime.now(timezone.utc).isoformat(),
         "gameweek_finished": bool(ctx["gws"][gw]["finished"]), "bonus_confirmed": bool(ctx["gws"][gw]["data_checked"]),
         "average": ctx["gws"][gw]["average"]}
    p["goals"] = section_goals(d, ctx, gw)
    p["minutes"] = section_minutes(d, ctx, gw, top_ids)
    p["set_pieces"] = section_set_pieces(d, ctx, gw)
    p["captaincy"] = section_captaincy(d, ctx, gw)
    p["during"] = section_during(d, ctx, gw, top_ids)
    p["checks"] = {"market_recompute_max_diff_today": f(recompute_check(d, ctx), 4)}
    p["headlines"] = headlines(p)
    return p


def store(d: Data, p: dict, publish: bool, code_ref: str, frozen: bool = False) -> tuple[int, int, bool]:
    sid = d.one("select public.fpl_current_season_id()")
    kind, gw = p["kind"], p["gw"]
    url = f"{SITE}/fpl/gameweek/{p['season']}/{gw}/{kind}"
    season = p["season"].replace("-", "/")
    if kind == "reflection":
        title = f"FPL GW{gw} reflection ({season}): goals, minutes, set pieces and captaincy"
        md, xt = reddit_md(p, url), x_thread(p, url)
    else:
        title = f"FPL GW{gw} preview ({season}): captains, fixtures, transfers"
        md, xt = preview_reddit_md(p, url), preview_x_thread(p, url)
    summary = " ".join(p["headlines"])[:600]
    # Replace the current draft if there is one; published versions are permanent.
    d.one("""with x as (delete from public.fpl_gameweek_reports where season_id = %s and fpl_event_id = %s and kind = %s and status = 'draft'
                         returning 1) select count(*) from x""", (sid, gw, kind))
    version = d.one("""select coalesce(max(version), 0) + 1 from public.fpl_gameweek_reports
                        where season_id = %s and fpl_event_id = %s and kind = %s""", (sid, gw, kind))
    status = "published" if publish else "draft"
    rid = d.one("""insert into public.fpl_gameweek_reports (season_id, season_label, fpl_event_id, kind, version, status, frozen,
                       published_at, title, summary, payload, reddit_md, x_thread, code_ref)
                   values (%s, %s, %s, %s, %s, %s, %s, case when %s then now() end, %s, %s, %s::jsonb, %s, %s::jsonb, %s)
                   returning report_id""",
                (sid, p["season"], gw, kind, version, status, frozen, publish, title, summary, json.dumps(p, default=str), md, json.dumps(xt), code_ref))
    return rid, version, publish


def reflection_due(d: Data) -> int | None:
    """The latest finished gameweek with confirmed bonus and no published reflection."""
    sid = d.one("select public.fpl_current_season_id()")
    return d.one("""select max(g.fpl_event_id) from public.fpl_gameweeks g
                     where g.season_id = %s and g.finished and coalesce((g.source_payload->>'data_checked')::boolean, false)
                       and not exists (select 1 from public.fpl_gameweek_reports r where r.season_id = g.season_id
                                         and r.fpl_event_id = g.fpl_event_id and r.kind = 'reflection' and r.status = 'published')
                       and g.fpl_event_id >= %s""", (sid, REFLECTION_AUTO_FROM_GW))


def latest_preview(d: Data, gw: int) -> dict | None:
    sid = d.one("select public.fpl_current_season_id()")
    rows = d.all("""select version, frozen, payload from public.fpl_gameweek_reports
                     where season_id = %s and fpl_event_id = %s and kind = 'preview' and status = 'published'
                     order by version desc limit 1""", (sid, gw))
    return rows[0] if rows else None


def preview_due(d: Data, now: datetime) -> tuple[int | None, str]:
    """(gameweek, action): 'first', 'update', 'freeze' or nothing.
    First version: Thursday when the deadline is Fri-Sun, otherwise the day
    before the deadline (UK dates), and never before the previous gameweek's
    reflection. Updates after each run until the deadline. Frozen from the
    deadline snapshot once the deadline has passed."""
    from zoneinfo import ZoneInfo
    uk = ZoneInfo("Europe/London")
    sid = d.one("select public.fpl_current_season_id()")
    gws = d.all("""select fpl_event_id gw, deadline_time from public.fpl_gameweeks where season_id = %s order by 1""", (sid,))
    # A passed deadline whose preview isn't frozen yet comes first.
    for g in reversed(gws):
        if g["deadline_time"] <= now and g["gw"] >= 7:
            last = latest_preview(d, g["gw"])
            snap = d.one("""select count(*) from public.fpl_deadline_player_horizon where season_id = %s and fpl_event_id = %s""", (sid, g["gw"]))
            if last and not last["frozen"] and snap:
                return g["gw"], "freeze"
            break
    nxt = next((g for g in gws if g["deadline_time"] > now), None)
    if not nxt or nxt["gw"] < 7:
        return None, ""
    gw, deadline = nxt["gw"], nxt["deadline_time"].astimezone(uk)
    last = latest_preview(d, gw)
    if last:
        return gw, "update"
    weekday = deadline.weekday()  # Mon 0 .. Sun 6
    first_day = (deadline - timedelta(days=(weekday - 3))).date() if weekday >= 4 else (deadline - timedelta(days=1)).date()
    if now.astimezone(uk).date() < first_day:
        return None, f"GW{gw} preview due {first_day:%a %d %b}"
    prev_reflection = d.one("""select count(*) from public.fpl_gameweek_reports where season_id = %s and fpl_event_id = %s
                                 and kind = 'reflection' and status = 'published'""", (sid, gw - 1))
    if not prev_reflection:
        return None, f"GW{gw} preview waits for the GW{gw - 1} reflection"
    return gw, "first"


def run_preview(d: Data, gw: int, action: str, code_ref: str) -> bool:
    """Publish per action; returns True when a rebuild is wanted (first or frozen version)."""
    if action == "freeze":
        p = build_preview(d, gw, frozen=True)
        last = latest_preview(d, gw)
        p["changes_since_last"] = ["Locked at the deadline: these are the projections as they stood before kick-off."]
        rid, v, _ = store(d, p, True, code_ref, frozen=True)
        print(f"Froze GW{gw} preview as v{v} (report {rid}).")
        return True
    p = build_preview(d, gw)
    if action == "update":
        last = latest_preview(d, gw)
        if preview_key(p) == preview_key(last["payload"]):
            print(f"GW{gw} preview unchanged since v{last['version']}.")
            return False
        p["changes_since_last"] = describe_changes(last["payload"], p)
        rid, v, _ = store(d, p, True, code_ref)
        print(f"Updated GW{gw} preview to v{v} (report {rid}): " + "; ".join(p["changes_since_last"]))
        return False
    rid, v, _ = store(d, p, True, code_ref)
    print(f"Published GW{gw} preview v{v} (report {rid}).")
    for h in p["headlines"]:
        print(f"  {h}")
    return True


def describe_changes(old: dict, new: dict) -> list[str]:
    out = []
    before = {r["id"]: r for r in old.get("captains", [])}
    for i, r in enumerate(new["captains"]):
        b = before.get(r["id"])
        if not b:
            out.append(f"{r['name']} into the top eight captains ({r['gw_xpts']:.1f} xPts)")
        elif abs(b["gw_xpts"] - r["gw_xpts"]) >= 0.3:
            out.append(f"{r['name']} {b['gw_xpts']:.1f} → {r['gw_xpts']:.1f} xPts")
    old_inj = {r["id"]: r for r in old.get("changes", {}).get("injuries", [])}
    for r in new["changes"]["injuries"]:
        o = old_inj.get(r["id"])
        if not o or o.get("now") != r.get("now") or o.get("news") != r.get("news"):
            out.append(f"{r['name']}: {r['news'] or statusish(r['now'])}")
    return out[:8] or ["Projections refreshed"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=["reflection", "preview"], default="reflection")
    ap.add_argument("--gw", type=int)
    ap.add_argument("--publish", action="store_true")
    ap.add_argument("--frozen", action="store_true", help="preview from the deadline snapshot")
    ap.add_argument("--auto", action="store_true", help="publish whatever is due (pipeline step)")
    args = ap.parse_args()

    from db_direct import DirectDB
    d = Data(DirectDB(os.environ["SUPABASE_DB_URL"]))
    code_ref = os.environ.get("GITHUB_SHA", "local")[:12]
    rebuild = False
    if args.auto:
        gw = reflection_due(d)
        if gw is None:
            print("Reflection: nothing due.")
        else:
            p = build_reflection(d, gw)
            rid, v, _ = store(d, p, True, code_ref)
            rebuild = True
            print(f"Published GW{gw} reflection v{v} (report {rid}).")
            for h in p["headlines"]:
                print(f"  {h}")
        pgw, action = preview_due(d, datetime.now(timezone.utc))
        if pgw is None:
            print(f"Preview: nothing due{' (' + action + ')' if action else ''}.")
        else:
            rebuild = run_preview(d, pgw, action, code_ref) or rebuild
    else:
        if args.gw is None:
            sys.exit("--gw is required without --auto")
        p = build_preview(d, args.gw, args.frozen) if args.kind == "preview" else build_reflection(d, args.gw)
        rid, v, published = store(d, p, args.publish, code_ref, frozen=args.frozen and args.publish)
        rebuild = published
        print(f"{'Published' if published else 'Draft'} GW{args.gw} {args.kind} v{v} (report {rid}); "
              f"payload {len(json.dumps(p, default=str)) // 1024} KB.")
        for h in p["headlines"]:
            print(f"  {h}")
        if "checks" in p:
            print(f"  checks: {p['checks']}")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a") as fh:
            fh.write(f"published={'1' if rebuild else '0'}\n")


if __name__ == "__main__":
    main()
