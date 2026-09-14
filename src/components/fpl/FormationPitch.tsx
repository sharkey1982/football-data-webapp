import type { FplFixtureProjectionPlayer } from '../../lib/fplApi';

// ============================================================================
// src/components/fpl/FormationPitch.tsx
//
// Visual formation display driven by REAL tactical role (tactical_role,
// e.g. "RWB", "CF", "AM") -- never FPL position.
//
// Lines are laid out from the team's actual predicted formation string
// (e.g. "3-4-3", "4-2-3-1"), not a fixed role->line dictionary: the 10
// outfield starters are ranked by how advanced their role is (GK=0 ...
// CF=highest) and then sliced into groups whose SIZES come from the
// formation string. This keeps the pitch visually consistent with the
// "Formation: X-X-X" text shown above it -- a static per-role bucket list
// previously put wing-backs on the same row as centre-backs regardless of
// formation shape, which for a back-3 system (wing-backs push into the
// midfield line) looked like an inaccurate/wrong formation.
//
// Not drag/drop in this milestone -- clicking a player selects/highlights
// them (wired to the projection table via onSelectPlayer), which is the
// interaction point the brief asked to leave room for scenario editing on
// later.
// ============================================================================

/** How advanced a role is, from own goal (0) to centre-forward (highest). */
function roleAdvancement(role: string | null): number {
  if (!role) return 25; // unknown -- park in the middle rather than dropping the player
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
  return 25;
}

/** Rough left-right ordering within a line, purely from the role's L/R/C prefix. */
function roleSortKey(role: string | null): number {
  if (!role) return 50;
  const r = role.toUpperCase();
  if (r.startsWith('L')) return 10;
  if (r.startsWith('R')) return 90;
  return 50;
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

function layoutPlayers(players: FplFixtureProjectionPlayer[], formation: string | null): PitchSlot[] {
  const isGk = (p: FplFixtureProjectionPlayer) => p.tactical_role?.toUpperCase() === 'GK' || p.fpl_position === 1;
  const gk = players.find(isGk) ?? null;
  const outfieldPool = players.filter((p) => !isGk(p));

  const formationLines = parseFormation(formation);
  const outfieldCount = formationLines ? formationLines.reduce((a, b) => a + b, 0) : 10;

  // Players are already ranked by expected minutes (the API's default
  // order) -- take the most likely starting outfielders, then re-sort that
  // starting set by role advancement so the pitch reads defence-to-attack.
  const starters = [...outfieldPool]
    .slice(0, outfieldCount)
    .sort((a, b) => roleAdvancement(a.tactical_role) - roleAdvancement(b.tactical_role));

  // Group sizes from the formation string when it parses cleanly and
  // actually accounts for every starter; otherwise fall back to one
  // group per distinct advancement value so nobody is mis-grouped.
  let lineSizes: number[];
  if (formationLines && formationLines.reduce((a, b) => a + b, 0) === starters.length) {
    lineSizes = formationLines;
  } else {
    const distinctScores = [...new Set(starters.map((p) => roleAdvancement(p.tactical_role)))].sort((a, b) => a - b);
    lineSizes = distinctScores.map((score) => starters.filter((p) => roleAdvancement(p.tactical_role) === score).length);
  }

  const totalLines = lineSizes.length + 1; // + GK line
  const lineTop = (lineIndex: number) => 90 - (lineIndex * 80) / Math.max(totalLines - 1, 1);

  const slots: PitchSlot[] = [];
  if (gk) slots.push({ player: gk, top: lineTop(0), left: 50 });

  let cursor = 0;
  lineSizes.forEach((size, i) => {
    const lineStarters = starters.slice(cursor, cursor + size);
    cursor += size;
    const sorted = [...lineStarters].sort((a, b) => roleSortKey(a.tactical_role) - roleSortKey(b.tactical_role));
    const n = sorted.length;
    sorted.forEach((player, j) => {
      // Spread evenly across 12%-88% -- a single player on a line sits centred.
      const left = n === 1 ? 50 : 12 + (j * (88 - 12)) / (n - 1);
      slots.push({ player, top: lineTop(i + 1), left });
    });
  });

  return slots;
}

export default function FormationPitch({
  players,
  formation,
  selectedPlayerId,
  onSelectPlayer,
}: {
  players: FplFixtureProjectionPlayer[];
  /** The team's predicted formation (e.g. "3-4-3") -- drives line sizing so the pitch matches the formation shown above it. */
  formation: string | null;
  selectedPlayerId: number | null;
  onSelectPlayer: (fplPlayerId: number) => void;
}) {
  const slots = layoutPlayers(players, formation);

  return (
    <div className="relative w-full min-h-[360px] sm:min-h-[400px] aspect-[3/4] bg-pitch-800 rounded-lg overflow-hidden border-2 border-pitch-600">
      {/* Pitch markings */}
      <div className="absolute inset-3 border border-chalk-100/25 rounded" />
      <div className="absolute left-1/2 top-3 bottom-3 border-l border-chalk-100/25" />
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

        return (
          <button
            key={player.fpl_player_id}
            type="button"
            onClick={() => onSelectPlayer(player.fpl_player_id)}
            className="absolute flex flex-col items-center gap-0.5 -translate-x-1/2 -translate-y-1/2 group"
            style={{ top: `${top}%`, left: `${left}%` }}
            title={`${player.web_name} \u2014 ${player.tactical_role ?? 'role unknown'}${
              startPct !== null ? ` \u2022 ${Math.round(startPct * 100)}% start` : ''
            }`}
          >
            <span
              className={[
                'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold border-2 transition-colors',
                isSelected
                  ? 'bg-amber-500 border-amber-400 text-ink-900'
                  : uncertain
                    ? 'bg-pitch-700 border-chalk-100/40 text-chalk-100 border-dashed'
                    : 'bg-pitch-700 border-chalk-100/70 text-chalk-100 group-hover:border-amber-400',
              ].join(' ')}
            >
              {player.fpl_position_label.slice(0, 1)}
            </span>
            <span className="max-w-[4.5rem] sm:max-w-[5.5rem] truncate text-[9px] sm:text-[10px] leading-tight text-chalk-100 font-medium text-center">
              {player.web_name}
            </span>
            <span className="text-[8px] sm:text-[9px] leading-none text-amber-400/90 font-mono uppercase">
              {player.tactical_role ?? '\u2014'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
