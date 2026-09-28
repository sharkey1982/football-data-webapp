#!/usr/bin/env python3
# ============================================================================
# scripts/exit_bands.py
#
# How a player's start ends -- off before 60 minutes (band 0), off at 60-84
# (band 1), 85+ (band 2) -- the model that passed Model Lab P2 (28 Sep 2026:
# log loss 0.674 v 0.718 for position shares on the holdout; appearance
# points closer than "2 for every starter"). Shared by the lab scorer
# (lab_p2.py) and the live refresh (refresh_exit_bands.py).
#
# Per player: recency-weighted counts of his own previous starts in each
# band (half-life H starts), blended with his position's band shares as a
# Dirichlet prior of strength K.
# ============================================================================

import numpy as np

K = 5    # P2 tuning result
H = 10   # P2 tuning result (starts)
YEAR = {9: 2022, 10: 2023, 11: 2024, 12: 2025, 13: 2026}
PRIOR_YEARS = (2022, 2023)
# Average exit minute of a start that ends at 60-84 (2023/24-2025/26: 72.7),
# as a share of 90: the clean-sheet window for band 1.
BAND1_SHARE_OF_MATCH = 72.7 / 90


def band(minutes):
    return 0 if minutes < 60 else 1 if minutes < 85 else 2


def page(sb, table, cols, filters, order):
    out, start = [], 0
    while True:
        q = sb.table(table).select(cols)
        for kind, col, val in filters:
            q = getattr(q, kind)(col, val)
        for col in order:   # a unique ordering, or offset paging can skip or repeat rows
            q = q.order(col)
        rows = q.range(start, start + 999).execute().data or []
        out += rows
        if len(rows) < 1000:
            return out
        start += 1000


def load_starts(sb):
    """Every recorded start: {code, pos, year, gw, fx, band}, in match order."""
    pos = {}
    for r in page(sb, "fpl_player_season_totals", "season_id,fpl_code,element_type", [("gte", "season_id", 9)], ["season_id", "fpl_code"]):
        pos[(r["season_id"], r["fpl_code"])] = r["element_type"]
    starts = []
    for r in page(sb, "fpl_player_gameweek_history", "season_id,fpl_code,gameweek,fixture_id,minutes",
                  [("gte", "season_id", 9), ("eq", "starts", 1)], ["season_id", "fpl_code", "gameweek", "fixture_id"]):
        p = pos.get((r["season_id"], r["fpl_code"]))
        if p:
            starts.append({"code": r["fpl_code"], "pos": p, "year": YEAR[r["season_id"]], "gw": r["gameweek"],
                           "fx": r["fixture_id"] or 0, "band": band(r["minutes"])})
    players = {r["fpl_player_id"]: r for r in page(sb, "fpl_players", "fpl_player_id,fpl_code,element_type", [("eq", "season_id", 13)], ["fpl_player_id"])}
    for r in page(sb, "fpl_player_gameweeks", "fpl_player_id,fpl_event_id,fpl_fixture_id,minutes,source_payload",
                  [("eq", "season_id", 13)], ["fpl_player_id", "fpl_fixture_id"]):
        s = (r.get("source_payload") or {}).get("stats") or {}
        pl = players.get(r["fpl_player_id"])
        if s.get("starts") == 1 and pl and pl.get("fpl_code") and pl.get("element_type"):
            starts.append({"code": pl["fpl_code"], "pos": pl["element_type"], "year": 2026, "gw": r["fpl_event_id"],
                           "fx": r["fpl_fixture_id"] or 0, "band": band(r["minutes"])})
    starts.sort(key=lambda s: (s["year"], s["gw"], s["fx"]))
    return starts


def position_priors(starts):
    counts = {}
    for s in starts:
        if s["year"] in PRIOR_YEARS:
            c = counts.setdefault(s["pos"], [0, 0, 0])
            c[s["band"]] += 1
    return {p: np.array(c, float) / sum(c) for p, c in counts.items()}


def predict(starts, priors, k, h):
    """Walk-forward band probabilities for every start (list aligned with starts)."""
    history, preds = {}, []
    for s in starts:
        prior = priors[s["pos"]]
        prev = history.get(s["code"], [])
        n = len(prev)
        if n:
            ages = np.arange(n - 1, -1, -1, dtype=float)
            w = np.ones(n) if h is None else 0.5 ** (ages / h)
            counts = np.array([w[np.array(prev) == b].sum() for b in range(3)])
            p = (counts + k * prior) / (w.sum() + k)
        else:
            p = prior.copy()
        preds.append(p)
        history.setdefault(s["code"], []).append(s["band"])
    return preds




def next_start_probs(starts, priors, k=K, h=H):
    """{fpl_code: band probabilities for his next start} after all starts given."""
    history = {}
    pos = {}
    for s in starts:
        history.setdefault(s["code"], []).append(s["band"])
        pos[s["code"]] = s["pos"]
    out = {}
    for code, prev in history.items():
        n = len(prev)
        ages = np.arange(n - 1, -1, -1, dtype=float)
        w = np.ones(n) if h is None else 0.5 ** (ages / h)
        counts = np.array([w[np.array(prev) == b].sum() for b in range(3)])
        out[code] = (counts + k * priors[pos[code]]) / (w.sum() + k)
    return out
