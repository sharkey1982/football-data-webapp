// ============================================================================
// src/pages/nfl/NflStandingsPage.tsx
//
// /nfl/standings/:season -- the eight division tables (or one sortable
// 32-team table) with the play-off result once a season is complete.
// /nfl/standings redirects to the latest season. Server-rendered at build
// for every season.
// ============================================================================

import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import {
  CONFERENCES,
  DIVISIONS,
  NFL_HUB_PATH,
  divisionRows,
  loadLatestNflSeason,
  loadNflStandings,
  nflStandingsPath,
  nflTeamPath,
  pctLabel,
  standingsSentence,
  type NflStanding,
  type NflStandingsData,
} from '../../lib/nflApi';
import NotFoundPage from '../NotFoundPage';

type SortKey = 'team_name' | 'won' | 'lost' | 'win_pct' | 'points_for' | 'points_against' | 'point_diff';

const num = 'px-2 py-1.5 text-right font-mono text-xs tabular-nums';

function split(w: number, l: number, t = 0): string {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function Cells({ r, showPlayoffs }: { r: NflStanding; showPlayoffs: boolean }) {
  return (
    <>
      <td className={num}>{r.won}</td>
      <td className={num}>{r.lost}</td>
      <td className={`${num} hidden sm:table-cell`}>{r.tied}</td>
      <td className={`${num} font-semibold`}>{pctLabel(r.win_pct)}</td>
      <td className={`${num} hidden sm:table-cell`}>{r.points_for}</td>
      <td className={`${num} hidden sm:table-cell`}>{r.points_against}</td>
      <td className={num}>{r.point_diff > 0 ? `+${r.point_diff}` : r.point_diff}</td>
      <td className={`${num} hidden md:table-cell`}>{split(r.home_won, r.home_lost)}</td>
      <td className={`${num} hidden md:table-cell`}>{split(r.away_won, r.away_lost)}</td>
      <td className={`${num} hidden md:table-cell`}>{split(r.div_won, r.div_lost, r.div_tied)}</td>
      {showPlayoffs && <td className="px-2 py-1.5 text-xs text-ink-700 hidden sm:table-cell">{r.playoff_result ?? ''}</td>}
    </>
  );
}

function HeadCells({ showPlayoffs }: { showPlayoffs: boolean }) {
  const th = 'text-right font-medium text-xs px-2 py-2';
  return (
    <>
      <th scope="col" className={th}>W</th>
      <th scope="col" className={th}>L</th>
      <th scope="col" className={`${th} hidden sm:table-cell`}>T</th>
      <th scope="col" className={th}>Pct</th>
      <th scope="col" className={`${th} hidden sm:table-cell`}>PF</th>
      <th scope="col" className={`${th} hidden sm:table-cell`}>PA</th>
      <th scope="col" className={th}>Diff</th>
      <th scope="col" className={`${th} hidden md:table-cell`}>Home</th>
      <th scope="col" className={`${th} hidden md:table-cell`}>Away</th>
      <th scope="col" className={`${th} hidden md:table-cell`}>Div</th>
      {showPlayoffs && <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Play-offs</th>}
    </>
  );
}

function LatestRedirect() {
  const { data, failed } = useKeyedFetch('latest', loadLatestNflSeason);
  if (failed) return <p className="text-ink-700">Standings are unavailable right now.</p>;
  if (data == null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  return <Navigate to={nflStandingsPath(data)} replace />;
}

export default function NflStandingsPage({ initialData }: { initialData?: NflStandingsData }) {
  const { season: seasonSeg } = useParams();
  if (seasonSeg === undefined) return <LatestRedirect />;
  return <SeasonStandings seasonSeg={seasonSeg} initialData={initialData} />;
}

function SeasonStandings({ seasonSeg, initialData }: { seasonSeg: string; initialData?: NflStandingsData }) {
  const season = /^\d{4}$/.test(seasonSeg) ? Number(seasonSeg) : null;
  const { data, failed, loading } = useKeyedFetch(
    season === null ? null : String(season),
    () => loadNflStandings(season as number),
    initialData ? { key: String(initialData.season), data: initialData } : undefined
  );
  const [view, setView] = useState<'division' | 'league'>('division');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'win_pct', desc: true });

  useDocumentHead({
    title: season ? `${season} NFL standings` : 'NFL standings',
    description: data ? standingsSentence(data) : 'NFL standings by division.',
    path: season ? nflStandingsPath(season) : '/nfl/standings',
  });

  if (season === null || (!loading && !failed && data === null)) return <NotFoundPage />;

  const showPlayoffs = data ? data.rows.some((r) => r.season_complete) : false;
  const idx = data ? data.seasons.indexOf(data.season) : -1;
  const prev = data && idx > 0 ? data.seasons[idx - 1] : null;
  const next = data && idx >= 0 && idx < data.seasons.length - 1 ? data.seasons[idx + 1] : null;

  const sorted = data
    ? [...data.rows].sort((a, b) => {
        const v = sort.key === 'team_name' ? a.team_name.localeCompare(b.team_name) : ((a[sort.key] as number) ?? 0) - ((b[sort.key] as number) ?? 0);
        return (sort.desc ? -v : v) || b.point_diff - a.point_diff;
      })
    : [];
  const sortHeader = (k: SortKey, label: string, cls = 'text-right') => (
    <th scope="col" className={`${cls} font-medium text-xs px-2 py-2`} aria-sort={sort.key === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="hover:underline" onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : k !== 'team_name' && k !== 'lost' && k !== 'points_against' }))}>
        {label}
      </button>
    </th>
  );

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; Standings
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">{`${season} NFL standings`}</h1>
      </header>

      {failed && <p className="text-ink-700">These standings are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="nfl-standings-story">{standingsSentence(data)}</p>

          <nav aria-label="Other seasons" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {prev && <Link to={nflStandingsPath(prev)} className="text-pitch-800 underline underline-offset-2">&larr; {prev}</Link>}
            <Link to={`${NFL_HUB_PATH}?season=${data.season}`} className="text-pitch-800 underline underline-offset-2">{`${data.season} schedule and results`}</Link>
            {next && <Link to={nflStandingsPath(next)} className="text-pitch-800 underline underline-offset-2">{next} &rarr;</Link>}
          </nav>

          <div role="group" aria-label="Table view" className="inline-flex border border-chalk-300 rounded overflow-hidden text-sm">
            {(['division', 'league'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`px-3 py-1 ${view === v ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700'}`}>
                {v === 'division' ? 'By division' : 'Whole league'}
              </button>
            ))}
          </div>

          {view === 'division' ? (
            <div className="space-y-8">
              {CONFERENCES.map((c) => (
                <section key={c} aria-labelledby={`conf-${c}`} className="space-y-4">
                  <h2 id={`conf-${c}`} className="font-display uppercase tracking-wide text-lg text-ink-900">{c}</h2>
                  {DIVISIONS.map((d) => (
                    <div key={d} className="overflow-x-auto">
                      <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                        <caption className="text-left text-xs font-mono uppercase tracking-widest text-ink-500 pb-1">{`${c} ${d}`}</caption>
                        <thead className="bg-chalk-200 text-ink-500">
                          <tr>
                            <th scope="col" className="text-left font-medium text-xs px-2 py-2">Team</th>
                            <HeadCells showPlayoffs={showPlayoffs} />
                          </tr>
                        </thead>
                        <tbody>
                          {divisionRows(data.rows, c, d).map((r, i) => (
                            <tr key={r.franchise} className={r.playoff_result === 'Won Super Bowl' ? 'bg-amber-100/60' : i % 2 ? 'bg-chalk-100/60' : undefined}>
                              <th scope="row" className="text-left px-2 py-1.5 font-normal">
                                <Link to={nflTeamPath(r.slug)} className="hover:underline">{r.team_name}</Link>
                                {r.playoff_result && <span className="sm:hidden text-xs text-ink-500">{` · ${r.playoff_result}`}</span>}
                              </th>
                              <Cells r={r} showPlayoffs={showPlayoffs} />
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    {sortHeader('team_name', 'Team', 'text-left')}
                    <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Division</th>
                    {sortHeader('won', 'W')}
                    {sortHeader('lost', 'L')}
                    {sortHeader('win_pct', 'Pct')}
                    {sortHeader('points_for', 'PF', 'text-right hidden sm:table-cell')}
                    {sortHeader('points_against', 'PA', 'text-right hidden sm:table-cell')}
                    {sortHeader('point_diff', 'Diff')}
                    {showPlayoffs && <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Play-offs</th>}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={r.franchise} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                      <th scope="row" className="text-left px-2 py-1.5 font-normal">
                        <Link to={nflTeamPath(r.slug)} className="hover:underline">{r.team_name}</Link>
                      </th>
                      <td className="px-2 py-1.5 text-xs text-ink-700 hidden sm:table-cell">{`${r.conference} ${r.division}`}</td>
                      <td className={num}>{r.won}</td>
                      <td className={num}>{r.lost}</td>
                      <td className={`${num} font-semibold`}>{pctLabel(r.win_pct)}</td>
                      <td className={`${num} hidden sm:table-cell`}>{r.points_for}</td>
                      <td className={`${num} hidden sm:table-cell`}>{r.points_against}</td>
                      <td className={num}>{r.point_diff > 0 ? `+${r.point_diff}` : r.point_diff}</td>
                      {showPlayoffs && <td className="px-2 py-1.5 text-xs text-ink-700 hidden sm:table-cell">{r.playoff_result ?? ''}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-ink-500 max-w-prose">
            Regular season only. Pct counts a tie as half a win. In completed seasons the division winner, taken from the play-off bracket, is listed first. Otherwise teams level on Pct are ordered by division record, then points difference: this is not the NFL&rsquo;s full tiebreak procedure, so the order of tied teams, and play-off seeding, can differ from the official standings. Data: nflverse.
          </p>
        </>
      )}
    </article>
  );
}
