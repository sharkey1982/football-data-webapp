// ============================================================================
// src/pages/football/LeaguesPage.tsx
//
// /football/leagues -- every league with a history on file, grouped by
// country, each linking to its seasons. Server-rendered at build.
// ============================================================================

import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { leaguePath, loadLeaguesList, seasonDisplay, type LeaguesListEntry } from '../../lib/leagueSeasonApi';

export default function LeaguesPage({ initialData }: { initialData?: LeaguesListEntry[] }) {
  const { data, failed, loading } = useKeyedFetch('all', loadLeaguesList, initialData ? { key: 'all', data: initialData } : undefined);

  useDocumentHead({
    title: 'Leagues: every season, final table and champion',
    description: 'Final tables, champions and season statistics for the English leagues since 1992/93 and 18 European top flights.',
    path: '/football/leagues',
  });

  const countries: [string, LeaguesListEntry[]][] = [];
  for (const l of data ?? []) {
    const c = l.country ?? 'Other';
    const group = countries.find(([name]) => name === c);
    if (group) group[1].push(l);
    else countries.push([c, [l]]);
  }

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Football</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Leagues</h1>
      </header>
      {failed && <p className="text-ink-700">Leagues are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {countries.map(([country, leagues]) => (
          <section key={country}>
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{country}</h2>
            <ul className="mt-1 space-y-1">
              {leagues.map((l) => (
                <li key={l.league_id} className="text-sm">
                  <Link to={leaguePath(l)} className="text-pitch-800 underline underline-offset-2">{l.name}</Link>
                  <span className="text-ink-500">{` · ${l.seasons} ${l.seasons === 1 ? 'season' : 'seasons'}, ${seasonDisplay(l.code, l.from)} to ${seasonDisplay(l.code, l.to)}`}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}
