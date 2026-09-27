// ============================================================================
// src/pages/football/LeagueIndexPage.tsx
//
// /football/leagues/:league -- every season of one league on file: who won
// it, with how many points, and who went up and down. Each row links to the
// canonical season page. Server-rendered at build with initialData.
// ============================================================================

import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import {
  isEnglish,
  leagueSeasonPath,
  leagueIndexSentence,
  listNames,
  loadLeagueIndex,
  seasonDisplay,
  type LeagueIndexData,
} from '../../lib/leagueSeasonApi';
import NotFoundPage from '../NotFoundPage';

export default function LeagueIndexPage({ initialData }: { initialData?: LeagueIndexData }) {
  const { league: slug = '' } = useParams();
  const { data, failed, loading } = useKeyedFetch(
    slug,
    () => loadLeagueIndex(slug),
    initialData ? { key: initialData.league.slug, data: initialData } : undefined
  );

  useDocumentHead({
    title: data ? `${data.league.name}: every season, champions and tables` : 'League history',
    description: data ? leagueIndexSentence(data) : 'Every season of a league: champions, points and who went up and down.',
    path: `/football/leagues/${slug}`,
  });

  if (!loading && !failed && data === null) return <NotFoundPage />;
  const english = data ? isEnglish(data.league) : false;
  const hasPromotion = data?.seasons.some((s) => s.promoted.length > 0) ?? false;

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/football/leagues" className="hover:underline">Football &middot; Leagues</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">{data ? data.league.name : 'League'}</h1>
        {data?.league.country && <p className="text-sm text-ink-500 mt-1">{data.league.country}</p>}
      </header>

      {failed && <p className="text-ink-700">This league is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="league-summary">{leagueIndexSentence(data)}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
              <thead className="bg-chalk-200 text-ink-500">
                <tr>
                  <th scope="col" className="text-left font-medium text-xs px-2 py-2">Season</th>
                  <th scope="col" className="text-left font-medium text-xs px-2 py-2">Champions</th>
                  <th scope="col" className="text-right font-medium text-xs px-2 py-2">Pts</th>
                  <th scope="col" className="text-right font-medium text-xs px-2 py-2 hidden sm:table-cell">Goals/game</th>
                  {hasPromotion && <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden md:table-cell">Promoted</th>}
                  <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden md:table-cell">{english ? 'Relegated' : 'Out next season'}</th>
                </tr>
              </thead>
              <tbody>
                {data.seasons.map((s, i) => (
                  <tr key={s.season_id} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                    <th scope="row" className="text-left px-2 py-1.5 font-normal whitespace-nowrap">
                      <Link to={leagueSeasonPath(data.league, s.start_year)} className="text-pitch-800 underline underline-offset-2">
                        {seasonDisplay(data.league.code, s.start_year)}
                      </Link>
                      {s.eraName !== data.league.name && <span className="block text-xs text-ink-500">{s.eraName}</span>}
                    </th>
                    <td className="px-2 py-1.5">
                      {s.leader ? (s.is_final ? s.leader.team_name : `${s.leader.team_name} (leading)`) : '–'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{s.leader?.points ?? '–'}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums hidden sm:table-cell">{s.goals_per_game?.toFixed(2) ?? '–'}</td>
                    {hasPromotion && <td className="px-2 py-1.5 text-xs text-ink-700 hidden md:table-cell">{listNames(s.promoted)}</td>}
                    <td className="px-2 py-1.5 text-xs text-ink-700 hidden md:table-cell">{listNames(s.relegated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </article>
  );
}
