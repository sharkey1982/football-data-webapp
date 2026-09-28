// ============================================================================
// src/pages/football/TrendsPage.tsx
//
// League Lab: /football/history/trends (Premier League) and
// /football/history/trends/:league. How one league has changed season by
// season: goals, results split, home advantage, title and relegation
// thresholds, competitive balance. Every chart has the season table below
// it. Server-rendered at build with initialData.
// ============================================================================

import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import LineChart, { ChartLegend } from '../../components/history/LineChart';
import { DEFAULT_TRENDS_LEAGUE, loadTrends, metricSeries, periodChanges, trendsHeadline, trendsPath, type TrendsData } from '../../lib/trendsApi';
import { LEAGUE_SLUGS, isEnglish, leaguePath, leagueSeasonPath, seasonDisplay } from '../../lib/leagueSeasonApi';
import NotFoundPage from '../NotFoundPage';

const LEAGUE_NAMES: Record<string, string> = {
  E0: 'Premier League', E1: 'Championship', E2: 'League One', E3: 'League Two', EC: 'National League',
  SP1: 'La Liga', D1: 'Bundesliga', I1: 'Serie A', F1: 'Ligue 1', P1: 'Primeira Liga', B1: 'Belgian Pro League', T1: 'Süper Lig',
  G1: 'Super League Greece', N1: 'Eredivisie', SC0: 'Scottish Premiership', AUT: 'Austrian Bundesliga', DNK: 'Danish Superliga',
  NOR: 'Eliteserien', POL: 'Ekstraklasa', ROU: 'Romanian Superliga', SWE: 'Allsvenskan', SWZ: 'Swiss Super League', FIN: 'Veikkausliiga',
};

/** A y-range that fits the data with a little room, so slow trends are visible. */
function fit(points: { y: number }[], step: number): { yMin: number; yMax: number } {
  if (!points.length) return { yMin: 0, yMax: 1 };
  const ys = points.map((p) => p.y);
  return { yMin: Math.floor(Math.min(...ys) / step) * step - step, yMax: Math.ceil(Math.max(...ys) / step) * step + step };
}

function Chart({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{title}</h2>
      {children}
      {note && <p className="text-xs text-ink-500 max-w-prose">{note}</p>}
    </section>
  );
}

export default function TrendsPage({ initialData }: { initialData?: TrendsData }) {
  const { league: param } = useParams();
  const slug = param ?? DEFAULT_TRENDS_LEAGUE;
  const navigate = useNavigate();
  const { data, failed, loading } = useKeyedFetch(slug, () => loadTrends(slug), initialData ? { key: initialData.league.slug, data: initialData } : undefined);

  useDocumentHead({
    title: data ? `Historic Trends: how the ${data.league.name} has changed` : 'Historic Trends: how football has changed',
    description: data ? trendsHeadline(data) : 'Goals, home advantage, draws, title and relegation thresholds and competitive balance, season by season.',
    path: data ? trendsPath(data.league) : '/football/history/trends',
  });

  if (!loading && !failed && data === null) return <NotFoundPage />;
  const seasons = data ? [...data.seasons].sort((a, b) => a.start_year - b.start_year) : [];
  const english = data ? isEnglish(data.league) : false;
  const changes = data ? periodChanges(data) : [];
  const covid = seasons.filter((s) => s.covid_affected).map((s) => seasonDisplay(data!.league.code, s.start_year));
  const current = seasons.find((s) => !s.is_final);
  const covidNote = covid.length ? `${covid.join(' and ')} ${covid.length === 1 ? 'was' : 'were'} played wholly or partly behind closed doors.` : undefined;

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/football" className="hover:underline">Football &middot; Historic Trends</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">{data ? `Historic Trends: ${data.league.name}` : 'Historic Trends'}</h1>
      </header>

      <label className="block max-w-xs">
        <span className="text-xs font-mono uppercase tracking-widest text-ink-500">League</span>
        <select
          value={slug}
          onChange={(e) => navigate(trendsPath({ slug: e.target.value }))}
          className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white"
        >
          {Object.entries(LEAGUE_SLUGS).map(([code, s]) => (
            <option key={code} value={s}>{LEAGUE_NAMES[code] ?? code}</option>
          ))}
        </select>
      </label>

      {failed && <p className="text-ink-700">League trends are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="trends-headline">{trendsHeadline(data)}</p>

          {changes.length > 0 && (
            <div className="overflow-x-auto">
              <table className="text-sm border border-chalk-300 rounded-lg overflow-hidden">
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    <th scope="col" className="text-left font-medium text-xs px-3 py-2">Measure</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">{changes[0].firstSpan}</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">{changes[0].lastSpan}</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c, i) => (
                    <tr key={c.metric.key} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                      <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">{c.metric.label}</th>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{c.metric.fmt(c.from)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{c.metric.fmt(c.to)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-ink-500 mt-1 max-w-prose">
                {`Averages of the first and last ${changes[0].n} complete seasons on file; curtailed and Covid-affected seasons left out.`}
              </p>
            </div>
          )}

          <Chart title="Goals per game" note={current ? `${seasonDisplay(data.league.code, current.start_year)} is the season so far.` : undefined}>
            <LineChart
              ariaLabel={`${data.league.name} goals per game by season`}
              xLabel="Season (start year)"
              yLabel="Goals per game"
              height={240}
              {...fit(metricSeries(seasons, (s) => s.goals_per_game), 0.1)}
              series={[{ id: 'g', label: 'Goals per game', points: metricSeries(seasons, (s) => s.goals_per_game), strokeClass: 'stroke-pitch-700', width: 2.5, dots: true }]}
            />
          </Chart>

          <Chart title="Home wins, draws and away wins">
            <LineChart
              ariaLabel={`${data.league.name} share of home wins, draws and away wins by season`}
              xLabel="Season (start year)"
              yLabel="% of matches"
              yMin={0}
              height={260}
              series={[
                { id: 'h', label: 'Home wins', points: metricSeries(seasons, (s) => s.home_win_share, 100), strokeClass: 'stroke-pitch-700', width: 2.5 },
                { id: 'd', label: 'Draws', points: metricSeries(seasons, (s) => s.draw_share, 100), strokeClass: 'stroke-ink-500', width: 2, dashed: true },
                { id: 'a', label: 'Away wins', points: metricSeries(seasons, (s) => s.away_win_share, 100), strokeClass: 'stroke-cup-600', width: 2 },
              ]}
            />
            <ChartLegend
              items={[
                { label: 'Home wins', swatchClass: 'bg-pitch-700' },
                { label: 'Draws', swatchClass: 'bg-ink-500', dashed: true },
                { label: 'Away wins', swatchClass: 'bg-cup-600' },
              ]}
            />
          </Chart>

          <Chart title="Home advantage" note={`Home minus away points per game. ${covidNote ?? ''}`.trim()}>
            <LineChart
              ariaLabel={`${data.league.name} home advantage by season`}
              xLabel="Season (start year)"
              yLabel="Points per game"
              height={240}
              {...fit(metricSeries(seasons, (s) => s.home_ppg_advantage), 0.1)}
              series={[{ id: 'ha', label: 'Home advantage', points: metricSeries(seasons, (s) => s.home_ppg_advantage), strokeClass: 'stroke-pitch-700', width: 2.5, dots: true }]}
            />
          </Chart>

          <Chart
            title={english ? 'What it took to win the league, and to go down' : 'What it took to win the league'}
            note={english ? 'Points per game, so seasons of different lengths compare. The lower line is the most any relegated club collected.' : 'Points per game, so seasons of different lengths compare.'}
          >
            <LineChart
              ariaLabel={`${data.league.name} champions' points per game${english ? ' and the best relegated club' : ''} by season`}
              xLabel="Season (start year)"
              yLabel="Points per game"
              yMin={0}
              height={260}
              series={[
                { id: 'c', label: 'Champions', points: metricSeries(seasons.filter((s) => s.is_final && !s.split_format), (s) => (s.champion_points == null ? null : s.champion_points / s.games_in_season)), strokeClass: 'stroke-cup-600', width: 2.5, dots: true },
                ...(english
                  ? [{ id: 'r', label: 'Best relegated club', points: metricSeries(seasons.filter((s) => s.is_final && !s.split_format), (s) => (s.highest_relegated_points == null ? null : s.highest_relegated_points / s.games_in_season)), strokeClass: 'stroke-loss-600', width: 2, dots: true }]
                  : []),
              ]}
            />
            <ChartLegend
              items={[
                { label: 'Champions', swatchClass: 'bg-cup-600' },
                ...(english ? [{ label: 'Best relegated club', swatchClass: 'bg-loss-600' }] : []),
              ]}
            />
          </Chart>

          <Chart title="Competitive balance" note="Noll-Scully ratio: the spread of clubs' win rates against what pure chance would give. 1 is perfectly even; higher means a more unequal league.">
            <LineChart
              ariaLabel={`${data.league.name} Noll-Scully competitive balance by season`}
              xLabel="Season (start year)"
              yLabel="Noll-Scully"
              height={240}
              {...fit(metricSeries(seasons.filter((s) => s.is_final), (s) => s.noll_scully), 0.1)}
              series={[{ id: 'ns', label: 'Noll-Scully', points: metricSeries(seasons.filter((s) => s.is_final), (s) => s.noll_scully), strokeClass: 'stroke-pitch-700', width: 2.5, dots: true }]}
            />
          </Chart>

          <section aria-labelledby="season-table">
            <h2 id="season-table" className="font-display uppercase tracking-wide text-lg text-ink-900">Season by season</h2>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    <th scope="col" className="text-left font-medium text-xs px-2 py-2">Season</th>
                    <th scope="col" className="text-right font-medium text-xs px-2 py-2">Goals/game</th>
                    <th scope="col" className="text-right font-medium text-xs px-2 py-2">Home</th>
                    <th scope="col" className="text-right font-medium text-xs px-2 py-2">Draw</th>
                    <th scope="col" className="text-right font-medium text-xs px-2 py-2">Away</th>
                    <th scope="col" className="text-right font-medium text-xs px-2 py-2 hidden sm:table-cell">Home adv.</th>
                    <th scope="col" className="text-right font-medium text-xs px-2 py-2 hidden sm:table-cell">Champions</th>
                    <th scope="col" className="text-right font-medium text-xs px-2 py-2 hidden md:table-cell">Noll-Scully</th>
                  </tr>
                </thead>
                <tbody>
                  {[...seasons].reverse().filter((s) => s.matches > 0).map((s, i) => (
                    <tr key={s.season_id} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                      <th scope="row" className="text-left px-2 py-1.5 font-normal whitespace-nowrap">
                        <Link to={leagueSeasonPath(data.league, s.start_year)} className="text-pitch-800 underline underline-offset-2">
                          {seasonDisplay(data.league.code, s.start_year)}
                        </Link>
                        {!s.is_final && <span className="text-xs text-ink-500"> (so far)</span>}
                        {s.curtailed && <span className="text-xs text-ink-500"> (curtailed)</span>}
                      </th>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{s.goals_per_game?.toFixed(2) ?? '–'}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{s.home_win_share == null ? '–' : `${Math.round(s.home_win_share * 100)}%`}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{s.draw_share == null ? '–' : `${Math.round(s.draw_share * 100)}%`}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{s.away_win_share == null ? '–' : `${Math.round(s.away_win_share * 100)}%`}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums hidden sm:table-cell">{s.home_ppg_advantage?.toFixed(2) ?? '–'}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums hidden sm:table-cell">{s.is_final && s.champion_points != null ? `${s.champion_points} pts` : '–'}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums hidden md:table-cell">{s.is_final ? (s.noll_scully?.toFixed(2) ?? '–') : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <Link to={leaguePath(data.league)} className="text-pitch-800 underline underline-offset-2">{`Every ${data.league.name} season`}</Link>
            <Link to={`/football/records/${data.league.slug}`} className="text-pitch-800 underline underline-offset-2">{`${data.league.name} records`}</Link>
            <Link to="/football/leagues-compared" className="text-pitch-800 underline underline-offset-2">League Insights</Link>
          </nav>
        </>
      )}
    </article>
  );
}
