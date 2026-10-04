// ============================================================================
// src/pages/nfl/NflSeasonsPage.tsx
//
// /nfl/seasons -- "Past seasons", as in Football: every NFL season since
// 2002, its champion, runner-up, best record and scoring, each linking to
// the season's story. Server-rendered at build.
// ============================================================================

import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { NFL_HUB_PATH, NFL_SEASONS_PATH, loadNflSeasonIndex, nflSeasonPath, nflTeamPath, type NflSeasonIndexData } from '../../lib/nflApi';
import { seasonIndex, seasonsSentence } from '../../lib/nflStory';

export default function NflSeasonsPage({ initialData }: { initialData?: NflSeasonIndexData }) {
  const { data, failed, loading } = useKeyedFetch('index', loadNflSeasonIndex, initialData ? { key: 'index', data: initialData } : undefined);
  useDocumentHead({
    title: 'Every NFL season since 2002: champions and stories',
    description: data ? seasonsSentence(data) : 'Every NFL season since 2002: Super Bowl winners, best records and the story of each season.',
    path: NFL_SEASONS_PATH,
  });
  const rows = data ? seasonIndex(data.standings, data.summaries) : [];
  const slugByName = new Map((data?.standings ?? []).map((r) => [r.team_name, r.slug]));

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to="/nfl/discover" className="hover:underline">Discover</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Past seasons</h1>
      </header>
      {failed && <p className="text-ink-700">Past seasons are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="nfl-seasons-story">{seasonsSentence(data)}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
              <thead className="bg-chalk-200 text-ink-500">
                <tr>
                  <th scope="col" className="text-left font-medium text-xs px-2 py-2">Season</th>
                  <th scope="col" className="text-left font-medium text-xs px-2 py-2">Super Bowl winner</th>
                  <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Runner-up</th>
                  <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden md:table-cell">Best record</th>
                  <th scope="col" className="text-right font-medium text-xs px-2 py-2">Pts/game</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.season} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                    <th scope="row" className="text-left px-2 py-1.5 font-normal">
                      <Link to={nflSeasonPath(r.season)} className="text-pitch-800 underline underline-offset-2">{r.season}</Link>
                    </th>
                    <td className="px-2 py-1.5">
                      {r.champion ? (
                        <Link to={nflTeamPath(r.championSlug!)} className="hover:underline">{r.champion}</Link>
                      ) : (
                        <span className="text-ink-500">{r.complete ? '–' : 'In progress'}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 hidden sm:table-cell">
                      {r.runnerUp ? <Link to={nflTeamPath(slugByName.get(r.runnerUp) ?? '')} className="hover:underline">{r.runnerUp}</Link> : ''}
                    </td>
                    <td className="px-2 py-1.5 hidden md:table-cell text-ink-700">{`${r.best} (${r.bestRecord})`}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{r.pointsPerGame != null ? r.pointsPerGame.toFixed(1) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-500">Season = the year it kicked off: the 2025 season ended with the Super Bowl in February 2026. Data: nflverse.</p>
        </>
      )}
    </article>
  );
}
