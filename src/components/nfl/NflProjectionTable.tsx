// ============================================================================
// src/components/nfl/NflProjectionTable.tsx
//
// The Player Projections's player table: used by /nfl/player-projections (every game)
// and by each team tab of an NFL game page (one team, compact), so the two
// cannot drift apart.
// ============================================================================

import { Link } from 'react-router-dom';
import { nflGamePath, nflPlayerPath } from '../../lib/nflApi';
import { fantasyPosition, fmt1, type ScoringFormat } from '../../lib/nflFantasyApi';
import { isUnlikely, matchupLabel, matchupPct, projOf, rangeOf, teamPointsLabel, type NflProjection } from '../../lib/nflProjections';

function Status({ r }: { r: NflProjection }) {
  if (!r.injury_status) return null;
  const tone =
    r.injury_status === 'Out' ? 'bg-loss-600 text-chalk-100' : r.injury_status === 'Doubtful' ? 'bg-amber-400 text-pitch-950' : 'bg-chalk-200 text-ink-700';
  return (
    <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`} title={r.injury ? `${r.injury_status}: ${r.injury}` : r.injury_status} data-testid="nfl-proj-status">
      {r.injury_status === 'Questionable' ? 'Q' : r.injury_status}
    </span>
  );
}

export default function NflProjectionTable({ rows, fmt, compact = false, startRank = 1 }: { rows: NflProjection[]; fmt: ScoringFormat; compact?: boolean; startRank?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
        <thead className="bg-chalk-200 text-ink-500">
          <tr>
            {!compact && <th scope="col" className="text-right font-medium text-xs px-2 py-2">#</th>}
            <th scope="col" className="text-left font-medium text-xs px-2 py-2">Player</th>
            {!compact && <th scope="col" className="text-left font-medium text-xs px-2 py-2">Game</th>}
            <th scope="col" className="text-right font-medium text-xs px-2 py-2">Proj</th>
            <th scope="col" className="text-right font-medium text-xs px-2 py-2 hidden sm:table-cell">Range</th>
            <th scope="col" className="text-right font-medium text-xs px-2 py-2 hidden sm:table-cell">{fmt === 'ppr' ? 'Season avg' : 'Season avg (PPR)'}</th>
            {!compact && <th scope="col" className="text-right font-medium text-xs px-2 py-2 hidden md:table-cell">Team pts</th>}
            <th scope="col" className="text-right font-medium text-xs px-2 py-2 hidden sm:table-cell">Matchup</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const [lo, hi] = rangeOf(r, fmt);
            const m = matchupPct(r);
            const out = isUnlikely(r);
            return (
              <tr key={`${r.game_id}-${r.player_id}`} className={`${i % 2 ? 'bg-chalk-100/60' : ''} ${out ? 'text-ink-500' : ''}`} data-testid="nfl-proj-row">
                {!compact && <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">{startRank + i}</td>}
                <th scope="row" className="text-left px-2 py-1.5 font-normal">
                  <Link to={nflPlayerPath(r.player_slug)} className="hover:underline">{r.player_name}</Link>
                  <span className="text-xs text-ink-500">{` ${fantasyPosition(r.position)}`}</span>
                  <Status r={r} />
                </th>
                {!compact && (
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                    <Link to={nflGamePath(r.game_id)} className="hover:underline">{`${r.team_short} ${r.at_home ? 'v' : '@'} ${r.opponent_short}`}</Link>
                  </td>
                )}
                <td className={`px-2 py-1.5 text-right font-mono text-xs tabular-nums font-semibold ${out ? 'line-through' : ''}`}>
                  {fmt1(projOf(r, fmt))}
                  {r.method === 'season_avg' && <span className="text-ink-500 font-normal" title="Season average: the projector did not clearly beat it for this position">*</span>}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500 hidden sm:table-cell">{`${fmt1(lo)}–${fmt1(hi)}`}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums hidden sm:table-cell">{r.season_avg_ppr == null ? '–' : fmt1(Number(r.season_avg_ppr))}</td>
                {!compact && <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums hidden md:table-cell">{teamPointsLabel(r)}</td>}
                <td className={`px-2 py-1.5 text-right font-mono text-xs tabular-nums hidden sm:table-cell ${m == null || Math.abs(m) < 5 ? '' : m > 0 ? 'text-pitch-800' : 'text-loss-700'}`}>{matchupLabel(r)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
