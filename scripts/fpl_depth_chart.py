#!/usr/bin/env python3
# ============================================================================
# scripts/fpl_depth_chart.py
#
# Start chances from the club pecking order (6 Oct 2026).
#
# Chris: "The line up pecking order is supposed to deal with this." Until now
# no projection read team_player_tactical_defaults.depth_rank: each player's
# start chance was his own availability x his own start rate, so when Saliba
# came back from injury nobody below him in the order lost anything (Arsenal's
# total stayed under 10 starters, so the club-level scaling never kicked in).
#
# This fills each club's places down the pecking order, fixture by fixture:
#
#   1. Players are grouped by their role on the Starting Lineups page
#      (LB/LWB, RB/RWB, LCB, RCB, CB, DM/CM, LW, RW, AM, CF). Each group has
#      as many places as it has first choices (rank 1); if that leaves the
#      club short of 10 outfield places, the fixture's formation adds the
#      missing ones (e.g. a second DM in a 4-2-3-1).
#   2. Going down the order, a player takes an open place if he is available
#      (return dates and doubts, as before) and picked: a first choice is
#      picked with his start rate, at least 85% (or the admin "first choice
#      when fit" setting); a backup takes an open place 90% of the time.
#      Players sharing a rank share the places that reach them.
#   3. Places still open after a role's own backups go to the rest of that
#      line (defence, midfield, attack): first to players listed only as
#      DEF/MID/FWD, then to backups of other roles who were not needed,
#      in proportion to their own start chances.
#
# Goalkeepers, and players not on the club's pecking order, keep the
# previous model. Results go to fpl_depth_start_store, which
# fpl_fallback_start_probability_v6 reads ahead of its own estimate.
#
# Pure functions here (tested in scripts/test_fpl_depth_chart.py); the
# database I/O is in run().
# ============================================================================

from __future__ import annotations

from dataclasses import dataclass, field
from itertools import groupby

RANK1_FLOOR = 0.85   # a first choice starts at least this often when fit
RANK1_CAP = 0.97
BACKUP_TAKE = 0.90   # a backup takes an open place this often when fit
OUTFIELD_PLACES = 10

ROLE_GROUP = {
    "LB": "LB", "LWB": "LB",
    "RB": "RB", "RWB": "RB",
    "LCB": "LCB", "RCB": "RCB", "CB": "CB",
    "DM": "PIV", "CDM": "PIV", "CM": "PIV",
    "LW": "LW", "LM": "LW", "LF": "LW",
    "RW": "RW", "RM": "RW", "RF": "RW",
    "AM": "AM", "CAM": "AM",
    "CF": "CF", "ST": "CF",
}
GROUP_LINE = {
    "LB": "DEF", "RB": "DEF", "LCB": "DEF", "RCB": "DEF", "CB": "DEF",
    "PIV": "MID", "LW": "MID", "RW": "MID", "AM": "MID",
    "CF": "FWD",
}
GENERIC_LINE = {"DEF": "DEF", "MID": "MID", "FWD": "FWD"}
# Places per group by formation, in the order they are added when a club's
# first choices leave it short of 10.
TEMPLATES = {
    "4-2-3-1": [("LB", 1), ("LCB", 1), ("RCB", 1), ("RB", 1), ("PIV", 2), ("LW", 1), ("AM", 1), ("RW", 1), ("CF", 1)],
    "3-4-3": [("LCB", 1), ("CB", 1), ("RCB", 1), ("LB", 1), ("RB", 1), ("PIV", 2), ("LW", 1), ("CF", 1), ("RW", 1)],
}


@dataclass
class Player:
    fpl_player_id: int
    role: str | None
    depth_rank: int
    availability: float
    rate: float | None            # start rate when fit (start record), None if unknown
    first_choice: float | None = None  # admin "start chance when fit"
    element_type: int = 0
    group: str | None = field(default=None, init=False)
    line: str | None = field(default=None, init=False)
    generic: bool = field(default=False, init=False)

    def __post_init__(self):
        role = (self.role or "").upper()
        if self.element_type == 1 or role == "GK":
            return
        if role in ROLE_GROUP:
            self.group = ROLE_GROUP[role]
            self.line = GROUP_LINE[self.group]
        elif role in GENERIC_LINE:
            self.line = GENERIC_LINE[role]
            self.generic = True
        elif self.element_type in (2, 3, 4):
            self.line = {2: "DEF", 3: "MID", 4: "FWD"}[self.element_type]
            self.generic = True

    def pick(self) -> float:
        """Chance he takes an open place when it reaches him, if fit."""
        if self.first_choice is not None:
            return self.first_choice
        if self.depth_rank <= 1:
            return min(RANK1_CAP, max(self.rate or 0.0, RANK1_FLOOR))
        return BACKUP_TAKE


def poisson_binomial(ps: list[float]) -> list[float]:
    dist = [1.0]
    for p in ps:
        nxt = [0.0] * (len(dist) + 1)
        for k, v in enumerate(dist):
            nxt[k] += v * (1 - p)
            nxt[k + 1] += v * p
        dist = nxt
    return dist


def convolve(a: list[float], b: list[float]) -> list[float]:
    out = [0.0] * (len(a) + len(b) - 1)
    for i, x in enumerate(a):
        for j, y in enumerate(b):
            out[i + j] += x * y
    return out


def fill_group(places: int, players: list[Player]) -> tuple[dict[int, float], list[float]]:
    """Fill `places` down the order. Returns start chances and the
    distribution of places still open afterwards (index = places open)."""
    open_dist = [0.0] * (places + 1)
    open_dist[places] = 1.0
    starts: dict[int, float] = {}
    ordered = sorted(players, key=lambda p: p.depth_rank)
    for _, tier_iter in groupby(ordered, key=lambda p: p.depth_rank):
        tier = list(tier_iter)
        ready = [min(1.0, max(0.0, p.availability)) * p.pick() for p in tier]
        for i, p in enumerate(tier):
            others = poisson_binomial(ready[:i] + ready[i + 1:])
            share = 0.0
            for o, po in enumerate(open_dist):
                if o == 0 or po == 0:
                    continue
                share += po * sum(pr * min(1.0, o / (r + 1)) for r, pr in enumerate(others))
            starts[p.fpl_player_id] = ready[i] * share
        all_ready = poisson_binomial(ready)
        nxt = [0.0] * (places + 1)
        for o, po in enumerate(open_dist):
            for r, pr in enumerate(all_ready):
                nxt[max(0, o - r)] += po * pr
        open_dist = nxt
    return starts, open_dist


def fill_line(open_dist: list[float], weights: dict[int, float]) -> dict[int, float]:
    """Share a line's open places among extra players in proportion to their
    weights (each weight is that player's own chance of being ready)."""
    total = sum(weights.values())
    if total <= 0:
        return {pid: 0.0 for pid in weights}
    factor = sum(po * min(1.0, o / total) for o, po in enumerate(open_dist))
    return {pid: w * factor for pid, w in weights.items()}


def group_places(players: list[Player], formation: str | None) -> dict[str, int]:
    places: dict[str, int] = {}
    for p in players:
        if p.group and p.depth_rank <= 1:
            places[p.group] = places.get(p.group, 0) + 1
    template = TEMPLATES.get((formation or "").strip())
    if template:
        total = sum(places.values())
        for g, n in template:
            if total >= OUTFIELD_PLACES:
                break
            # A place with nobody listed in that role still counts: it is
            # filled from the rest of the line.
            add = min(n - places.get(g, 0), OUTFIELD_PLACES - total)
            if add > 0:
                places[g] = places.get(g, 0) + add
                total += add
    return places


def allocate(players: list[Player], formation: str | None = None) -> dict[int, tuple[float, str, int]]:
    """Start chance per player for one club in one fixture.
    Returns {fpl_player_id: (start_probability, group_or_line, depth_rank)}.
    Players with no outfield line (goalkeepers) are left out."""
    players = [p for p in players if p.line]
    places = group_places(players, formation)
    out: dict[int, tuple[float, str, int]] = {}
    line_open: dict[str, list[float]] = {}
    spare: dict[str, dict[int, float]] = {}

    for g in sorted({p.group for p in players if p.group} | set(places)):
        members = [p for p in players if p.group == g]
        n = places.get(g, 0)
        if n == 0:
            starts, open_dist = {p.fpl_player_id: 0.0 for p in members}, [1.0]
        else:
            starts, open_dist = fill_group(n, members)
        line = GROUP_LINE[g]
        line_open[line] = convolve(line_open.get(line, [1.0]), open_dist)
        for p in members:
            out[p.fpl_player_id] = (starts[p.fpl_player_id], g, p.depth_rank)
            if p.depth_rank > 1:
                # Ready but not needed in his own role: can cover elsewhere in the line.
                left = min(1.0, max(0.0, p.availability)) * BACKUP_TAKE - starts[p.fpl_player_id]
                if left > 1e-9:
                    spare.setdefault(line, {})[p.fpl_player_id] = left

    for line in ("DEF", "MID", "FWD"):
        open_dist = line_open.get(line, [1.0])
        generics = {p.fpl_player_id: min(1.0, max(0.0, p.availability)) * (p.first_choice if p.first_choice is not None else (p.rate or 0.0))
                    for p in players if p.generic and p.line == line}
        if generics:
            got = fill_line(open_dist, generics)
            for p in players:
                if p.fpl_player_id in got:
                    out[p.fpl_player_id] = (got[p.fpl_player_id], line, p.depth_rank)
            # Places the generic players took are no longer open.
            ready = poisson_binomial(list(generics.values()))
            nxt = [0.0] * len(open_dist)
            for o, po in enumerate(open_dist):
                for r, pr in enumerate(ready):
                    nxt[max(0, o - r)] += po * pr
            open_dist = nxt
        extra = fill_line(open_dist, spare.get(line, {}))
        for pid, add in extra.items():
            s, g, r = out[pid]
            out[pid] = (s + add, g, r)

    return {pid: (round(min(0.98, max(0.0, s)), 4), g, r) for pid, (s, g, r) in out.items()}


INPUT_SQL = "select * from public.get_fpl_depth_inputs()"


def compute(rows: list[dict]) -> list[dict]:
    """rows: one per (fixture, club, player) from get_fpl_depth_inputs()."""
    out: list[dict] = []
    key = lambda r: (r["fixture_id"], r["team_id"])
    for (fixture_id, team_id), grp in groupby(sorted(rows, key=key), key=key):
        grp = list(grp)
        players = [
            Player(
                fpl_player_id=int(r["fpl_player_id"]),
                role=r.get("tactical_role"),
                depth_rank=int(r.get("depth_rank") or 3),
                availability=float(r.get("availability") if r.get("availability") is not None else 1.0),
                rate=None if r.get("rate") is None else float(r["rate"]),
                first_choice=None if r.get("start_if_fit") is None else float(r["start_if_fit"]),
                element_type=int(r.get("element_type") or 0),
            )
            for r in grp
        ]
        formation = next((r.get("formation") for r in grp if r.get("formation")), None)
        for pid, (s, g, rank) in allocate(players, formation).items():
            out.append({"fixture_id": fixture_id, "team_id": team_id, "fpl_player_id": pid,
                        "start_probability": s, "depth_group": g, "depth_rank": rank})
    return out
