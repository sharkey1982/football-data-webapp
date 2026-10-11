import type { FplFixtureProjectionPlayer } from '../../lib/fplApi';
import { formatSetPieceRoles } from '../../lib/fplApi';
import type { FplElementType } from '../../types/database';
import { toScreen } from '../../lib/pitchLayout';

// ============================================================================
// src/components/fpl/FormationPitch.tsx
//
// Visual formation display driven by REAL tactical role (tactical_role,
// e.g. "RWB", "CF", "AM") -- never FPL position.
//
// There's no single official machine-readable "formation template" file to
// pull from -- pitch diagrams are a visual convention, not licensed data --
// so FORMATION_TEMPLATES below are hand-built to match the layout
// convention used across football broadcast graphics and analysis sites
// (e.g. WhoScored/FBref-style average position maps): named slots with
// fixed pitch coordinates for each commonly-seen formation shape.
//
// Real starters are matched to template slots by role compatibility (exact
// tactical_role first, then nearest role-group + side), not by a fragile
// re-sort -- this fixes the earlier approach, where players sharing a
// coarse "line" and L/R-prefix tier could land in a coincidentally wrong
// left-right order (e.g. a left-back landing inside a centre-back).
//
// Formations without a template (anything unusual/unlisted) fall back to
// evenly-spaced lines sized from the formation string, ordered by a
// per-specific-role canonical x-position rather than a generic L/R split.
//
// Not drag/drop in this milestone -- clicking a player selects/highlights
// them (wired to the projection table via onSelectPlayer), which is the
// interaction point the brief asked to leave room for scenario editing on
// later.
// ============================================================================

type Slot = { role: string; top: number; left: number };

// top: 88 = deepest (own goal end), 10 = most advanced (opponent goal end).
// GK is never included here -- always placed separately at (92, 50), with
// the defensive line capped at 70 or shallower so there's always a safe
// gap between the keeper and the back line regardless of button size.
const FORMATION_TEMPLATES: Record<string, Slot[]> = {
  '4-4-2': [
    { role: 'LB', top: 70, left: 12 }, { role: 'LCB', top: 74, left: 36 }, { role: 'RCB', top: 74, left: 64 }, { role: 'RB', top: 70, left: 88 },
    { role: 'LM', top: 48, left: 12 }, { role: 'CM', top: 50, left: 36 }, { role: 'CM', top: 50, left: 64 }, { role: 'RM', top: 48, left: 88 },
    { role: 'CF', top: 14, left: 38 }, { role: 'CF', top: 14, left: 62 },
  ],
  '4-3-3': [
    { role: 'LB', top: 70, left: 12 }, { role: 'LCB', top: 74, left: 36 }, { role: 'RCB', top: 74, left: 64 }, { role: 'RB', top: 70, left: 88 },
    { role: 'CM', top: 50, left: 25 }, { role: 'CM', top: 52, left: 50 }, { role: 'CM', top: 50, left: 75 },
    { role: 'LW', top: 20, left: 15 }, { role: 'CF', top: 10, left: 50 }, { role: 'RW', top: 20, left: 85 },
  ],
  '4-2-3-1': [
    { role: 'LB', top: 70, left: 12 }, { role: 'LCB', top: 74, left: 36 }, { role: 'RCB', top: 74, left: 64 }, { role: 'RB', top: 70, left: 88 },
    { role: 'DM', top: 54, left: 35 }, { role: 'DM', top: 54, left: 65 },
    { role: 'LW', top: 30, left: 15 }, { role: 'AM', top: 26, left: 50 }, { role: 'RW', top: 30, left: 85 },
    { role: 'CF', top: 10, left: 50 },
  ],
  '3-4-3': [
    { role: 'LCB', top: 68, left: 28 }, { role: 'CB', top: 72, left: 50 }, { role: 'RCB', top: 68, left: 72 },
    { role: 'LWB', top: 48, left: 10 }, { role: 'CM', top: 50, left: 37 }, { role: 'CM', top: 50, left: 63 }, { role: 'RWB', top: 48, left: 90 },
    { role: 'LF', top: 18, left: 20 }, { role: 'CF', top: 10, left: 50 }, { role: 'RF', top: 18, left: 80 },
  ],
  '3-5-2': [
    { role: 'LCB', top: 68, left: 28 }, { role: 'CB', top: 72, left: 50 }, { role: 'RCB', top: 68, left: 72 },
    { role: 'LWB', top: 48, left: 8 }, { role: 'CM', top: 50, left: 29 }, { role: 'CM', top: 54, left: 50 }, { role: 'CM', top: 50, left: 71 }, { role: 'RWB', top: 48, left: 92 },
    { role: 'CF', top: 14, left: 38 }, { role: 'CF', top: 14, left: 62 },
  ],
  '5-3-2': [
    { role: 'LWB', top: 62, left: 8 }, { role: 'LCB', top: 70, left: 30 }, { role: 'CB', top: 72, left: 50 }, { role: 'RCB', top: 70, left: 70 }, { role: 'RWB', top: 62, left: 92 },
    { role: 'CM', top: 46, left: 30 }, { role: 'CM', top: 48, left: 50 }, { role: 'CM', top: 46, left: 70 },
    { role: 'CF', top: 14, left: 38 }, { role: 'CF', top: 14, left: 62 },
  ],
  '5-4-1': [
    { role: 'LWB', top: 62, left: 8 }, { role: 'LCB', top: 70, left: 30 }, { role: 'CB', top: 72, left: 50 }, { role: 'RCB', top: 70, left: 70 }, { role: 'RWB', top: 62, left: 92 },
    { role: 'LM', top: 46, left: 12 }, { role: 'CM', top: 48, left: 38 }, { role: 'CM', top: 48, left: 62 }, { role: 'RM', top: 46, left: 88 },
    { role: 'CF', top: 12, left: 50 },
  ],
  '4-5-1': [
    { role: 'LB', top: 70, left: 12 }, { role: 'LCB', top: 74, left: 36 }, { role: 'RCB', top: 74, left: 64 }, { role: 'RB', top: 70, left: 88 },
    { role: 'LM', top: 40, left: 10 }, { role: 'CM', top: 44, left: 30 }, { role: 'CM', top: 46, left: 50 }, { role: 'CM', top: 44, left: 70 }, { role: 'RM', top: 40, left: 90 },
    { role: 'CF', top: 12, left: 50 },
  ],
  '4-1-4-1': [
    { role: 'LB', top: 70, left: 12 }, { role: 'LCB', top: 74, left: 36 }, { role: 'RCB', top: 74, left: 64 }, { role: 'RB', top: 70, left: 88 },
    { role: 'DM', top: 56, left: 50 },
    { role: 'LM', top: 34, left: 12 }, { role: 'CM', top: 36, left: 34 }, { role: 'CM', top: 36, left: 66 }, { role: 'RM', top: 34, left: 88 },
    { role: 'CF', top: 12, left: 50 },
  ],
  '4-4-1-1': [
    { role: 'LB', top: 70, left: 12 }, { role: 'LCB', top: 74, left: 36 }, { role: 'RCB', top: 74, left: 64 }, { role: 'RB', top: 70, left: 88 },
    { role: 'LM', top: 48, left: 12 }, { role: 'CM', top: 50, left: 36 }, { role: 'CM', top: 50, left: 64 }, { role: 'RM', top: 48, left: 88 },
    { role: 'CF', top: 24, left: 50 }, { role: 'CF', top: 10, left: 50 },
  ],
  '3-4-2-1': [
    { role: 'LCB', top: 68, left: 28 }, { role: 'CB', top: 72, left: 50 }, { role: 'RCB', top: 68, left: 72 },
    { role: 'LWB', top: 48, left: 10 }, { role: 'CM', top: 50, left: 37 }, { role: 'CM', top: 50, left: 63 }, { role: 'RWB', top: 48, left: 90 },
    { role: 'AM', top: 24, left: 35 }, { role: 'AM', top: 24, left: 65 },
    { role: 'CF', top: 10, left: 50 },
  ],
};

/**
 * The only tactical_role values the backend's role vocabulary actually
 * uses. Anything else -- null, or a coarse leftover like "MID"/"DEF"/"FWD"
 * that the backend sometimes stores when it hasn't resolved a specific
 * role yet -- is treated as "role not confirmed", never as if it were a
 * real tactical position. This is what stops the pitch from silently
 * falling back to FPL position and displaying that with the same
 * confidence as a real backend-supplied role.
 */
const KNOWN_ROLES = new Set([
  'GK',
  'RB', 'RCB', 'CB', 'LCB', 'LB',
  'RWB', 'LWB',
  'DM', 'CDM', 'CM', 'LM', 'RM', 'AM',
  'RW', 'LW', 'LF', 'RF',
  'CF', 'ST',
]);

function isKnownRole(role: string | null): boolean {
  return role !== null && KNOWN_ROLES.has(role.toUpperCase());
}

/** Canonical x-position (0-100) per specific role, for the fallback layout when the formation has no template. */
const ROLE_X: Record<string, number> = {
  GK: 50,
  LB: 10, LWB: 8, LCB: 30, CB: 50, RCB: 70, RB: 90, RWB: 92,
  LDM: 25, DM: 50, CDM: 50, RDM: 75,
  LM: 10, LCM: 30, CM: 50, RCM: 70, RM: 90,
  LW: 10, LAM: 30, AM: 50, RAM: 70, RW: 90,
  LF: 25, CF: 50, RF: 75, ST: 50,
};

/** Generic advancement/group fallback by FPL scoring position, used only when the tactical model has no real role for this player (e.g. formation/tactical data hasn't been generated for this fixture yet -- still gives a sane GK/DEF/MID/FWD split instead of collapsing everyone onto one line). */
function positionFallbackAdvancement(position: FplElementType | null): number {
  if (position === 1) return 0;
  if (position === 2) return 12;
  if (position === 3) return 30;
  if (position === 4) return 50;
  return 25;
}
function positionFallbackGroup(position: FplElementType | null): number {
  if (position === 1) return 0;
  if (position === 2) return 2;
  if (position === 3) return 4;
  if (position === 4) return 6;
  return 4;
}

/** How advanced a role is, from own goal (0) to centre-forward (highest) -- used for picking the likely starting 10 and, as a fallback, for line grouping. */
function roleAdvancement(role: string | null, fplPosition: FplElementType | null = null): number {
  if (!role) return positionFallbackAdvancement(fplPosition);
  const r = role.toUpperCase();
  if (r === 'GK') return 0;
  if (['CB', 'LCB', 'RCB'].includes(r)) return 10;
  if (r === 'LB' || r === 'RB') return 12;
  if (r === 'LWB' || r === 'RWB') return 16;
  if (r === 'DM' || r === 'CDM') return 20;
  if (['CM', 'LM', 'RM'].includes(r)) return 30;
  if (r === 'AM') return 40;
  if (r === 'LW' || r === 'RW') return 44;
  if (r === 'LF' || r === 'RF') return 48;
  if (r === 'CF' || r === 'ST') return 50;
  return positionFallbackAdvancement(fplPosition);
}

/** Coarse tactical group, for fuzzy-matching a player to a template slot when their exact role isn't the slot's exact role. */
function roleGroup(role: string | null, fplPosition: FplElementType | null = null): number {
  if (!role) return positionFallbackGroup(fplPosition);
  const r = role.toUpperCase();
  if (r === 'GK') return 0;
  if (['CB', 'LCB', 'RCB'].includes(r)) return 1;
  if (['LB', 'RB', 'LWB', 'RWB'].includes(r)) return 2;
  if (r === 'DM' || r === 'CDM') return 3;
  if (['CM', 'LM', 'RM'].includes(r)) return 4;
  if (r === 'AM') return 5;
  if (r === 'LW' || r === 'RW' || r === 'LF' || r === 'RF') return 6;
  if (r === 'CF' || r === 'ST') return 7;
  return positionFallbackGroup(fplPosition);
}

function roleSide(role: string | null): 'L' | 'R' | 'C' {
  if (!role) return 'C';
  const r = role.toUpperCase();
  if (r.startsWith('L')) return 'L';
  if (r.startsWith('R')) return 'R';
  return 'C';
}

/** "4-2-3-1" -> [4, 2, 3, 1]; null/unparseable -> null. */
function parseFormation(formation: string | null): number[] | null {
  if (!formation) return null;
  const parts = formation.split('-').map((n) => Number(n.trim()));
  if (parts.length === 0 || parts.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  return parts;
}

type PitchSlot = {
  player: FplFixtureProjectionPlayer;
  top: number;
  left: number;
};

/** Roles that are the same job under different names, so an exact match
 * isn't missed on a naming difference.
 *
 * This was a real bug: the 4-2-3-1 template calls its double pivot DM,
 * but most players in that role are assigned CM. With no CM slot in the
 * template, a CM found no exact match, fell through to fuzzy matching,
 * and could be placed in a DEFENDER'S slot -- a central midfielder
 * appearing next to the goalkeeper.
 *
 * Deliberately narrow: only pairs that genuinely describe one position.
 * LW/LF and RW/RF are the same wide-forward job. A wide pair (LW/LM) is NOT included, because the difference between
 * them is real and the fuzzy pass already handles it with a side bonus. */
const ROLE_ALIASES: string[][] = [
  ['CM', 'DM', 'CDM'],
  ['AM', 'CAM'],
  ['CF', 'ST'],
  // A front three's wide forwards: templates call them LF/RF or LW/RW.
  ['LW', 'LF'],
  ['RW', 'RF'],
];

function rolesEquivalent(playerRole: string, slotRole: string): boolean {
  const a = playerRole.toUpperCase();
  const b = slotRole.toUpperCase();
  if (a === b) return true;
  return ROLE_ALIASES.some((group) => group.includes(a) && group.includes(b));
}

/** Chance this player starts: start_probability, else expected minutes / 90. */
function startChance(p: FplFixtureProjectionPlayer): number {
  if (p.start_probability != null) return p.start_probability;
  if (p.expected_minutes != null) return Math.min(1, p.expected_minutes / 90);
  return 0.5;
}

/**
 * How well a player fits a slot, 0-1. An exact (or equivalent) role is 1;
 * otherwise it falls with distance between tactical groups, halves for the
 * wrong side, and is 0 more than two groups away. Zero means "never put
 * him there": an empty slot is better than a centre-back drawn on the wing.
 */
function slotFit(p: FplFixtureProjectionPlayer, slotRole: string): number {
  if (isKnownRole(p.tactical_role) && rolesEquivalent(p.tactical_role!, slotRole)) return 1;
  const role = isKnownRole(p.tactical_role) ? p.tactical_role : null;
  if (!role) {
    // Role not confirmed: all we know is the FPL position, so keep him in
    // that line (a DEF in the back line, a FWD up front), any side.
    const g = roleGroup(slotRole);
    if (p.fpl_position === 2) return g === 1 || g === 2 ? 0.6 : 0;
    if (p.fpl_position === 3) return g >= 3 && g <= 6 ? 0.6 : 0;
    if (p.fpl_position === 4) return g === 7 ? 0.6 : g === 6 ? 0.4 : g === 5 ? 0.3 : 0;
    return g >= 1 ? 0.3 : 0;
  }
  const diff = Math.abs(roleGroup(role, p.fpl_position) - roleGroup(slotRole));
  let fit = diff === 0 ? 0.7 : diff === 1 ? 0.5 : diff === 2 ? 0.3 : 0;
  const a = roleSide(role), b = roleSide(slotRole);
  if (a !== 'C' && b !== 'C' && a !== b) fit *= 0.5;
  return fit;
}

/**
 * Picks AND places the starters in one step (5 Oct 2026). Previously the
 * ten outfielders with most expected minutes were taken first and then
 * forced into the template: when that ten held two right-centre-backs and
 * no left winger (Arsenal GW7: Mosquera and Konsa, Tzolis left out), the
 * fuzzy pass put a centre-back in the LW slot.
 *
 * Now every (player, slot) pair is scored start chance x fit, and pairs are
 * taken best first, each player and slot used once. So each slot gets the
 * likeliest starter who actually plays there; a player only goes to a
 * slot that isn't his role when nobody better fits, and never to one far
 * from it. Ties keep the API order (expected minutes).
 */
function assignToTemplate(pool: FplFixtureProjectionPlayer[], template: Slot[]): PitchSlot[] {
  const pairs: { pi: number; si: number; w: number; exact: boolean }[] = [];
  pool.forEach((p, pi) => {
    const chance = startChance(p);
    if (chance <= 0) return;
    template.forEach((slot, si) => {
      const fit = slotFit(p, slot.role);
      if (fit > 0) pairs.push({ pi, si, w: chance * fit, exact: fit === 1 });
    });
  });
  pairs.sort((x, y) => y.w - x.w || Number(y.exact) - Number(x.exact) || x.pi - y.pi || x.si - y.si);
  const slotPlayer: (FplFixtureProjectionPlayer | null)[] = new Array(template.length).fill(null);
  const usedPlayers = new Set<number>();
  for (const { pi, si } of pairs) {
    if (slotPlayer[si] || usedPlayers.has(pi)) continue;
    slotPlayer[si] = pool[pi];
    usedPlayers.add(pi);
  }
  const slots: PitchSlot[] = [];
  template.forEach((slot, i) => {
    const player = slotPlayer[i];
    if (player) slots.push({ player, top: slot.top, left: slot.left });
  });
  return slots;
}

/** Fallback for formations without a template: even lines sized from the formation string, ordered by canonical per-role x rather than a generic L/R split. */
function layoutByLines(starters: FplFixtureProjectionPlayer[], lineSizes: number[]): PitchSlot[] {
  const totalLines = lineSizes.length + 1; // + GK line
  const lineTop = (lineIndex: number) => 90 - (lineIndex * 80) / Math.max(totalLines - 1, 1);

  const slots: PitchSlot[] = [];
  let cursor = 0;
  lineSizes.forEach((size, i) => {
    const lineStarters = starters.slice(cursor, cursor + size);
    cursor += size;
    const sorted = [...lineStarters].sort((a, b) => {
      const ax = a.tactical_role ? (ROLE_X[a.tactical_role.toUpperCase()] ?? 50) : 50;
      const bx = b.tactical_role ? (ROLE_X[b.tactical_role.toUpperCase()] ?? 50) : 50;
      return ax - bx;
    });
    sorted.forEach((player, j, arr) => {
      const left = arr.length === 1 ? 50 : 12 + (j * (88 - 12)) / (arr.length - 1);
      slots.push({ player, top: lineTop(i + 1), left });
    });
  });
  return slots;
}

function layoutPlayers(players: FplFixtureProjectionPlayer[], formation: string | null): PitchSlot[] {
  const isGk = (p: FplFixtureProjectionPlayer) => p.tactical_role?.toUpperCase() === 'GK' || p.fpl_position === 1;
  // Likeliest keeper, not just the first listed.
  const gk = players.filter(isGk).reduce<FplFixtureProjectionPlayer | null>((best, p) => (!best || startChance(p) > startChance(best) ? p : best), null);
  const outfieldPool = players.filter((p) => !isGk(p));

  const formationLines = parseFormation(formation);
  const outfieldCount = formationLines ? formationLines.reduce((a, b) => a + b, 0) : 10;

  // Players are already ranked by expected minutes (the API's default
  // order) -- take the most likely starting outfielders, then re-rank that
  // starting set by role advancement so template/line matching reads
  // defence-to-attack.
  const starters = [...outfieldPool]
    .slice(0, outfieldCount)
    .sort((a, b) => roleAdvancement(a.tactical_role, a.fpl_position) - roleAdvancement(b.tactical_role, b.fpl_position));

  const templateKey = formation?.trim() ?? '';
  const template = FORMATION_TEMPLATES[templateKey];

  const slots: PitchSlot[] = [];
  if (gk) slots.push({ player: gk, top: 92, left: 50 });

  // Always use the fixed template when one exists for this formation,
  // regardless of how many starters were actually provided -- requested
  // directly: pitch positions should be fixed slots, never reshuffle
  // based on who happens to be assigned. The previous exact-count check
  // meant showing anything other than a full XI (e.g. "1st choice only",
  // which often can't fill every line) always fell through to the
  // dynamic line-based fallback instead, which groups players by a much
  // finer-grained role-advancement score than GK/DEF/MID/FWD -- e.g. a
  // CB-tagged and an RB-tagged defender landed in separate rows entirely
  // rather than side by side in one defensive line, which is what
  // actually produced the "positions all over the place" / apparent
  // left-right confusion. assignToTemplate already safely omits any slot
  // with no player assigned, so this is safe with a partial XI.
  if (template) {
    // The whole outfield pool, not the top-ten by minutes: assignToTemplate
    // chooses who starts in each slot.
    slots.push(...assignToTemplate(outfieldPool, template));
  } else {
    let lineSizes: number[];
    if (formationLines && formationLines.reduce((a, b) => a + b, 0) === starters.length) {
      lineSizes = formationLines;
    } else {
      const distinctScores = [...new Set(starters.map((p) => roleAdvancement(p.tactical_role, p.fpl_position)))].sort((a, b) => a - b);
      lineSizes = distinctScores.map((score) => starters.filter((p) => roleAdvancement(p.tactical_role, p.fpl_position) === score).length);
    }
    slots.push(...layoutByLines(starters, lineSizes));
  }

  return slots;
}

/** Model place groups (scripts/fpl_depth_chart.py ROLE_GROUP): players in
 * one group compete for that group's places, so they stack on its slots. */
const PLACE_GROUP: Record<string, string> = {
  LB: 'LB', LWB: 'LB', RB: 'RB', RWB: 'RB',
  LCB: 'LCB', RCB: 'RCB', CB: 'CB',
  DM: 'PIV', CDM: 'PIV', CM: 'PIV',
  LW: 'LW', LM: 'LW', LF: 'LW', RW: 'RW', RM: 'RW', RF: 'RW',
  AM: 'AM', CAM: 'AM', CF: 'CF', ST: 'CF',
};

function placeGroup(role: string | null): string | null {
  if (!role) return null;
  return PLACE_GROUP[role.toUpperCase()] ?? null;
}

/** Places a player can cover when his own is taken or missing: centre-backs
 * across the back line and out to their side, full-backs inside or across,
 * midfielders between the pivot and the No.10, attackers across the front.
 * Deliberately not "any neighbouring line": a holding midfielder is not a
 * full-back. */
const PLACE_COVER: Record<string, string[]> = {
  LCB: ['RCB', 'CB', 'LB'], RCB: ['LCB', 'CB', 'RB'], CB: ['LCB', 'RCB'],
  LB: ['LCB', 'RB'], RB: ['RCB', 'LB'],
  PIV: ['AM'], AM: ['PIV', 'LW', 'RW'],
  LW: ['RW', 'AM', 'CF'], RW: ['LW', 'AM', 'CF'], CF: ['LW', 'RW', 'AM'],
};

/** 1 = his own place, 0.6 = one he can cover, 0 = not his job. Unconfirmed
 * roles fall back to slotFit (his FPL line). */
function placeFit(p: FplFixtureProjectionPlayer, slotRole: string): number {
  const sg = placeGroup(slotRole);
  const pg = isKnownRole(p.tactical_role) ? placeGroup(p.tactical_role) : null;
  if (!pg || !sg) return isKnownRole(p.tactical_role) ? 0 : slotFit(p, slotRole);
  if (pg === sg) return 1;
  return PLACE_COVER[pg]?.includes(sg) ? 0.6 : 0;
}

export type StackedSlot = {
  /** Likeliest starter in this slot. */
  player: FplFixtureProjectionPlayer;
  /** Others competing for the same place, likeliest first. */
  extras: FplFixtureProjectionPlayer[];
  top: number;
  left: number;
};

export type StackedLayout = { slots: StackedSlot[]; others: FplFixtureProjectionPlayer[] };

/**
 * Pitch layout that shows competition for places (10 Oct 2026). Chris:
 * players were drawn in slots they don't play (Zubimendi at centre-back)
 * because each slot had to hold exactly one name. Now each slot shows its
 * likeliest starter with the others competing for the same place stacked
 * underneath, start chance on each:
 *  - players whose role belongs to a slot's place group (the same groups
 *    the start-chance model fills: both DM slots share LB/DM/CM players,
 *    etc.) stack there, likeliest first, one headline per slot;
 *  - a slot nobody in its group can fill takes a spare who can cover it
 *    (PLACE_COVER: a third centre-back at right-back, never a holding
 *    midfielder at full-back);
 *  - anyone else (a role the formation has no slot for, or only an FPL
 *    position) goes to a slot he can cover -- as headline if it's empty,
 *    else stacked there if his role is confirmed;
 *  - anyone who fits no slot is listed under the pitch, never placed.
 * Players below minChance are left off (a fringe player at 2% is noise).
 */
/** A representative role for each place group (for placing a player's other positions). */
const GROUP_ROLE: Record<string, string> = { LB: 'LB', RB: 'RB', LCB: 'LCB', RCB: 'RCB', CB: 'CB', PIV: 'DM', LW: 'LW', RW: 'RW', AM: 'AM', CF: 'CF' };

/**
 * A player who can start in more than one position (place_shares from the
 * depth chart, 10 Oct 2026) becomes one entry per position, each with his
 * chance of starting there; he is never the headline in two slots.
 */
function expandPlaces(players: FplFixtureProjectionPlayer[]): FplFixtureProjectionPlayer[] {
  const out: FplFixtureProjectionPlayer[] = [];
  for (const p of players) {
    const shares = p.place_shares ? Object.entries(p.place_shares).filter(([g]) => GROUP_ROLE[g]) : [];
    if (shares.length <= 1) { out.push(p); continue; }
    const own = placeGroup(p.tactical_role);
    for (const [g, v] of shares) {
      out.push({ ...p, tactical_role: g === own ? p.tactical_role : GROUP_ROLE[g], start_probability: v });
    }
  }
  return out;
}

export function layoutStacked(players: FplFixtureProjectionPlayer[], formation: string | null, minChance = 0.1): StackedLayout {
  players = expandPlaces(players);
  const isGk = (p: FplFixtureProjectionPlayer) => p.tactical_role?.toUpperCase() === 'GK' || p.fpl_position === 1;
  const byChance = (a: FplFixtureProjectionPlayer, b: FplFixtureProjectionPlayer) => startChance(b) - startChance(a);
  const keep = (p: FplFixtureProjectionPlayer) => startChance(p) >= minChance;

  const slots: StackedSlot[] = [];
  const others: FplFixtureProjectionPlayer[] = [];

  const gks = players.filter((p) => isGk(p) && keep(p)).sort(byChance);
  if (gks.length > 0) slots.push({ player: gks[0], extras: gks.slice(1), top: 92, left: 50 });

  const outfield = players.filter((p) => !isGk(p) && keep(p));
  const template = FORMATION_TEMPLATES[formation?.trim() ?? ''] ?? FORMATION_TEMPLATES['4-2-3-1'];
  const held: (FplFixtureProjectionPlayer | null)[] = template.map(() => null);
  const extras: FplFixtureProjectionPlayer[][] = template.map(() => []);

  // 1. Each place group fills its own slots.
  const slotsByGroup = new Map<string, number[]>();
  template.forEach((slot, i) => {
    const g = placeGroup(slot.role);
    if (g) slotsByGroup.set(g, [...(slotsByGroup.get(g) ?? []), i]);
  });
  const leftovers: FplFixtureProjectionPlayer[] = [];
  const byGroup = new Map<string, FplFixtureProjectionPlayer[]>();
  for (const p of outfield) {
    const g = isKnownRole(p.tactical_role) ? placeGroup(p.tactical_role) : null;
    if (g && slotsByGroup.has(g)) byGroup.set(g, [...(byGroup.get(g) ?? []), p]);
    else leftovers.push(p);
  }
  // Likeliest first across all positions, so a player listed in two
  // positions headlines where he is likeliest and stacks in the other.
  const all = [...byGroup].flatMap(([g, list]) => list.map((p) => ({ g, p }))).sort((a, b) => byChance(a.p, b.p));
  const nextExtra = new Map<string, number>();
  for (const { g, p } of all) {
    const idx = slotsByGroup.get(g)!;
    const free = idx.find((i) => !held[i]);
    if (free !== undefined && !held.some((h) => h?.fpl_player_id === p.fpl_player_id)) {
      held[free] = p;
    } else {
      const k = nextExtra.get(g) ?? 0;
      extras[idx[k % idx.length]].push(p);
      nextExtra.set(g, k + 1);
    }
  }

  // 1b. A slot nobody in its group can fill takes a spare from a nearby role
  // (a third centre-back at right-back), as the start-chance model does.
  for (;;) {
    let move: { from: number; at: number; to: number; w: number } | null = null;
    template.forEach((slot, to) => {
      if (held[to]) return;
      extras.forEach((list, from) =>
        list.forEach((p, at) => {
          if (held.some((h) => h?.fpl_player_id === p.fpl_player_id)) return; // already starting elsewhere
          const fit = placeFit(p, slot.role);
          const w = startChance(p) * fit;
          if (fit >= 0.5 && (!move || w > move.w)) move = { from, at, to, w };
        })
      );
    });
    if (!move) break;
    const { from, at, to } = move as { from: number; at: number; to: number };
    held[to] = extras[from][at];
    extras[from].splice(at, 1);
  }

  // 2. Everyone else: closest slot, never more than one tactical group away.
  leftovers.sort(byChance);
  for (const p of leftovers) {
    let best = -1;
    let bestFit = 0;
    let bestEmpty = -1;
    let bestEmptyFit = 0;
    template.forEach((slot, i) => {
      const fit = placeFit(p, slot.role);
      if (fit < 0.5) return;
      if (fit > bestFit) { best = i; bestFit = fit; }
      if (!held[i] && fit > bestEmptyFit) { bestEmpty = i; bestEmptyFit = fit; }
    });
    if (bestEmpty >= 0 && !held.some((h) => h?.fpl_player_id === p.fpl_player_id)) held[bestEmpty] = p;
    // Stacked under a filled slot only with a confirmed role; a player we
    // only know as "a midfielder" is listed under the pitch instead.
    else if (best >= 0 && isKnownRole(p.tactical_role)) extras[best].push(p);
    else others.push(p);
  }

  template.forEach((slot, i) => {
    const player = held[i];
    if (player) slots.push({ player, extras: extras[i].sort(byChance), top: slot.top, left: slot.left });
    else if (extras[i].length > 0) others.push(...extras[i]);
  });
  others.sort(byChance);
  return { slots, others };
}

function describeSquadStatus(status: FplFixtureProjectionPlayer['squad_status']): string | null {
  if (status === 'rotation') return 'Rotation pick';
  if (status === 'backup') return 'Backup option';
  if (status === 'first_choice') return 'First-choice';
  return null;
}

export default function FormationPitch({
  players,
  formation,
  selectedPlayerId,
  onSelectPlayer,
  stacked = false,
  minChance = 0.1,
}: {
  players: FplFixtureProjectionPlayer[];
  /** The team's predicted formation (e.g. "3-4-3") -- drives slot layout so the pitch matches the formation shown above it. */
  formation: string | null;
  selectedPlayerId: number | null;
  onSelectPlayer: (fplPlayerId: number) => void;
  /** Show everyone competing for each place, stacked under its likeliest starter, with start chances (layoutStacked). */
  stacked?: boolean;
  /** Stacked only: leave off players less likely than this to start. */
  minChance?: number;
}) {
  if (stacked) {
    return <StackedPitch players={players} formation={formation} selectedPlayerId={selectedPlayerId} onSelectPlayer={onSelectPlayer} minChance={minChance} />;
  }
  const slots = layoutPlayers(players, formation);

  return (
    <div className="space-y-1.5">
      <div className="relative w-full min-h-[420px] sm:min-h-[460px] aspect-[3/4] bg-pitch-800 rounded-lg overflow-hidden border-2 border-pitch-600">
        {/* Pitch markings */}
        <div className="absolute inset-3 border border-chalk-100/25 rounded" />
        <div className="absolute top-1/2 left-3 right-3 border-t border-chalk-100/25" />
        <div
          className="absolute left-1/2 top-1/2 w-16 h-16 sm:w-20 sm:h-20 border border-chalk-100/25 rounded-full"
          style={{ transform: 'translate(-50%, -50%)' }}
        />
        <div className="absolute left-1/2 top-3 w-24 sm:w-28 h-8 border border-t-0 border-chalk-100/25" style={{ transform: 'translateX(-50%)' }} />
        <div className="absolute left-1/2 bottom-3 w-24 sm:w-28 h-8 border border-b-0 border-chalk-100/25" style={{ transform: 'translateX(-50%)' }} />

        {slots.map(({ player, top, left }) => {
          const at = toScreen(top, left);
          const isSelected = player.fpl_player_id === selectedPlayerId;
          const startPct = player.start_probability;
          const uncertain = startPct !== null && startPct < 0.85;
          const setPieces = formatSetPieceRoles(player.set_piece_roles);
          const isRotationOrBackup = player.squad_status === 'rotation' || player.squad_status === 'backup';
          const roleConfirmed = isKnownRole(player.tactical_role);

          const signalBorder =
            player.position_signal === 'advanced' ? 'border-emerald-400' : player.position_signal === 'deeper' ? 'border-loss-600' : 'border-chalk-100/70';
          const signalBorderFaint =
            player.position_signal === 'advanced' ? 'border-emerald-400/50' : player.position_signal === 'deeper' ? 'border-loss-600/50' : 'border-chalk-100/40';

          const titleParts = [`${player.web_name} \u2014 ${roleConfirmed ? player.tactical_role : 'tactical role not yet confirmed (approximate position only)'}`];
          if (startPct !== null) titleParts.push(`${Math.round(startPct * 100)}% start`);
          if (player.season_points_per_game !== null) titleParts.push(`${player.season_points_per_game.toFixed(1)} pts/game this season`);
          if (player.season_avg_minutes_per_start !== null) titleParts.push(`${Math.round(player.season_avg_minutes_per_start)} min/start this season`);
          if (setPieces) titleParts.push(setPieces.full);
          const statusDescription = describeSquadStatus(player.squad_status);
          if (statusDescription) titleParts.push(statusDescription);
          if (player.status && player.status !== 'a') {
            const availabilityLabel = player.status === 'i' ? 'Injured' : player.status === 'd' ? 'Doubtful' : player.status === 's' ? 'Suspended' : player.status === 'u' ? 'Unavailable' : null;
            if (availabilityLabel) titleParts.push(player.news ? `${availabilityLabel}: ${player.news}` : availabilityLabel);
          }
          if (player.position_signal === 'advanced') titleParts.push('Playing more advanced than FPL position');
          if (player.position_signal === 'deeper') titleParts.push('Playing deeper than FPL position');

          return (
            <button
              key={player.fpl_player_id}
              type="button"
              onClick={() => onSelectPlayer(player.fpl_player_id)}
              className="absolute flex flex-col items-center gap-0.5 -translate-x-1/2 -translate-y-1/2 group"
              style={{ top: `${at.top}%`, left: `${at.left}%` }}
              title={titleParts.join(' \u2022 ')}
            >
              <span
                className={[
                  'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold border-2 transition-colors',
                  isSelected
                    ? 'bg-amber-500 border-amber-400 text-ink-900'
                    : !roleConfirmed
                      ? 'bg-pitch-700 border-chalk-100/30 text-chalk-100/60 border-dotted'
                      : uncertain
                        ? `bg-pitch-700 ${signalBorderFaint} text-chalk-100 border-dashed`
                        : `bg-pitch-700 ${signalBorder} text-chalk-100 group-hover:border-amber-400`,
                ].join(' ')}
              >
                {player.fpl_position_label.slice(0, 1)}
              </span>
              <span className="max-w-[4.5rem] sm:max-w-[5.5rem] truncate text-[9px] sm:text-[10px] leading-tight text-chalk-100 font-medium text-center">
                {player.web_name}
              </span>
              {player.season_points_per_game !== null && (
                <span className="text-[8px] sm:text-[9px] leading-none text-chalk-100/70 font-mono">
                  {player.season_points_per_game.toFixed(1)} ppg
                </span>
              )}
              <span className={['text-[8px] sm:text-[9px] leading-none font-mono uppercase', roleConfirmed ? 'text-amber-400/90' : 'text-chalk-100/40 italic'].join(' ')}>
                {roleConfirmed ? player.tactical_role : 'role tbc'}
                {player.position_signal === 'advanced' && <span className="text-emerald-400 ml-0.5">&#9650;</span>}
                {player.position_signal === 'deeper' && <span className="text-loss-600 ml-0.5">&#9660;</span>}
              </span>
              {setPieces && (
                <span className="text-[8px] sm:text-[9px] leading-none text-amber-300 font-mono font-semibold">{setPieces.compact}</span>
              )}
              {isRotationOrBackup && (
                <span className="text-[8px] sm:text-[9px] leading-none text-sky-300 font-mono uppercase">
                  {player.squad_status === 'rotation' ? 'Rotation' : 'Backup'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] sm:text-[10px] text-ink-500">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full border-2 border-emerald-400" /> Advanced role (&#9650;)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full border-2 border-loss-600" /> Deeper role (&#9660;)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-amber-600 font-mono font-semibold text-[10px]">P1</span> Set-piece rank (P/FK/IFK/C)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-sky-600 font-mono font-semibold text-[10px] uppercase">Rot</span> Rotation/backup pick
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full border-2 border-dotted border-ink-500" /> Tactical role not yet confirmed -- approximate position only
        </span>
      </div>
    </div>
  );
}

function pctLabel(p: FplFixtureProjectionPlayer): string | null {
  return p.start_probability != null ? `${Math.round(p.start_probability * 100)}%` : null;
}

function availabilityNote(p: FplFixtureProjectionPlayer): string | null {
  if (!p.status || p.status === 'a') return null;
  const label = p.status === 'i' ? 'Injured' : p.status === 'd' ? 'Doubtful' : p.status === 's' ? 'Suspended' : p.status === 'u' ? 'Unavailable' : null;
  if (!label) return null;
  return p.news ? `${label}: ${p.news}` : label;
}

function playerTitle(p: FplFixtureProjectionPlayer): string {
  const parts = [`${p.web_name} \u2014 ${isKnownRole(p.tactical_role) ? p.tactical_role : 'role not confirmed'}`];
  const pct = pctLabel(p);
  if (pct) parts.push(`${pct} to start`);
  const setPieces = formatSetPieceRoles(p.set_piece_roles);
  if (setPieces) parts.push(setPieces.full);
  const note = availabilityNote(p);
  if (note) parts.push(note);
  return parts.join(' \u2022 ');
}

/** The pitch with competition for places shown (layoutStacked). */
function StackedPitch({
  players,
  formation,
  selectedPlayerId,
  onSelectPlayer,
  minChance,
}: {
  players: FplFixtureProjectionPlayer[];
  formation: string | null;
  selectedPlayerId: number | null;
  onSelectPlayer: (fplPlayerId: number) => void;
  minChance: number;
}) {
  const { slots, others } = layoutStacked(players, formation, minChance);
  const flagged = (p: FplFixtureProjectionPlayer) => p.status === 'i' || p.status === 'd' || p.status === 's';

  return (
    <div className="space-y-1.5" data-testid="stacked-pitch">
      <div className="relative w-full min-h-[540px] sm:min-h-[600px] aspect-[2/3] bg-pitch-800 rounded-lg overflow-hidden border-2 border-pitch-600">
        <div className="absolute inset-3 border border-chalk-100/25 rounded" />
        <div className="absolute top-1/2 left-3 right-3 border-t border-chalk-100/25" />
        <div className="absolute left-1/2 top-1/2 w-16 h-16 sm:w-20 sm:h-20 border border-chalk-100/25 rounded-full" style={{ transform: 'translate(-50%, -50%)' }} />
        <div className="absolute left-1/2 top-3 w-24 sm:w-28 h-8 border border-t-0 border-chalk-100/25" style={{ transform: 'translateX(-50%)' }} />
        <div className="absolute left-1/2 bottom-3 w-24 sm:w-28 h-8 border border-b-0 border-chalk-100/25" style={{ transform: 'translateX(-50%)' }} />

        {slots.map(({ player, extras, top, left }) => {
          const isSelected = player.fpl_player_id === selectedPlayerId;
          const roleConfirmed = isKnownRole(player.tactical_role);
          const pct = pctLabel(player);
          const uncertain = player.start_probability != null && player.start_probability < 0.7;
          const setPieces = formatSetPieceRoles(player.set_piece_roles);
          const at = toScreen(top, left);
          // Stacks hang towards the team's own goal, which is at the top:
          // above each outfield player, below the keeper.
          const stackAbove = at.top > 15;
          const shown = extras.slice(0, 3);
          const hidden = extras.length - shown.length;
          const stack = shown.length > 0 && (
            <span className="flex flex-col items-center gap-px">
              {shown.map((x) => (
                <span
                  key={x.fpl_player_id}
                  role="button"
                  tabIndex={0}
                  title={playerTitle(x)}
                  onClick={(e) => { e.stopPropagation(); onSelectPlayer(x.fpl_player_id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onSelectPlayer(x.fpl_player_id); } }}
                  className={[
                    'max-w-[5rem] sm:max-w-[6rem] truncate rounded px-1 leading-tight text-[9px] sm:text-[10px] font-mono cursor-pointer',
                    x.fpl_player_id === selectedPlayerId ? 'bg-amber-500 text-ink-900' : 'bg-pitch-900/70 text-chalk-100/85 hover:text-amber-300',
                  ].join(' ')}
                >
                  {x.web_name}
                  {flagged(x) && <span className="text-loss-600"> +</span>}
                  {pctLabel(x) && <span className="text-chalk-100/60"> {pctLabel(x)}</span>}
                </span>
              ))}
              {hidden > 0 && <span className="text-[8px] text-chalk-100/50 font-mono">+{hidden} more</span>}
            </span>
          );

          return (
            <div
              key={player.fpl_player_id}
              className="absolute flex flex-col items-center gap-0.5 -translate-x-1/2 -translate-y-1/2"
              style={{ top: `${at.top}%`, left: `${at.left}%` }}
            >
              {stackAbove && stack}
              <button
                type="button"
                onClick={() => onSelectPlayer(player.fpl_player_id)}
                className="flex flex-col items-center gap-0.5 group"
                title={playerTitle(player)}
              >
                <span
                  className={[
                    'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[9px] font-mono font-semibold border-2 transition-colors',
                    isSelected
                      ? 'bg-amber-500 border-amber-400 text-ink-900'
                      : !roleConfirmed
                        ? 'bg-pitch-700 border-chalk-100/30 text-chalk-100/70 border-dotted'
                        : uncertain
                          ? 'bg-pitch-700 border-chalk-100/50 text-chalk-100 border-dashed'
                          : 'bg-pitch-700 border-chalk-100/80 text-chalk-100 group-hover:border-amber-400',
                  ].join(' ')}
                >
                  {pct ?? player.fpl_position_label.slice(0, 1)}
                </span>
                <span className="max-w-[5rem] sm:max-w-[6rem] truncate text-[10px] sm:text-[11px] leading-tight text-chalk-100 font-medium text-center">
                  {player.web_name}
                  {flagged(player) && <span className="text-loss-600"> +</span>}
                </span>
                <span className={['text-[8px] sm:text-[9px] leading-none font-mono uppercase', roleConfirmed ? 'text-amber-400/90' : 'text-chalk-100/40 italic'].join(' ')}>
                  {roleConfirmed ? player.tactical_role : 'role tbc'}
                  {setPieces && <span className="text-amber-300 normal-case"> {setPieces.compact}</span>}
                </span>
              </button>
              {!stackAbove && stack}
            </div>
          );
        })}
      </div>

      {others.length > 0 && (
        <p className="text-[11px] text-ink-700">
          <span className="text-ink-500">Also possible: </span>
          {others.map((p, i) => (
            <span key={p.fpl_player_id}>
              {i > 0 && ', '}
              <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-ink-900" onClick={() => onSelectPlayer(p.fpl_player_id)} title={playerTitle(p)}>
                {p.web_name}
              </button>
              {pctLabel(p) && <span className="text-ink-500"> {pctLabel(p)}</span>}
            </span>
          ))}
        </p>
      )}
      <p className="text-[10px] sm:text-[11px] text-ink-500">
        Likeliest starter in each position, with the others competing for that place listed with it. Keeper at the top, so left-sided players are on the right. Percentages are the chance
        of starting; <span className="text-loss-700">+</span> injured, doubtful or suspended. Players under {Math.round(minChance * 100)}% left off.
      </p>
    </div>
  );
}
