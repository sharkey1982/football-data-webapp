#!/usr/bin/env python3
# ============================================================================
# scripts/lineup_role_validator.py  --  PROTOTYPE (11 Oct 2026), not wired in
#
# Checks each predicted starter against the role he is projected to fill and
# says whether the evidence supports it. Built after GW6 Liverpool v Man City:
# with Isak and Ekitike out, the depth chart put Danns (0 starts in 6 fit
# matches, role never assigned by anyone) at centre-forward at 90%.
#
# It does not change any start chance. It returns one finding per projected
# starter: a tier, the reasons, and alternatives, so a warning can be traced.
#
#   established  - evidence he plays this role: a recorded start there, or a
#                  first choice there who starts when fit
#   plausible    - a role an admin or a line-up source gave him, or one next
#                  to a role he starts in; not contradicted by his record
#   unsupported  - projected to start, but nothing supports it: no starts
#                  while fit, and/or a role nobody assigned
#
# Tactical experiments are not penalised for being unusual: an admin-set or
# source-set role is at worst 'plausible' on its own. Only the combination of
# "projected to start" and "the record says he doesn't" makes 'unsupported'.
# Manual roles are never changed here; they get a warning, not a fix.
# ============================================================================

from __future__ import annotations

from dataclasses import dataclass, field

from fpl_depth_chart import ROLE_GROUP

STARTER_THRESHOLD = 0.50     # a start chance at or above this is a predicted starter
FIT_MATCHES_MIN = 2.0        # weighted fit matches before a record counts
NO_START_RATE = 0.15         # starts / fit matches at or below this = "doesn't start"
ESTABLISHED_RATE = 0.50

# Groups a player can credibly cover from (both directions are listed).
ADJACENT = {
    "CF": ["AM", "LW", "RW"],
    "AM": ["CF", "PIV", "LW", "RW"],
    "LW": ["RW", "AM", "CF", "LB"],
    "RW": ["LW", "AM", "CF", "RB"],
    "PIV": ["AM", "CB", "LCB", "RCB"],
    "LB": ["LW", "LCB"],
    "RB": ["RW", "RCB"],
    "LCB": ["CB", "RCB", "LB", "PIV"],
    "RCB": ["CB", "LCB", "RB", "PIV"],
    "CB": ["LCB", "RCB", "PIV"],
}
ASSIGNED_SOURCES = {"manual", "bbc_screenshot", "fantasy_football_scout"}


@dataclass
class Candidate:
    fpl_player_id: int
    name: str
    group: str | None          # role group of his main role (None = DEF/MID/FWD only)
    role_source: str | None    # team_player_tactical_defaults.source_name
    availability: float
    starts: float              # recency-weighted starts this season
    available: float           # recency-weighted matches fit this season
    observed_groups: set = field(default_factory=set)  # groups he has started in (fixture_lineup_positions)

    @property
    def rate(self) -> float | None:
        return None if self.available < FIT_MATCHES_MIN else self.starts / self.available


@dataclass
class Finding:
    fpl_player_id: int
    name: str
    place: str
    start_probability: float
    tier: str
    reasons: list
    alternatives: list


def judge(c: Candidate, place: str) -> tuple[str, list]:
    reasons: list[str] = []
    rate = c.rate
    no_starts = rate is not None and rate <= NO_START_RATE
    if no_starts:
        reasons.append(f"{c.starts:.1f} starts in {c.available:.1f} fit matches (weighted)")
    if place in c.observed_groups:
        reasons.append(f"has started at {place}")
        return ("plausible" if no_starts else "established"), reasons
    assigned = (c.role_source or "") in ASSIGNED_SOURCES
    if c.group == place:
        if not assigned:
            reasons.append(f"{place} is a placeholder from his FPL position; nobody assigned it")
        elif rate is not None and rate >= ESTABLISHED_RATE:
            reasons.append(f"{place} is his assigned role and he starts {rate:.0%} when fit")
            return "established", reasons
        else:
            reasons.append(f"{place} assigned ({c.role_source})")
    elif c.group and place in ADJACENT.get(c.group, []):
        reasons.append(f"covering {place} from his own role {c.group}")
    else:
        reasons.append(f"{place} is neither his role ({c.group or 'unassigned'}) nor next to it")
        return "unsupported", reasons
    if no_starts and not assigned:
        return "unsupported", reasons
    if no_starts:
        # Assigned but never picked: a warning, never an override of the admin.
        return "unsupported", reasons + ["role kept (set by admin/source); flagged for review"]
    return "plausible", reasons


def alternatives(place: str, pool: list[Candidate], exclude: int, n: int = 3) -> list[str]:
    out = []
    for c in pool:
        if c.fpl_player_id == exclude or c.availability < 0.5 or c.rate is None or c.rate <= NO_START_RATE:
            continue
        if c.group == place or place in c.observed_groups or (c.group and place in ADJACENT.get(c.group, [])):
            out.append((c.rate * c.availability, f"{c.name} ({c.group or 'line'}, starts {c.rate:.0%} when fit)"))
    return [s for _, s in sorted(out, reverse=True)[:n]]


def validate(depth_rows: list[dict], candidates: dict[int, Candidate]) -> list[Finding]:
    """depth_rows: fpl_depth_chart.compute() output for one club and fixture."""
    pool = list(candidates.values())
    findings = []
    for r in depth_rows:
        if r["start_probability"] < STARTER_THRESHOLD or r["fpl_player_id"] not in candidates:
            continue
        shares = r.get("group_shares") or {r["depth_group"]: r["start_probability"]}
        place = max(shares, key=shares.get)
        place = ROLE_GROUP.get(place, place)
        c = candidates[r["fpl_player_id"]]
        tier, reasons = judge(c, place)
        alts = alternatives(place, pool, c.fpl_player_id) if tier == "unsupported" else []
        findings.append(Finding(c.fpl_player_id, c.name, place, r["start_probability"], tier, reasons, alts))
    return findings


def candidates_from_inputs(rows: list[dict], sources: dict[int, str], observed: dict[int, set] | None = None) -> dict[int, Candidate]:
    observed = observed or {}
    out = {}
    for r in rows:
        if r.get("element_type") == 1:
            continue
        role = (r.get("tactical_role") or "").upper()
        out[r["fpl_player_id"]] = Candidate(
            r["fpl_player_id"], r.get("web_name", str(r["fpl_player_id"])), ROLE_GROUP.get(role),
            sources.get(r["fpl_player_id"]), float(r.get("availability") or 0),
            float(r.get("starts") or 0), float(r.get("available") or 0), observed.get(r["fpl_player_id"], set()))
    return out
