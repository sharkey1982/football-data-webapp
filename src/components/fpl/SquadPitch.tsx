// ============================================================================
// src/components/fpl/SquadPitch.tsx
//
// Renders the optimiser's starting XI grouped by FPL position (GK/DEF/MID/
// FWD row), per base_formation's DEF-MID-FWD counts. Deliberately NOT
// FormationPitch -- the optimiser response has no tactical_role at all, so
// there's nothing to place players by beyond their scoring position. This
// is the same convention the official FPL app itself uses for a squad
// view, not a simplification of something more precise.
// ============================================================================

import type { FplOptimizerPlayer } from '../../lib/fplOptimizerApi';
import { OPTIMIZER_POSITION_LABEL } from '../../lib/fplOptimizerApi';

function parseOutfieldShape(formation: string): { def: number; mid: number; fwd: number } | null {
  const parts = formation.split('-').map((n) => Number(n.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  const [def, mid, fwd] = parts;
  return { def, mid, fwd };
}

function PlayerToken({ player, captain, viceCaptain }: { player: FplOptimizerPlayer; captain?: boolean; viceCaptain?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5" title={`${player.name} \u2014 ${player.team} \u2014 \u00a3${player.price.toFixed(1)}m`}>
      <span className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold border-2 bg-pitch-700 border-chalk-100/70 text-chalk-100">
        {OPTIMIZER_POSITION_LABEL[player.position].slice(0, 1)}
        {(captain || viceCaptain) && (
          <span
            className={[
              'absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border',
              captain ? 'bg-amber-500 border-amber-400 text-ink-900' : 'bg-chalk-100 border-chalk-300 text-ink-900',
            ].join(' ')}
          >
            {captain ? 'C' : 'V'}
          </span>
        )}
      </span>
      <span className="max-w-[4.5rem] sm:max-w-[5.5rem] truncate text-[9px] sm:text-[10px] leading-tight text-chalk-100 font-medium text-center">
        {player.name}
      </span>
      <span className="text-[8px] sm:text-[9px] leading-none text-amber-400/90 font-mono">
        {player.total_xpts.toFixed(1)} pts
      </span>
    </div>
  );
}

function PitchRow({ players, top, captainId, viceCaptainId }: { players: FplOptimizerPlayer[]; top: number; captainId?: number; viceCaptainId?: number }) {
  return (
    <div className="absolute left-3 right-3 flex justify-center gap-2 sm:gap-4 flex-wrap" style={{ top: `${top}%`, transform: 'translateY(-50%)' }}>
      {players.map((p) => (
        <PlayerToken key={p.id} player={p} captain={p.id === captainId} viceCaptain={p.id === viceCaptainId} />
      ))}
    </div>
  );
}

export default function SquadPitch({
  starters,
  formation,
  captainId,
  viceCaptainId,
}: {
  starters: FplOptimizerPlayer[];
  formation: string;
  captainId?: number;
  viceCaptainId?: number;
}) {
  const shape = parseOutfieldShape(formation);
  const gk = starters.filter((p) => p.position === 1);
  const def = starters.filter((p) => p.position === 2);
  const mid = starters.filter((p) => p.position === 3);
  const fwd = starters.filter((p) => p.position === 4);

  return (
    <div className="relative w-full min-h-[380px] sm:min-h-[420px] aspect-[3/4] bg-pitch-800 rounded-lg overflow-hidden border-2 border-pitch-600">
      <div className="absolute inset-3 border border-chalk-100/25 rounded" />
      <div className="absolute top-1/2 left-3 right-3 border-t border-chalk-100/25" />
      <div
        className="absolute left-1/2 top-1/2 w-16 h-16 sm:w-20 sm:h-20 border border-chalk-100/25 rounded-full"
        style={{ transform: 'translate(-50%, -50%)' }}
      />

      {!shape && (
        <p className="absolute inset-0 flex items-center justify-center text-chalk-100/70 text-xs px-4 text-center">
          Unrecognised formation string &ldquo;{formation}&rdquo; &mdash; showing players ungrouped.
        </p>
      )}

      <PitchRow players={fwd} top={14} captainId={captainId} viceCaptainId={viceCaptainId} />
      <PitchRow players={mid} top={42} captainId={captainId} viceCaptainId={viceCaptainId} />
      <PitchRow players={def} top={68} captainId={captainId} viceCaptainId={viceCaptainId} />
      <PitchRow players={gk} top={90} captainId={captainId} viceCaptainId={viceCaptainId} />
    </div>
  );
}
