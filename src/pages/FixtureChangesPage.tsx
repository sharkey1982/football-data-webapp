// ============================================================================
// src/pages/FixtureChangesPage.tsx
//
// /fixtures/changes -- every kick-off change in the last 30 days, one line
// per fixture, from where it was to where it is now. Net of the feed's
// flip-flops (fixture_changes_net). Replaces the banner that used to sit on
// the Fixtures and gameweek pages.
// ============================================================================

import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { getFixtureChanges, type FixtureChange } from '../lib/api';
import { formatMatchDateWithYear } from '../lib/formatDate';

const LEAGUES: [string, string][] = [
  ['E0', 'Premier League'], ['E1', 'Championship'], ['E2', 'League One'], ['E3', 'League Two'], ['EC', 'National League'],
  ['SC0', 'Scottish Premiership'], ['SP1', 'La Liga'], ['D1', 'Bundesliga'], ['I1', 'Serie A'], ['F1', 'Ligue 1'],
  ['UCL', 'Champions League'], ['UEL', 'Europa League'], ['UECL', 'Conference League'],
];

const kickoff = (date: string, time: string | null) => `${formatMatchDateWithYear(date)}${time ? ` ${time.slice(0, 5)}` : ''}`;

function what(c: FixtureChange): string {
  if (c.was_date === c.now_date) return 'New kick-off time';
  return new Date(c.now_date) > new Date(c.was_date) ? 'Moved later' : 'Moved earlier';
}

export default function FixtureChangesPage() {
  const [params, setParams] = useSearchParams();
  const league = params.get('league') ?? 'E0';
  const { data, failed, loading } = useKeyedFetch(league, () => getFixtureChanges(league === 'all' ? null : league));

  useDocumentHead({
    title: 'Fixture changes: kick-off moves in the last 30 days',
    description: 'Every fixture whose kick-off date or time has changed in the last 30 days: TV picks, postponements and rearrangements, from where it was to where it is now.',
    path: '/fixtures/changes',
  });

  const upcoming = (data ?? []).filter((c) => c.status !== 'played');
  const played = (data ?? []).filter((c) => c.status === 'played');

  const table = (rows: FixtureChange[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
        <thead className="bg-chalk-200 text-ink-500">
          <tr>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2">Fixture</th>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2 hidden sm:table-cell">Was</th>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2">Now</th>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2 hidden md:table-cell">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={c.fixture_id} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
              <th scope="row" className="text-left px-3 py-1.5 font-normal">
                {c.slug ? (
                  <Link to={`/football/matches/${c.slug}`} className="hover:underline">{`${c.home_team_name} v ${c.away_team_name}`}</Link>
                ) : (
                  `${c.home_team_name} v ${c.away_team_name}`
                )}
                {league === 'all' && <span className="block text-xs text-ink-500">{c.league_name}</span>}
                <span className="sm:hidden block text-xs text-ink-500">{`Was ${kickoff(c.was_date, c.was_time)}`}</span>
              </th>
              <td className="px-3 py-1.5 text-xs text-ink-500 whitespace-nowrap hidden sm:table-cell">{kickoff(c.was_date, c.was_time)}</td>
              <td className="px-3 py-1.5 text-xs text-ink-900 whitespace-nowrap font-medium">{kickoff(c.now_date, c.now_time)}</td>
              <td className="px-3 py-1.5 text-xs text-ink-700 hidden md:table-cell">{what(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/fixtures" className="hover:underline">Fixtures</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Fixture changes</h1>
        <p className="text-sm text-ink-700 mt-1 max-w-prose">
          Kick-offs that have moved in the last 30 days, from where they were to where they are now. A fixture moved and then moved back is not listed.
        </p>
      </header>

      <label className="block max-w-xs">
        <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Competition</span>
        <select
          value={league}
          onChange={(e) => setParams(e.target.value === 'E0' ? {} : { league: e.target.value }, { replace: true })}
          className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white"
        >
          {LEAGUES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          <option value="all">All competitions</option>
        </select>
      </label>

      {failed && <p className="text-ink-700">Fixture changes are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && upcoming.length === 0 && played.length === 0 && <p className="text-ink-700">No kick-off changes in the last 30 days.</p>}

      {upcoming.length > 0 && (
        <section className="space-y-2" aria-labelledby="upcoming-changes">
          <h2 id="upcoming-changes" className="font-display uppercase tracking-wide text-lg text-ink-900">Still to play</h2>
          {table(upcoming)}
        </section>
      )}
      {played.length > 0 && (
        <section className="space-y-2" aria-labelledby="played-changes">
          <h2 id="played-changes" className="font-display uppercase tracking-wide text-lg text-ink-900">Already played</h2>
          {table(played)}
        </section>
      )}
    </article>
  );
}
