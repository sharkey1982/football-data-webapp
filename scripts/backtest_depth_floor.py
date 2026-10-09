#!/usr/bin/env python3
# ============================================================================
# scripts/backtest_depth_floor.py
#
# Backtest (9 Oct 2026): should a first choice's 85% start floor wear down
# when he is fit and not picked?
#
# Found 8 Oct: the club pecking orders were seeded on 14 Sep from Fantasy
# Football Scout's pre-season line-ups and are rarely updated, and every
# first choice gets max(start rate, 0.85). So Doku (1 match available, 0
# starts), Sakamoto (5, 0) and Flemming (3, 0) were all 0.85 to start.
#
# Rule fixed BEFORE scoring (same as the 5 Oct start-record change, which
# was adopted on this kind of backtest):
#   first choice = min(0.97, max(start rate, (starts + 0.85 K) / (available + K)))
#   with K = 3 matches. A regular back from injury (no available matches)
#   keeps the full floor; each match he is fit and not picked wears it down.
# Adopt iff K = 3 beats the current rule on BOTH Brier score and log loss
# over gameweeks 3-5. K = 1, 2, 5 and 10 are reported for information only.
#
# Point in time: for each finished fixture in GW3-5, every outfield player
# on the club's pecking order gets the inputs the depth chart would have
# had before kick-off -- starts and available matches from earlier
# fixtures only (availability from the daily FPL snapshots, as in
# refresh_fpl_start_record), last season's start rate, the admin first-
# choice setting in force, and his availability for the match itself.
# The production allocate() is run on each club and fixture. Caveat: the
# pecking order is today's (it isn't versioned); it was seeded 14 Sep,
# between GW3 and GW4, and both rules use the same one.
#
# Writes analysis_results 'depth_floor_backtest'.
#   python scripts/backtest_depth_floor.py
# ============================================================================

from __future__ import annotations

import json
import math
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
import fpl_depth_chart as dc  # noqa: E402

SQL = """
with fx as (
  select f.canonical_fixture_id fixture_id, f.fpl_fixture_id, f.fpl_event_id gw, f.kickoff_time,
         th.canonical_team_id home_id, ta.canonical_team_id away_id
    from fpl_fixtures f
    join fpl_teams th on th.fpl_team_id = f.fpl_home_team_id and th.season_id = %(s)s
    join fpl_teams ta on ta.fpl_team_id = f.fpl_away_team_id and ta.season_id = %(s)s
   where f.season_id = %(s)s and f.finished and f.fpl_event_id between %(g0)s and %(g1)s
), side as (
  select fixture_id, fpl_fixture_id, gw, kickoff_time, home_id team_id from fx
  union all select fixture_id, fpl_fixture_id, gw, kickoff_time, away_id from fx
), first_snap as (
  select distinct on (fpl_player_id) fpl_player_id, snapshot_date fd, status fs,
         (source_payload->>'news_added')::timestamptz::date na
    from fpl_player_snapshots where season_id = %(s)s order by fpl_player_id, snapshot_date
), team_games as (
  select f.fpl_fixture_id, f.kickoff_time, t.canonical_team_id team_id
    from fpl_fixtures f join fpl_teams t on t.season_id = %(s)s and t.fpl_team_id in (f.fpl_home_team_id, f.fpl_away_team_id)
   where f.season_id = %(s)s and f.finished
), games as (
  select p.fpl_player_id, tg.kickoff_time, tg.fpl_fixture_id,
         coalesce((pg.source_payload->'stats'->>'starts')::int, 0) st,
         case when tg.kickoff_time::date >= fs.fd then
           coalesce((select sn.status from fpl_player_snapshots sn
                      where sn.fpl_player_id = p.fpl_player_id and sn.season_id = %(s)s and sn.snapshot_date <= tg.kickoff_time::date
                      order by sn.snapshot_date desc limit 1), 'a') not in ('i','s','u','n')
         else not (coalesce(fs.fs, 'a') in ('i','s','u','n') and fs.na <= tg.kickoff_time::date) end avail,
         (select case when sn.status = 'd' then coalesce(sn.chance_of_playing_next_round, 75) / 100.0 else null end
            from fpl_player_snapshots sn
           where sn.fpl_player_id = p.fpl_player_id and sn.season_id = %(s)s and sn.snapshot_date <= tg.kickoff_time::date
           order by sn.snapshot_date desc limit 1) doubt
    from fpl_players p
    join team_games tg on tg.team_id = p.canonical_team_id
    left join fpl_player_gameweeks pg on pg.season_id = %(s)s and pg.fpl_player_id = p.fpl_player_id and pg.fpl_fixture_id = tg.fpl_fixture_id
    left join first_snap fs on fs.fpl_player_id = p.fpl_player_id
   where p.season_id = %(s)s and p.element_type <> 1
), prev as (
  select fpl_code, least(0.9, count(*) filter (where starts > 0) / 38.0) pr
    from fpl_player_gameweek_history
   where season_id = (select max(season_id) from fpl_player_gameweek_history where season_id < %(s)s)
   group by fpl_code
)
select s.gw, s.fixture_id, s.team_id, coalesce(c.formation, '') formation,
       d.fpl_player_id, p.element_type, d.tactical_role, d.depth_rank,
       case when g.avail then coalesce(g.doubt, 1.0) else 0.0 end availability,
       (select count(*) filter (where b.st > 0) from games b where b.fpl_player_id = d.fpl_player_id and b.kickoff_time < s.kickoff_time) starts_before,
       (select count(*) filter (where b.avail) from games b where b.fpl_player_id = d.fpl_player_id and b.kickoff_time < s.kickoff_time) avail_before,
       pv.pr prior_rate,
       (select x.start_if_fit from fpl_player_first_choice x
         where x.fpl_player_id = d.fpl_player_id and x.removed_at is null and x.set_at <= s.kickoff_time
           and s.kickoff_time::date between x.effective_from and coalesce(x.effective_to, '9999-12-31'::date)
         order by x.set_at desc limit 1) start_if_fit,
       g.st started
  from side s
  join team_player_tactical_defaults d on d.season_id = %(s)s and d.team_id = s.team_id
  join fpl_players p on p.fpl_player_id = d.fpl_player_id and p.season_id = %(s)s and p.element_type <> 1
  join games g on g.fpl_player_id = d.fpl_player_id and g.fpl_fixture_id = s.fpl_fixture_id
  left join fixture_team_tactical_consensus c on c.fixture_id = s.fixture_id and c.team_id = s.team_id
  left join prev pv on pv.fpl_code = p.fpl_code
"""

VARIANTS: list[tuple[str, float | None]] = [("current", None), ("K=3 (registered)", 3.0), ("K=1", 1.0), ("K=2", 2.0), ("K=5", 5.0), ("K=10", 10.0)]


def score(preds: list[tuple[float, int]]) -> dict:
    n = len(preds)
    brier = sum((p - y) ** 2 for p, y in preds) / n
    ll = -sum(y * math.log(min(0.99, max(0.01, p))) + (1 - y) * math.log(1 - min(0.99, max(0.01, p))) for p, y in preds) / n
    return {"n": n, "brier": round(brier, 5), "log_loss": round(ll, 5), "mean_pred": round(sum(p for p, _ in preds) / n, 4),
            "mean_actual": round(sum(y for _, y in preds) / n, 4)}


def run_variant(rows: list[dict], k: float | None) -> dict[tuple, float]:
    dc.RANK1_SEED_MATCHES = k
    by_side: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        by_side[(r["fixture_id"], r["team_id"])].append(r)
    out: dict[tuple, float] = {}
    for (fid, tid), grp in by_side.items():
        players = []
        for r in grp:
            rate = min(0.97, (r["starts_before"] + (float(r["prior_rate"]) if r["prior_rate"] is not None else 0.20)) / (r["avail_before"] + 1.0))
            players.append(dc.Player(
                fpl_player_id=int(r["fpl_player_id"]), role=r["tactical_role"], depth_rank=int(r["depth_rank"] or 3),
                availability=float(r["availability"]), rate=rate,
                first_choice=None if r["start_if_fit"] is None else float(r["start_if_fit"]),
                element_type=int(r["element_type"]), starts=float(r["starts_before"]), available=float(r["avail_before"])))
        for pid, (s, _g, _rank) in dc.allocate(players, r["formation"] or None).items():
            out[(fid, tid, pid)] = s
    return out


def main() -> None:
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as con, con.cursor(row_factory=dict_row) as cur:
        cur.execute("select public.fpl_current_season_id() s")
        season = cur.fetchone()["s"]
        cur.execute(SQL, {"s": season, "g0": 3, "g1": 5})
        rows = cur.fetchall()
    print(f"{len(rows)} player-matches, {sum(r['started'] for r in rows)} starts")

    key = lambda r: (r["fixture_id"], r["team_id"], int(r["fpl_player_id"]))
    actual = {key(r): int(r["started"] > 0) for r in rows}
    rank1_fit_unpicked = {key(r) for r in rows if (r["depth_rank"] or 3) <= 1 and r["start_if_fit"] is None}
    contradicted = {key(r) for r in rows if (r["depth_rank"] or 3) <= 1 and r["start_if_fit"] is None
                    and r["avail_before"] >= 1 and r["starts_before"] < r["avail_before"]}

    results = []
    preds_by_variant = {}
    for label, k in VARIANTS:
        pred = run_variant(rows, k)
        preds_by_variant[label] = pred
        allp = [(pred.get(kk, 0.0), y) for kk, y in actual.items()]
        res = {"variant": label, "k": k, "all": score(allp),
               "first_choice": score([(pred.get(kk, 0.0), actual[kk]) for kk in rank1_fit_unpicked]),
               "first_choice_with_contrary_record": score([(pred.get(kk, 0.0), actual[kk]) for kk in contradicted]) if contradicted else None,
               "by_gw": {}}
        for gw in (3, 4, 5):
            ks = [key(r) for r in rows if r["gw"] == gw]
            res["by_gw"][gw] = score([(pred.get(kk, 0.0), actual[kk]) for kk in ks])
        results.append(res)
        print(label, json.dumps(res["all"]), "first choice", json.dumps(res["first_choice"]))

    cur_p, new_p = preds_by_variant["current"], preds_by_variant["K=3 (registered)"]
    diffs = [((new_p.get(k, 0) - y) ** 2 - (cur_p.get(k, 0) - y) ** 2) for k, y in actual.items()]
    n = len(diffs)
    mean = sum(diffs) / n
    sd = math.sqrt(sum((d - mean) ** 2 for d in diffs) / (n - 1))
    base, reg = results[0]["all"], results[1]["all"]
    adopt = reg["brier"] < base["brier"] and reg["log_loss"] < base["log_loss"]
    # Biggest movers, for a sense check.
    movers = sorted(((new_p.get(k, 0) - cur_p.get(k, 0), k) for k in actual), key=lambda t: t[0])[:15]
    summary = {
        "gws": [3, 4, 5], "player_matches": len(rows), "starts": sum(r["started"] for r in rows),
        "rule": "first choice = min(0.97, max(rate, (starts + 0.85 K) / (available + K))), K = 3 registered",
        "decision_rule": "adopt iff K=3 beats current on both Brier and log loss over GW3-5 (all outfield depth-chart players)",
        "results": results,
        "paired_brier_diff": {"mean": round(mean, 6), "se": round(sd / math.sqrt(n), 6)},
        "adopt": adopt,
        "biggest_drops": [{"fixture_id": k[0], "team_id": k[1], "fpl_player_id": k[2], "change": round(d, 3),
                           "current": round(cur_p.get(k, 0), 3), "new": round(new_p.get(k, 0), 3), "started": actual[k]} for d, k in movers],
    }
    print("ADOPT" if adopt else "DO NOT ADOPT", json.dumps(summary["paired_brier_diff"]))

    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    sb.table("analysis_results").insert({"analysis_id": "depth_floor_backtest", "code_ref": os.environ.get("GITHUB_SHA", "local"),
                                         "result": summary}).execute()
    print("Saved analysis_results depth_floor_backtest")


if __name__ == "__main__":
    main()
