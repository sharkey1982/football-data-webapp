// ============================================================================
// src/pages/football/HistoryHubPage.tsx
//
// Entry to the historical tools, and the answer to one question on its own:
// how quickly does the league table become a reliable guide to the final
// one? Measured over every complete season of the same size (see
// docs/methodology/history.md). Server-rendered at build with initialData,
// so the numbers are in the HTML for search engines and AI crawlers.
// ============================================================================

import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import LineChart from '../../components/history/LineChart';
import {
  HISTORY_LEAGUES,
  leagueByCode,
  loadHistoryHubData,
  settleSentence,
  share,
  type HistoryHubData,
  type ReliabilityRow,
} from '../../lib/historyApi';

const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const f2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

export default function HistoryHubPage({ initialData }: { initialData?: HistoryHubData }) {
  const [params, setParams] = useSearchParams();
  const league = leagueByCode(params.get('league') ?? initialData?.leagueCode ?? 'E0');
  const { data, failed } = useKeyedFetch(
    league.code,
    () => loadHistoryHubData(league.code),
    initialData ? { key: initialData.leagueCode, data: initialData } : undefined
  );

  useDocumentHead({
    title: 'Football history — what the table tells you, and when',
    description:
      'How quickly the league table settles, where teams in any position went on to finish, and how a season’s pace compares with every champion and relegated side since 1992.',
    path: '/football/history',
  });

  const rel = data?.reliability ?? [];
  const at = (n: number) => rel.find((r) => r.matches_played === n);
  const checkpoints = [10, 20, 30].map(at).filter((r): r is ReliabilityRow => Boolean(r));
  const seasons = rel[0]?.seasons ?? 0;
  const [clubs, games] = (data?.comparableGroup ?? '20x38').split('x');

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Football &middot; History</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">When does the table become real?</h1>
      </header>

      <label className="block max-w-xs">
        <span className="text-xs font-mono uppercase tracking-widest text-ink-500">League</span>
        <select
          value={league.code}
          onChange={(e) => setParams({ league: e.target.value })}
          className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white"
        >
          {HISTORY_LEAGUES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      {failed && <p className="text-ink-700">History is unavailable right now.</p>}
      {!data && !failed && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && rel.length > 0 && (
        <>
          <section className="space-y-3" aria-labelledby="settle-heading">
            <h2 id="settle-heading" className="sr-only">How far the table still moves</h2>
            <p className="text-ink-900 max-w-prose">{settleSentence(league.name, checkpoints)}</p>
            <LineChart
              ariaLabel={`Average places between position after each match and final position, ${league.name}`}
              xLabel="Matches played"
              yLabel="Places from final position"
              yMin={0}
              series={[
                {
                  id: 'change',
                  label: 'Average places from final position',
                  points: rel.map((r) => ({ x: r.matches_played, y: Math.round(r.mean_abs_position_change * 100) / 100 })),
                  strokeClass: 'stroke-pitch-700',
                  width: 2.5,
                },
              ]}
            />
            <p className="text-xs text-ink-500 max-w-prose">
              {`${seasons} complete ${clubs}-club, ${games}-match seasons. Position is ranked on each club\u2019s record after the same number of matches; curtailed seasons are left out.`}
            </p>
          </section>

          <section>
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">At a glance</h2>
            <div className="overflow-x-auto mt-2">
              <table className="text-sm border border-chalk-300 rounded-lg overflow-hidden">
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    <th scope="col" className="text-left font-medium text-xs px-3 py-2">After</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">Places from final position</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">Rank correlation with final table</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">Already in final position</th>
                  </tr>
                </thead>
                <tbody>
                  {rel
                    .filter((r) => r.matches_played % 5 === 0 || r.matches_played === 1)
                    .map((r, i) => (
                      <tr key={r.matches_played} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                        <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                          {r.matches_played} {r.matches_played === 1 ? 'match' : 'matches'}
                        </th>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{f1(r.mean_abs_position_change)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{f2(r.rank_correlation)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{Math.round(r.same_position_share * 100)}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <Link to={`/football/history/what-happened-next?league=${league.code}`} className="block border border-chalk-300 rounded-lg p-4 bg-white hover:border-pitch-700">
              <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">What happened next?</h2>
              <p className="text-sm text-ink-700 mt-1">
                {`Leaders after 10 matches won the ${league.name}: ${share(data.leadersAfter10.champions, data.leadersAfter10.teamSeasons)}.`}
              </p>
            </Link>
            <Link to={`/football/history/pace?league=${league.code}`} className="block border border-chalk-300 rounded-lg p-4 bg-white hover:border-pitch-700">
              <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Historic pace</h2>
              <p className="text-sm text-ink-700 mt-1">This season&rsquo;s points against every champion and relegated side at the same stage.</p>
            </Link>
            <Link to="/football/history/trends" className="block border border-chalk-300 rounded-lg p-4 bg-white hover:border-pitch-700">
              <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">How the game has changed</h2>
              <p className="text-sm text-ink-700 mt-1">Goals, home advantage, draws and title thresholds, season by season.</p>
            </Link>
            <Link to="/football/records" className="block border border-chalk-300 rounded-lg p-4 bg-white hover:border-pitch-700">
              <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Record Book</h2>
              <p className="text-sm text-ink-700 mt-1">Most points, longest runs and biggest wins in every league.</p>
            </Link>
            <Link to="/football/history/scorelines" className="block border border-chalk-300 rounded-lg p-4 bg-white hover:border-pitch-700">
              <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Scoreline Explorer</h2>
              <p className="text-sm text-ink-700 mt-1">How often every score happens, by league, era or club.</p>
            </Link>
          </section>
        </>
      )}

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/table" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          League tables
        </Link>
        <Link to="/football/leagues-compared" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          League Insights
        </Link>
        <Link to="/teams" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Club histories
        </Link>
      </nav>
    </article>
  );
}
