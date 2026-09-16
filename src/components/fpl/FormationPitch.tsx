import type { FplFixtureProjectionPlayer } from '../../lib/fplApi';
import { formatSetPieceRoles } from '../../lib/fplApi';
import type { FplElementType } from '../../types/database';

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

/** How well a player's actual role fits a template slot's expected role. Exact match dominates; otherwise nearer tactical group + matching side scores higher. */
function matchScore(playerRole: string | null, playerPosition: FplElementType | null, slotRole: string): number {
  if (playerRole && playerRole.toUpperCase() === slotRole.toUpperCase()) return 1000;
  const groupDiff = Math.abs(roleGroup(playerRole, playerPosition) - roleGroup(slotRole));
  const sideBonus = roleSide(playerRole) === roleSide(slotRole) ? 60 : roleSide(playerRole) === 'C' || roleSide(slotRole) === 'C' ? 20 : 0;
  return 500 - groupDiff * 40 + sideBonus;
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

/**
 * Assigns starters to template slots. Two passes, deliberately NOT one
 * greedy slot-by-slot pass:
 *
 * Pass 1 -- every player with an EXACT tactical_role match for some slot
 * in this template gets that slot, full stop, regardless of where in the
 * template array that slot sits. This is what "tactical_role is
 * authoritative" requires: a confirmed CF must never be displaceable by a
 * fuzzy match for a different slot just because that slot happens to be
 * processed earlier in template order. (This was the actual bug: CF is
 * the last slot in the 4-2-3-1 template, so a real CF with no other exact
 * match yet claimed could get grabbed by the RW slot -- processed earlier
 * -- before the loop ever reached CF, leaving CF filled by whoever was
 * left over instead.)
 *
 * Pass 2 -- only for slots no exact match claimed, and only among players
 * with no exact-role home anywhere in this formation (missing/unrecognised
 * tactical_role, or a specific role this formation's template doesn't
 * have a slot for): nearest-fit fuzzy matching, same as before.
 */
function assignToTemplate(starters: FplFixtureProjectionPlayer[], template: Slot[]): PitchSlot[] {
  const slotPlayer: (FplFixtureProjectionPlayer | null)[] = new Array(template.length).fill(null);
  const used = new Set<number>();

  template.forEach((slot, slotIndex) => {
    const exact = starters.find(
      (p) => !used.has(p.fpl_player_id) && isKnownRole(p.tactical_role) && p.tactical_role!.toUpperCase() === slot.role.toUpperCase()
    );
    if (exact) {
      slotPlayer[slotIndex] = exact;
      used.add(exact.fpl_player_id);
    }
  });

  template.forEach((slot, slotIndex) => {
    if (slotPlayer[slotIndex]) return;
    const remaining = starters.filter((p) => !used.has(p.fpl_player_id));
    if (remaining.length === 0) return;
    let best = remaining[0];
    let bestScore = -Infinity;
    for (const p of remaining) {
      const score = matchScore(p.tactical_role, p.fpl_position, slot.role);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    slotPlayer[slotIndex] = best;
    used.add(best.fpl_player_id);
  });

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
  const gk = players.find(isGk) ?? null;
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

  if (template && template.length === starters.length) {
    slots.push(...assignToTemplate(starters, template));
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
}: {
  players: FplFixtureProjectionPlayer[];
  /** The team's predicted formation (e.g. "3-4-3") -- drives slot layout so the pitch matches the formation shown above it. */
  formation: string | null;
  selectedPlayerId: number | null;
  onSelectPlayer: (fplPlayerId: number) => void;
}) {
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
              style={{ top: `${top}%`, left: `${left}%` }}
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
