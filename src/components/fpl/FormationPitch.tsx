import type { FplFixtureProjectionPlayer } from '../../lib/fplApi';

// ============================================================================
// src/components/fpl/FormationPitch.tsx
//
// Visual formation display driven entirely by REAL tactical role
// (tactical_role, e.g. "RWB", "CF", "AM") -- never FPL position. Groups
// players into attacking lines (GK / defence / DM / midfield / AM-wide /
// attack) inferred generically from the role string, so it works for any
// formation the tactical model produces, not just 3-4-3 / 4-2-3-1.
//
// Not drag/drop in this milestone -- clicking a player selects/highlights
// them (wired to the projection table via onSelectPlayer), which is the
// interaction point the brief asked to leave room for scenario editing on
// later.
// ============================================================================

function roleLine(role: string | null): number {
  if (!role) return 3;
  const r = role.toUpperCase();
  if (r === 'GK') return 0;
  if (['LB', 'LWB', 'LCB', 'CB', 'RCB', 'RWB', 'RB'].includes(r)) return 1;
  if (r === 'DM' || r === 'CDM') return 2;
  if (['CM', 'LM', 'RM'].includes(r)) return 3;
  if (['AM', 'LW', 'RW'].includes(r)) return 4;
  if (['LF', 'RF', 'CF', 'ST'].includes(r)) return 5;
  return 3; // unrecognised role -- park in midfield rather than dropping the player
}

/** Rough left-right ordering within a line, purely from the role's L/R/C prefix. */
function roleSortKey(role: string | null): number {
  if (!role) return 50;
  const r = role.toUpperCase();
  if (r.startsWith('L')) return 10;
  if (r.startsWith('R')) return 90;
  return 50;
}

const LINE_TOP_PERCENT = [90, 72, 58, 44, 28, 10];

type PitchSlot = {
  player: FplFixtureProjectionPlayer;
  top: number;
  left: number;
};

function layoutPlayers(players: FplFixtureProjectionPlayer[]): PitchSlot[] {
  const byLine = new Map<number, FplFixtureProjectionPlayer[]>();
  for (const p of players) {
    const line = roleLine(p.tactical_role);
    const list = byLine.get(line) ?? [];
    list.push(p);
    byLine.set(line, list);
  }

  const slots: PitchSlot[] = [];
  for (const [line, list] of byLine) {
    const sorted = [...list].sort((a, b) => roleSortKey(a.tactical_role) - roleSortKey(b.tactical_role));
    const n = sorted.length;
    sorted.forEach((player, i) => {
      // Spread evenly across 14%-86% -- a single player on a line sits centred.
      const left = n === 1 ? 50 : 14 + (i * (86 - 14)) / (n - 1);
      slots.push({ player, top: LINE_TOP_PERCENT[line] ?? 50, left });
    });
  }
  return slots;
}

export default function FormationPitch({
  players,
  selectedPlayerId,
  onSelectPlayer,
  startedOnly = true,
}: {
  players: FplFixtureProjectionPlayer[];
  selectedPlayerId: number | null;
  onSelectPlayer: (fplPlayerId: number) => void;
  /** Only render players likely to start (top 11 by expected minutes) -- the pitch shows a predicted XI, not the full squad. */
  startedOnly?: boolean;
}) {
  const shown = startedOnly ? players.slice(0, 11) : players;
  const slots = layoutPlayers(shown);

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
