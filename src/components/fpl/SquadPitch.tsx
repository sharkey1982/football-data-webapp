// ============================================================================
// src/components/fpl/SquadPitch.tsx
//
// Renders the optimiser's starting XI grouped by FPL position (GK/DEF/MID/
// FWD row), per base_formation's DEF-MID-FWD counts. Deliberately NOT
// FormationPitch -- the optimiser response has no tactical_role at all, so
// there's nothing to place players by beyond their scoring position. This
// is the same convention the official FPL app itself uses for a squad
// view, not a simplification of something more precise.
//
// Always renders ONE gameweek's worth of context (`matchweek` -- points,
// captain, vice-captain are all specific to it), even though the squad
// itself spans a wider range. Requested directly, twice: showing a
// season-total points figure on a specific week's pitch was misleading
// (this used to read player.total_xpts unconditionally), and a
// multi-week "C1,3" captain badge stopped making sense once the caller
// (WeeklySquadView) already lets someone switch which week's pitch they're
// looking at -- that already solves "which week was X captain" more
// directly than an aggregate badge could, so this just shows a plain
// "C"/"V" for whichever week is currently being viewed.
//
// `enrichment` is optional and purely presentational -- the same per-player
// context (tactical role, set-piece roles, squad pecking order, season PPG,
// start-probability reliability) FormationPitch already shows on the
// per-fixture Player Projections pitch, fetched separately via
// getSquadPitchEnrichment and passed in. None of it feeds back into the
// optimiser's own squad/formation/captain choice; a player token renders
// exactly as before when no enrichment is available for them (e.g. before
// the fetch resolves, or if the underlying data isn't populated yet).
// ============================================================================

import type { FplOptimizerPlayer } from '../../lib/fplOptimizerApi';
import { OPTIMIZER_POSITION_LABEL } from '../../lib/fplOptimizerApi';
import type { SquadPitchEnrichment } from '../../lib/fplApi';
import { formatSetPieceRoles } from '../../lib/fplApi';

// Standard FPL 3-letter codes for the current Premier League clubs. Falls
// back to the first 3 letters of whatever name comes through for anything
// not listed (promoted/relegated teams between seasons, or a name that
// doesn't match exactly) -- never blocks rendering on this being complete.
const CLUB_ABBREVIATION: Record<string, string> = {
  Arsenal: 'ARS', 'Aston Villa': 'AVL', Bournemouth: 'BOU', Brentford: 'BRE', Brighton: 'BHA',
  Burnley: 'BUR', Chelsea: 'CHE', 'Crystal Palace': 'CRY', Everton: 'EVE', Fulham: 'FUL',
  Leeds: 'LEE', Liverpool: 'LIV', 'Man City': 'MCI', 'Man United': 'MUN', Newcastle: 'NEW',
  "Nott'm Forest": 'NFO', Sunderland: 'SUN', Tottenham: 'TOT', 'West Ham': 'WHU', Wolves: 'WOL',
};
function abbreviateClub(teamName: string): string {
  return CLUB_ABBREVIATION[teamName] ?? teamName.slice(0, 3).toUpperCase();
}

function parseOutfieldShape(formation: string): { def: number; mid: number; fwd: number } | null {
  const parts = formation.split('-').map((n) => Number(n.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  const [def, mid, fwd] = parts;
  return { def, mid, fwd };
}

function PlayerToken({
  player,
  matchweek,
  isCaptain,
  isVice,
  enrichment,
}: {
  player: FplOptimizerPlayer;
  /** Which gameweek's points to show -- this player's total_xpts (season/range total) is never shown here. */
  matchweek: number;
  isCaptain: boolean;
  isVice: boolean;
  enrichment?: SquadPitchEnrichment;
}) {
  const gwPoints = player.gw_xpts[matchweek];
  const startPct = enrichment?.start_probability ?? null;
  const uncertain = startPct !== null && startPct < 0.85;
  const roleConfirmed = !!enrichment?.tactical_role;
  const setPieces = enrichment ? formatSetPieceRoles(enrichment.set_piece_roles) : null;
  const isRotationOrBackup = enrichment?.squad_status === 'rotation' || enrichment?.squad_status === 'backup';

  const signalBorder =
    enrichment?.position_signal === 'advanced' ? 'border-emerald-400' : enrichment?.position_signal === 'deeper' ? 'border-loss-600' : 'border-chalk-100/70';
  const signalBorderFaint =
    enrichment?.position_signal === 'advanced' ? 'border-emerald-400/50' : enrichment?.position_signal === 'deeper' ? 'border-loss-600/50' : 'border-chalk-100/40';

  const titleParts = [`${player.name} \u2014 ${player.team} \u2014 \u00a3${player.price.toFixed(1)}m`];
  if (roleConfirmed) titleParts.push(enrichment!.tactical_role!);
  if (startPct !== null) titleParts.push(`${Math.round(startPct * 100)}% start`);
  if (enrichment?.season_points_per_game !== null && enrichment?.season_points_per_game !== undefined) titleParts.push(`${enrichment.season_points_per_game.toFixed(1)} pts/game this season`);
  if (setPieces) titleParts.push(setPieces.full);
  if (enrichment?.squad_status === 'rotation') titleParts.push('Rotation pick');
  if (enrichment?.squad_status === 'backup') titleParts.push('Backup option');
  if (enrichment?.squad_status === 'first_choice') titleParts.push('First-choice');
  if (enrichment?.position_signal === 'advanced') titleParts.push('Playing more advanced than FPL position');
  if (enrichment?.position_signal === 'deeper') titleParts.push('Playing deeper than FPL position');
  if (isCaptain) titleParts.push(`Captain, GW${matchweek}`);
  if (isVice) titleParts.push(`Vice-captain, GW${matchweek}`);

  return (
    <div className="flex flex-col items-center gap-0.5" title={titleParts.join(' \u2022 ')}>
      <span
        className={[
          'relative w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold border-2 bg-pitch-700 text-chalk-100',
          !enrichment
            ? 'border-chalk-100/70'
            : !roleConfirmed
              ? 'border-chalk-100/30 border-dotted'
              : uncertain
                ? `${signalBorderFaint} border-dashed`
                : signalBorder,
        ].join(' ')}
      >
        {OPTIMIZER_POSITION_LABEL[player.position].slice(0, 1)}
        {(isCaptain || isVice) && (
          <span
            className={[
              'absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border',
              isCaptain ? 'bg-amber-500 border-amber-400 text-ink-900' : 'bg-chalk-100 border-chalk-300 text-ink-900',
            ].join(' ')}
          >
            {isCaptain ? 'C' : 'V'}
          </span>
        )}
      </span>
      <span className="max-w-[4.5rem] sm:max-w-[5.5rem] truncate text-[9px] sm:text-[10px] leading-tight text-chalk-100 font-medium text-center">
        {player.name}
      </span>
      <span className="text-[8px] sm:text-[9px] leading-none text-sky-300 font-mono uppercase">{abbreviateClub(player.team)}</span>
      <span className="text-[8px] sm:text-[9px] leading-none text-amber-400/90 font-mono">
        {gwPoints !== undefined ? `${gwPoints.toFixed(1)} pts` : '\u2014'}
      </span>
      {enrichment && (
        <>
          {enrichment.season_points_per_game !== null && (
            <span className="text-[8px] sm:text-[9px] leading-none text-chalk-100/70 font-mono">{enrichment.season_points_per_game.toFixed(1)} ppg</span>
          )}
          <span className={['text-[8px] sm:text-[9px] leading-none font-mono uppercase', roleConfirmed ? 'text-amber-400/90' : 'text-chalk-100/40 italic'].join(' ')}>
            {roleConfirmed ? enrichment.tactical_role : 'role tbc'}
            {enrichment.position_signal === 'advanced' && <span className="text-emerald-400 ml-0.5">&#9650;</span>}
            {enrichment.position_signal === 'deeper' && <span className="text-loss-600 ml-0.5">&#9660;</span>}
          </span>
          {setPieces && <span className="text-[8px] sm:text-[9px] leading-none text-amber-300 font-mono font-semibold">{setPieces.compact}</span>}
          {isRotationOrBackup && (
            <span className="text-[8px] sm:text-[9px] leading-none text-sky-300 font-mono uppercase">
              {enrichment.squad_status === 'rotation' ? 'Rotation' : 'Backup'}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function PitchRow({
  players,
  top,
  matchweek,
  captainName,
  viceCaptainName,
  enrichmentByPlayer,
}: {
  players: FplOptimizerPlayer[];
  top: number;
  matchweek: number;
  captainName: string;
  viceCaptainName: string;
  enrichmentByPlayer?: Map<number, SquadPitchEnrichment>;
}) {
  return (
    <div className="absolute left-3 right-3 flex justify-center gap-2 sm:gap-4 flex-wrap" style={{ top: `${top}%`, transform: 'translateY(-50%)' }}>
      {players.map((p) => (
        <PlayerToken
          key={p.id}
          player={p}
          matchweek={matchweek}
          isCaptain={p.name === captainName}
          isVice={p.name === viceCaptainName}
          enrichment={enrichmentByPlayer?.get(p.id)}
        />
      ))}
    </div>
  );
}

export default function SquadPitch({
  starters,
  formation,
  matchweek,
  captainName,
  viceCaptainName,
  enrichmentByPlayer,
}: {
  starters: FplOptimizerPlayer[];
  formation: string;
  /** Which gameweek this pitch represents -- drives which of each player's gw_xpts entries is shown. */
  matchweek: number;
  captainName: string;
  viceCaptainName: string;
  /** Optional -- from getSquadPitchEnrichment. Renders the plain (pre-enrichment) token when omitted or a specific player has no entry. */
  enrichmentByPlayer?: Map<number, SquadPitchEnrichment>;
}) {
  const shape = parseOutfieldShape(formation);
  const gk = starters.filter((p) => p.position === 1);
  const def = starters.filter((p) => p.position === 2);
  const mid = starters.filter((p) => p.position === 3);
  const fwd = starters.filter((p) => p.position === 4);

  return (
    <div className="space-y-1.5">
      <div className="relative w-full min-h-[420px] sm:min-h-[460px] aspect-[3/4] bg-pitch-800 rounded-lg overflow-hidden border-2 border-pitch-600">
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

        <PitchRow players={fwd} top={14} matchweek={matchweek} captainName={captainName} viceCaptainName={viceCaptainName} enrichmentByPlayer={enrichmentByPlayer} />
        <PitchRow players={mid} top={42} matchweek={matchweek} captainName={captainName} viceCaptainName={viceCaptainName} enrichmentByPlayer={enrichmentByPlayer} />
        <PitchRow players={def} top={68} matchweek={matchweek} captainName={captainName} viceCaptainName={viceCaptainName} enrichmentByPlayer={enrichmentByPlayer} />
        <PitchRow players={gk} top={90} matchweek={matchweek} captainName={captainName} viceCaptainName={viceCaptainName} enrichmentByPlayer={enrichmentByPlayer} />
      </div>

      {enrichmentByPlayer && enrichmentByPlayer.size > 0 && (
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
            <span className="w-2 h-2 rounded-full border-2 border-dotted border-ink-500" /> Tactical role not yet confirmed
          </span>
        </div>
      )}
    </div>
  );
}
