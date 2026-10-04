// ============================================================================
// src/pages/nfl/NflHeatMapPage.tsx
//
// /nfl/fixture-heat-map -- "Fixture Heat Map", as in Fantasy: every team's
// next six games, each cell the fantasy points that opponent gives up per
// game to the chosen position, coloured kind (green) to tough (red). Sort by
// the average to find the friendliest run. Client-rendered.
// ============================================================================

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { NFL_HEAT_MAP_PATH, NFL_HUB_PATH, nflTeamPath } from '../../lib/nflApi';
import { FANTASY_POSITIONS, FORMATS, fmt1, loadHeatMap, type FantasyPosition, type HeatCell, type ScoringFormat } from '../../lib/nflFantasyApi';

/** Rank 1 = gives up the most. Green for the kindest third, red for the toughest. */
function cellClass(c: HeatCell): string {
  if (c.bye) return 'bg-chalk-200 text-ink-500';
  if (c.rank == null) return '';
  if (c.rank <= 6) return 'bg-pitch-700 text-chalk-100';
  if (c.rank <= 12) return 'bg-pitch-600/30 text-ink-900';
  if (c.rank >= 27) return 'bg-loss-600 text-chalk-100';
  if (c.rank >= 21) return 'bg-loss-600/25 text-ink-900';
  return 'text-ink-900';
}

export default function NflHeatMapPage() {
  const [params, setParams] = useSearchParams();
  const posParam = (params.get('pos') ?? 'WR').toUpperCase();
  const position = ((FANTASY_POSITIONS as readonly string[]).includes(posParam) ? posParam : 'WR') as FantasyPosition;
  const fmtParam = params.get('fmt') as ScoringFormat | null;
  const format: ScoringFormat = fmtParam && FORMATS.some((f) => f.key === fmtParam) ? fmtParam : 'ppr';
  const { data, failed, loading } = useKeyedFetch(`${position}:${format}`, () => loadHeatMap(position, format));
  const [sortBy, setSortBy] = useState<'average' | 'team'>('average');

  useDocumentHead({
    title: 'NFL fantasy fixture heat map: kindest and toughest matchups',
    description: 'Every NFL team’s next six games coloured by how many fantasy points each opponent gives up to quarterbacks, running backs, receivers, tight ends and kickers.',
    path: NFL_HEAT_MAP_PATH,
  });

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true });
  };
  const rows = useMemo(
    () => (data ? [...data.rows].sort((a, b) => (sortBy === 'team' ? a.team.name.localeCompare(b.team.name) : (b.average ?? -1) - (a.average ?? -1))) : []),
    [data, sortBy]
  );

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to="/nfl/fantasy" className="hover:underline">Fantasy</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Fixture Heat Map</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Which teams face the defences that give up the most fantasy points to a position over the next six weeks. Green: generous defences; red: stingy ones.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <div role="group" aria-label="Position" className="inline-flex border border-chalk-300 rounded overflow-hidden">
          {FANTASY_POSITIONS.map((p) => (
            <button key={p} type="button" aria-pressed={position === p} onClick={() => set('pos', p)} className={`px-2.5 py-1 ${position === p ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700'}`}>
              {p}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Scoring" className="inline-flex border border-chalk-300 rounded overflow-hidden">
          {FORMATS.map((f) => (
            <button key={f.key} type="button" aria-pressed={format === f.key} onClick={() => set('fmt', f.key)} className={`px-2.5 py-1 ${format === f.key ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {failed && <p className="text-ink-700">The heat map is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && (
        <>
          <p className="text-sm text-ink-700 max-w-prose" data-testid="nfl-heat-basis">
            {data.basisSeason === data.season
              ? `Defences judged on the ${data.season} season so far (at least ${data.basisGames} games each).`
              : `Too early in ${data.season} to judge defences, so this uses the ${data.basisSeason} regular season.`}
            {rows[0]?.average != null && ` Kindest run for ${position}s: the ${rows[0].team.name}, facing defences that give up ${fmt1(rows[0].average)} points a game on average.`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
              <thead className="bg-chalk-200 text-ink-500">
                <tr>
                  <th scope="col" className="text-left font-medium text-xs px-2 py-2" aria-sort={sortBy === 'team' ? 'ascending' : 'none'}>
                    <button type="button" className="hover:underline" onClick={() => setSortBy('team')}>Team</button>
                  </th>
                  {data.weeks.map((w) => (
                    <th key={w} scope="col" className="text-center font-medium text-xs px-1.5 py-2">{`Wk ${w}`}</th>
                  ))}
                  <th scope="col" className="text-right font-medium text-xs px-2 py-2" aria-sort={sortBy === 'average' ? 'descending' : 'none'}>
                    <button type="button" className="hover:underline" onClick={() => setSortBy('average')}>Avg</button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.team.franchise} className="border-t border-chalk-300">
                    <th scope="row" className="text-left px-2 py-1 font-normal whitespace-nowrap">
                      <Link to={nflTeamPath(r.team.slug)} className="hover:underline">{r.team.short_name}</Link>
                    </th>
                    {r.cells.map((c) => (
                      <td key={c.week} className={`text-center px-1.5 py-1 text-[11px] leading-tight ${cellClass(c)}`} title={c.rank ? `Rank ${c.rank} of 32` : undefined}>
                        {c.bye ? 'Bye' : (
                          <>
                            <span className="block">{`${c.home ? '' : '@'}${c.opponent}`}</span>
                            <span className="block font-mono tabular-nums">{fmt1(c.perGame)}</span>
                          </>
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right font-mono text-xs tabular-nums font-semibold">{fmt1(r.average)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-500 max-w-prose">
            {`Each cell: the opponent (@ = away) and the ${FORMATS.find((f) => f.key === format)!.label} points it gave up per game to all ${position}s combined, regular season. Average: over the games shown, byes left out. Data: nflverse.`}
          </p>
        </>
      )}
    </article>
  );
}
