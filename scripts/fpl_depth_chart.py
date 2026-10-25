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
# How many matches of evidence the seeded pecking order is worth (9 Oct
# 2026). A first choice's chance is max(his start rate,
# (starts + RANK1_FLOOR x K) / (available matches + K)): with no matches
# available (a regular returning from injury) he gets the full floor; each
# match he is fit and not picked wears it down. None = the old flat floor.
# Adopted 9 Oct 2026 (GW3-5 backtest: Brier 0.0841 -> 0.0784).
RANK1_SEED_MATCHES: float | None = 3.0
BACKUP_TAKE = 0.90   # a backup takes an open place this often when fit
# Players sharing a rank (10 Oct 2026). False: equal shares (Arsenal's three
# 2nd-choice midfielders 43% each). True: the places that reach the tier are
# shared in proportion to each player's own start rate this season, so
# Lewis-Skelly (4 starts in 5) leads Zubimendi (0 in 5). The tier's total is
# unchanged; nobody gets more than his chance of a place being open.
# Adopted 10 Oct 2026 (GW3-5 backtest, scripts/backtest_depth_ties.py: Brier
# 0.07836 -> 0.07830, log loss 0.27046 -> 0.27018; tied players only 0.07661
# -> 0.07615. Small -- 243 tied player-matches -- but better on both
# measures, as the registered rule required).
TIE_WEIGHT_BY_RATE = True
OUTFIELD_PLACES = 10
# Two rules under test (11 Oct 2026; scripts/backtest_depth_cover.py).
# Found 11 Oct (Chris): Liverpool's Danns (academy striker, fit for six
# matches, no minutes) was 90% to start against Man City because Isak and
# Ekitike were out and he was the only fit player listed at striker.
# DEEP_BACKUP_BY_RATE: a backup ranked 3rd or lower (in practice "not
# ranked": the seeded default for anyone not in a named pecking order)
#   takes an open place with his own start rate, capped at BACKUP_TAKE,
#   instead of BACKUP_TAKE -- the same rate players listed only as
#   DEF/MID/FWD already use. Named backups (rank 2) are unchanged.
# NEIGHBOUR_COVER: places a line still expects to be open after its own
#   players (and DEF/MID/FWD-only players and unused backups) are shared
#   in full among fit players from the neighbouring positions -- wingers
#   and attacking midfielders for the striker, holding midfielders for
#   the back line -- in proportion to availability x start rate, nobody
#   above his own availability.
DEEP_BACKUP_BY_RATE = False
NEIGHBOUR_COVER = False
# Experiment D1 (25 Oct 2026, docs/experiments.md): low-down picks in the
# published line-ups. Found (Chris, 25 Oct): Man Utd GW8, Sesko was listed
# CF rank 1 by the FPL-position fallback, which made a second striker's
# place next to Cunha in a one-striker side; Sesko was out, so Zirkzee
# (fallback CF, 51 minutes and no starts all season) took that place at 0.9
# and was published 90% to start. Three rules, off until D1 is scored:
#   FALLBACK_NO_PLACES: players whose role only comes from the FPL-position
#     fallback (no named source) don't create places; they can still fill
#     open ones.
#   BACKUP_SEED_MATCHES: a backup's take rate wears down with evidence, as
#     a first choice's floor does: min(BACKUP_TAKE, (starts + BACKUP_TAKE K)
#     / (available + K)). None = the flat BACKUP_TAKE.
#   PLAUSIBILITY_CAP: a final start chance of PLAUS_MIN_P or more for a
#     player who started PLAUS_MAX_STARTS or fewer of his last
#     PLAUS_WINDOW team matches while available (and was available for at
#     least PLAUS_MIN_AVAIL of them) is cut to the cap, unless he is a named
#     first choice set by hand (rank 1 from 'manual' or a BBC line-up) or
#     has an admin "start chance when fit". Nothing is redistributed: the
#     club's total goes down, which says "we don't know who takes it".
# The review list (players the rule flags) is kept whether or not the cap
# is on, so roles can be fixed before the deadline.
FALLBACK_NO_PLACES = False
BACKUP_SEED_MATCHES: float | None = None
PLAUSIBILITY_CAP: float | None = None
PLAUS_MIN_P = 0.60
PLAUS_MAX_STARTS = 1
PLAUS_WINDOW = 5
PLAUS_MIN_AVAIL = 2
FALLBACK_SOURCES = ("fpl_position_fallback",)
HAND_SET_RANK_SOURCES = ("manual", "bbc_screenshot")
NEIGHBOURS = {"FWD": ("AM", "LW", "RW"), "DEF": ("PIV",)}

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
    # Added 10 Oct 2026 (Leeds lined up 3-4-2-1; only the two above existed).
    "3-4-2-1": [("LCB", 1), ("CB", 1), ("RCB", 1), ("LB", 1), ("RB", 1), ("PIV", 2), ("AM", 2), ("CF", 1)],
    "4-3-3": [("LB", 1), ("LCB", 1), ("RCB", 1), ("RB", 1), ("PIV", 3), ("LW", 1), ("CF", 1), ("RW", 1)],
    "4-4-2": [("LB", 1), ("LCB", 1), ("RCB", 1), ("RB", 1), ("PIV", 2), ("LW", 1), ("RW", 1), ("CF", 2)],
    "4-4-1-1": [("LB", 1), ("LCB", 1), ("RCB", 1), ("RB", 1), ("PIV", 2), ("LW", 1), ("RW", 1), ("AM", 1), ("CF", 1)],
    "4-1-4-1": [("LB", 1), ("LCB", 1), ("RCB", 1), ("RB", 1), ("PIV", 3), ("LW", 1), ("RW", 1), ("CF", 1)],
    "3-5-2": [("LCB", 1), ("CB", 1), ("RCB", 1), ("LB", 1), ("RB", 1), ("PIV", 3), ("CF", 2)],
    "5-3-2": [("LB", 1), ("LCB", 1), ("CB", 1), ("RCB", 1), ("RB", 1), ("PIV", 3), ("CF", 2)],
    "5-4-1": [("LB", 1), ("LCB", 1), ("CB", 1), ("RCB", 1), ("RB", 1), ("PIV", 2), ("LW", 1), ("RW", 1), ("CF", 1)],
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
    starts: float | None = None      # starts this season (start record)
    available: float | None = None   # team matches he was available for this season
    # Other positions he plays, each with his rank there: [("LW", 2), ...]
    # (10 Oct 2026, "Also plays" on Starting Lineups).
    others: list = field(default_factory=list)
    # D1 inputs (25 Oct 2026): where his role and rank came from, and his
    # starts / matches available over the team's last PLAUS_WINDOW matches.
    role_source: str | None = None
    rank_source: str | None = None
    starts_last: float | None = None
    avail_last: float | None = None
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
        if self.depth_rank >= 3 and DEEP_BACKUP_BY_RATE:
            return min(BACKUP_TAKE, max(0.0, self.rate or 0.0))
        if self.depth_rank <= 1:
            k = RANK1_SEED_MATCHES
            if k is None or self.starts is None or self.available is None:
                return min(RANK1_CAP, max(self.rate or 0.0, RANK1_FLOOR))
            seeded = (self.starts + RANK1_FLOOR * k) / (self.available + k)
            return min(RANK1_CAP, max(self.rate or 0.0, seeded))
        return backup_seeded(self)

    @property
    def fallback(self) -> bool:
        """Role only from the FPL-position fallback, rank not set by hand."""
        return (self.role_source or "") in FALLBACK_SOURCES and (self.rank_source or "") not in HAND_SET_RANK_SOURCES

    @property
    def hand_set_first_choice(self) -> bool:
        return self.first_choice is not None or (self.depth_rank <= 1 and (self.rank_source or "") in HAND_SET_RANK_SOURCES)


def backup_seeded(p: "Player") -> float:
    """A backup's take rate: flat, or worn down by his record (D1 rule 2)."""
    k = BACKUP_SEED_MATCHES
    if k is None or p.starts is None or p.available is None:
        return BACKUP_TAKE
    return min(BACKUP_TAKE, max(0.0, (p.starts + BACKUP_TAKE * k) / (p.available + k)))


def implausible(p: "Player", start_probability: float) -> bool:
    """D1 rule 3: a high start chance his recent record doesn't support."""
    if p.hand_set_first_choice or p.starts_last is None or p.avail_last is None:
        return False
    return (start_probability >= PLAUS_MIN_P and p.avail_last >= PLAUS_MIN_AVAIL
            and p.starts_last <= PLAUS_MAX_STARTS)


def apply_plausibility(players: list["Player"], result: dict) -> tuple[dict, list[dict]]:
    """Cap implausible start chances (when PLAUSIBILITY_CAP is set). Returns
    the result and every flagged player (capped or, with the cap off, the
    ones that would be), for the admin review list."""
    by_id = {p.fpl_player_id: p for p in players}
    flags = []
    out = dict(result)
    for pid, val in result.items():
        p = by_id.get(pid)
        s = val[0]
        if p is None or not implausible(p, s):
            continue
        capped = min(s, PLAUSIBILITY_CAP) if PLAUSIBILITY_CAP is not None else s
        flags.append({"fpl_player_id": pid, "raw_probability": round(s, 4), "probability": round(capped, 4),
                      "starts_last": p.starts_last, "avail_last": p.avail_last, "depth_rank": p.depth_rank,
                      "role": p.role, "role_source": p.role_source, "capped": PLAUSIBILITY_CAP is not None})
        if PLAUSIBILITY_CAP is not None:
            out[pid] = (round(capped, 4),) + tuple(val[1:])
    return out, flags


def backup_take(p: "Player") -> float:
    """How often a backup (rank 2+) takes an open place when fit."""
    if DEEP_BACKUP_BY_RATE and p.depth_rank >= 3 and p.first_choice is None:
        return p.pick()
    if p.first_choice is None:
        return backup_seeded(p)
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
        if TIE_WEIGHT_BY_RATE and len(tier) > 1:
            p_open = sum(po for o, po in enumerate(open_dist) if o > 0)
            caps = {p.fpl_player_id: ready[i] * p_open for i, p in enumerate(tier)}
            weights = {p.fpl_player_id: ready[i] * max(0.01, p.rate if p.rate is not None else 0.20) for i, p in enumerate(tier)}
            starts.update(share_by_weight(sum(starts[p.fpl_player_id] for p in tier), weights, caps))
        all_ready = poisson_binomial(ready)
        nxt = [0.0] * (places + 1)
        for o, po in enumerate(open_dist):
            for r, pr in enumerate(all_ready):
                nxt[max(0, o - r)] += po * pr
        open_dist = nxt
    return starts, open_dist


def share_by_weight(total: float, weights: dict[int, float], caps: dict[int, float]) -> dict[int, float]:
    """Split `total` in proportion to weights, no one above his cap; any
    excess goes to the rest in the same proportions (water-filling)."""
    out = {pid: 0.0 for pid in weights}
    free = {pid for pid, w in weights.items() if w > 0 and caps[pid] > 0}
    remaining = total
    while remaining > 1e-12 and free:
        wsum = sum(weights[pid] for pid in free)
        capped = set()
        for pid in free:
            give = remaining * weights[pid] / wsum
            if out[pid] + give >= caps[pid] - 1e-12:
                capped.add(pid)
        if not capped:
            for pid in free:
                out[pid] += remaining * weights[pid] / wsum
            remaining = 0.0
            break
        for pid in capped:
            remaining -= caps[pid] - out[pid]
            out[pid] = caps[pid]
        free -= capped
    return out


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
        if p.group and p.depth_rank <= 1 and not (FALLBACK_NO_PLACES and p.fallback):
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
                left = min(1.0, max(0.0, p.availability)) * backup_take(p) - starts[p.fpl_player_id]
                if left > 1e-9:
                    spare.setdefault(line, {})[p.fpl_player_id] = left

    still_open: dict[str, float] = {}
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
        still_open[line] = max(0.0, sum(o * po for o, po in enumerate(open_dist)) - sum(extra.values()))

    if NEIGHBOUR_COVER:
        for line, groups in NEIGHBOURS.items():
            need = still_open.get(line, 0.0)
            if need <= 1e-9:
                continue
            cands = [p for p in players if p.group in groups]
            caps = {p.fpl_player_id: max(0.0, min(0.98, max(0.0, p.availability)) - out[p.fpl_player_id][0]) for p in cands}
            weights = {p.fpl_player_id: min(1.0, max(0.0, p.availability)) * max(0.01, p.rate if p.rate is not None else 0.20) for p in cands}
            got = share_by_weight(min(need, sum(caps.values())), weights, caps)
            for pid, add in got.items():
                s, g, r = out[pid]
                out[pid] = (s + add, g, r)

    return {pid: (round(min(0.98, max(0.0, s)), 4), g, r) for pid, (s, g, r) in out.items()}


SIMULATIONS = 4000


def _weighted_order(rng, items: list, weight) -> list:
    """Random order, heavier first more often (Plackett-Luce)."""
    pool = list(items)
    out = []
    while pool:
        ws = [max(1e-6, weight(x)) for x in pool]
        r = rng.random() * sum(ws)
        acc = 0.0
        for i, w in enumerate(ws):
            acc += w
            if r <= acc:
                out.append(pool.pop(i))
                break
        else:
            out.append(pool.pop())
    return out


def allocate_sim(players: list[Player], formation: str | None = None, sims: int = SIMULATIONS, seed: int = 7) -> dict[int, tuple[float, str, int, dict]]:
    """allocate() for a club where some players also play other positions.
    Simulated so one player fills at most one place: each run draws who is
    fit, whether a first choice is picked and whether a backup is willing,
    then fills places rank by rank across positions (players sharing a rank
    in random order weighted by start rate), then the line's leftover places
    from DEF/MID/FWD-only players and unused backups -- the same steps as
    allocate(). Returns (start chance, main place, rank, {place: chance})."""
    import random
    rng = random.Random(seed)
    players = [p for p in players if p.line]
    places = group_places(players, formation)
    entries: list[tuple[Player, str, int]] = []
    for p in players:
        if p.group:
            entries.append((p, p.group, p.depth_rank))
        for role, rank in p.others:
            g = ROLE_GROUP.get((role or "").upper())
            if g and g != p.group:
                entries.append((p, g, int(rank)))
                places.setdefault(g, 0)
    by_rank: dict[int, list] = {}
    for e in entries:
        by_rank.setdefault(e[2], []).append(e)
    counts: dict[int, dict[str, int]] = {p.fpl_player_id: {} for p in players}
    rate = lambda p: p.rate if p.rate is not None else 0.20

    for _ in range(sims):
        fit = {p.fpl_player_id: rng.random() < min(1.0, max(0.0, p.availability)) for p in players}
        # First choices are picked or rotated once; backups are willing or not once.
        usable = {}
        for p in players:
            if not fit[p.fpl_player_id] or p.generic:
                usable[p.fpl_player_id] = False
            elif p.depth_rank <= 1 or p.first_choice is not None:
                usable[p.fpl_player_id] = rng.random() < p.pick()
            else:
                usable[p.fpl_player_id] = rng.random() < backup_take(p)
        open_ = dict(places)
        used: dict[int, str] = {}
        for rank in sorted(by_rank):
            cands = [e for e in by_rank[rank] if usable[e[0].fpl_player_id]]
            for p, g, _r in _weighted_order(rng, cands, lambda e: rate(e[0])):
                if p.fpl_player_id in used or open_.get(g, 0) <= 0:
                    continue
                used[p.fpl_player_id] = g
                open_[g] -= 1
        for line in ("DEF", "MID", "FWD"):
            holes = [g for g, n in open_.items() for _k in range(n) if GROUP_LINE.get(g) == line]
            if not holes:
                continue
            rng.shuffle(holes)
            generics = [p for p in players if p.generic and p.line == line and fit[p.fpl_player_id]
                        and rng.random() < (p.first_choice if p.first_choice is not None else rate(p))]
            spares = [p for p in players if not p.generic and p.line == line and p.depth_rank > 1
                      and usable[p.fpl_player_id] and p.fpl_player_id not in used]
            rng.shuffle(generics)
            rng.shuffle(spares)
            for p in generics + spares:
                if not holes:
                    break
                if p.fpl_player_id in used:
                    continue
                g = holes.pop()
                used[p.fpl_player_id] = g
                open_[g] -= 1
        if NEIGHBOUR_COVER:
            for line, groups in NEIGHBOURS.items():
                holes = [g for g, n in open_.items() for _k in range(n) if GROUP_LINE.get(g) == line]
                if not holes:
                    continue
                cands = [p for p in players if p.group in groups and fit[p.fpl_player_id] and p.fpl_player_id not in used]
                for p in _weighted_order(rng, cands, lambda p: rate(p)):
                    if not holes:
                        break
                    g = holes.pop()
                    used[p.fpl_player_id] = g
                    open_[g] -= 1
        for pid, g in used.items():
            counts[pid][g] = counts[pid].get(g, 0) + 1

    out = {}
    for p in players:
        c = counts[p.fpl_player_id]
        total = sum(c.values()) / sims
        shares = {g: round(n / sims, 4) for g, n in sorted(c.items(), key=lambda kv: -kv[1])}
        main = p.group or p.line
        out[p.fpl_player_id] = (round(min(0.98, total), 4), main, p.depth_rank, shares)
    return out


INPUT_SQL = "select * from public.get_fpl_depth_inputs()"


def compute(rows: list[dict]) -> list[dict]:
    """rows: one per (fixture, club, player) from get_fpl_depth_inputs()."""
    out: list[dict] = []
    FLAGS.clear()
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
                starts=None if r.get("starts") is None else float(r["starts"]),
                available=None if r.get("available") is None else float(r["available"]),
                others=_others(r.get("other_roles")),
                role_source=r.get("role_source"),
                rank_source=r.get("rank_source"),
                starts_last=None if r.get("starts_last") is None else float(r["starts_last"]),
                avail_last=None if r.get("avail_last") is None else float(r["avail_last"]),
            )
            for r in grp
        ]
        formation = next((r.get("formation") for r in grp if r.get("formation")), None)
        if any(p.others for p in players):
            # Same inputs give the same answer: later gameweeks often repeat.
            key_ = (formation, tuple((p.fpl_player_id, round(p.availability, 3), p.pick(), tuple(p.others)) for p in players))
            if key_ not in _sim_cache:
                _sim_cache[key_] = allocate_sim(players, formation)
            result = _sim_cache[key_]
        else:
            result = {pid: (s, g, rank, {g: s} if s > 0 else {}) for pid, (s, g, rank) in allocate(players, formation).items()}
        result, flags = apply_plausibility(players, result)
        for f in flags:
            FLAGS.append({"fixture_id": fixture_id, "team_id": team_id, **f})
        for pid, (s, g, rank, shares) in result.items():
            out.append({"fixture_id": fixture_id, "team_id": team_id, "fpl_player_id": pid,
                        "start_probability": s, "depth_group": g, "depth_rank": rank, "group_shares": shares})
    return out


_sim_cache: dict = {}
# Players flagged by the D1 plausibility rule in the last compute() (the
# admin review list; fpl_replace_start_flags stores them).
FLAGS: list[dict] = []


def _others(v) -> list:
    """other_roles from get_fpl_depth_inputs: [{"role": "LW", "rank": 2}, ...] (JSON or list)."""
    if not v:
        return []
    if isinstance(v, str):
        import json
        v = json.loads(v)
    return [(str(x["role"]), int(x["rank"])) for x in v if x.get("role")]
