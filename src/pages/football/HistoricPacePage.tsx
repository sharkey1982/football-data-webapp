// ============================================================================
// src/pages/football/HistoricPacePage.tsx
//
// A club's points this season, match by match, against where every champion
// and every relegated side stood after the same number of matches, and the
// record champions of this league size. Percentile against every complete
// season of the same size. Benchmarks: league_pace_benchmarks.
// ============================================================================

import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import LineChart, { ChartLegend } from '../../components/history/LineChart';
import {
  HISTORY_LEAGUES,
  leagueByCode,
  getLatestSeasonTable,
  getTeamSeasonPace,
  getPaceBenchmarks,
  getTopChampions,
  getWhatHappenedNext,
  comparableGroupFor,
  percentileRank,
  ordinal,
  seasonName,
  type Benchmark,
} from '../../lib/historyApi';

export default function HistoricPacePage() {
  const [params, setParams] = useSearchParams();
  const league = leagueByCode(params.get('league'));
  const tableFetch = useKeyedFetch(String(league.id), () => getLatestSeasonTable(league.id));
  const table = tableFetch.failed ? [] : tableFetch.data;

  const team = table?.find((t) => t.team_slug === params.get('team')) ?? table?.[0] ?? null;
  const group = comparableGroupFor(table?.[0]?.clubs ?? 20);

  useDocumentHead({
    title: team ? `${team.team_name}: points pace against every champion` : 'Historic pace — this season against every champion',
    description:
      'A club’s points after every match this season, against where every champion and relegated side stood at the same stage, with its percentile among all comparable seasons.',
    path: '/football/history/pace',
  });

  const paceFetch = useKeyedFetch(team ? `${league.id}:${team.season_id}:${team.team_id}` : null, () =>
    getTeamSeasonPace(league.id, team!.season_id, team!.team_id)
  );
  const pace = paceFetch.data;

  const groupKey = table ? `${league.id}:${group}` : null;
  const benchFetch = useKeyedFetch(groupKey, () => getPaceBenchmarks(league.id, group));
  const bench = benchFetch.data;
  // Top champions are decoration: if they fail, the chart goes without them.
  const champsFetch = useKeyedFetch(groupKey, async () => {
    const cs = await getTopChampions(league.id, group, 3);
    return Promise.all(cs.map(async (c) => ({ ...c, pace: await getTeamSeasonPace(league.id, c.season_id, c.team_id) })));
  });
  const champs = champsFetch.data ?? [];

  const latest = pace && pace.length ? pace[pace.length - 1] : null;

  const stageFetch = useKeyedFetch(latest ? `${league.id}:${group}:${latest.matches_played}` : null, () =>
    getWhatHappenedNext({ leagueId: league.id, played: latest!.matches_played, comparableGroup: group }).then((rows) => rows.map((r) => r.points))
  );
  const atStage = stageFetch.failed ? [] : stageFetch.data;

  const failed = tableFetch.failed || paceFetch.failed || benchFetch.failed;

  const series = (outcome: Benchmark['outcome'], k: 'p25' | 'p50' | 'p75') =>
    (bench ?? []).filter((b) => b.outcome === outcome).map((b) => ({ x: b.matches_played, y: Math.round(b[k] * 10) / 10 }));

  const benchAt = (outcome: Benchmark['outcome']) => (latest ? bench?.find((b) => b.outcome === outcome && b.matches_played === latest.matches_played) : undefined);
  const pct = latest && atStage ? percentileRank(latest.points, atStage) : null;

  const chart = useMemo(() => {
    if (!pace || !bench) return null;
    return {
      bands: [
        { id: 'champ', label: 'Champions (middle half)', lower: series('champion', 'p25'), upper: series('champion', 'p75'), fillClass: 'fill-amber-400/40' },
        { id: 'rel', label: 'Relegated (middle half)', lower: series('relegated', 'p25'), upper: series('relegated', 'p75'), fillClass: 'fill-loss-600/20' },
      ],
      series: [
        { id: 'median', label: 'All clubs (median)', points: series('all', 'p50'), strokeClass: 'stroke-ink-500', dashed: true, width: 1.5 },
        ...champs.map((c) => ({
          id: `c${c.season_id}`,
          label: `${c.team_name} ${seasonName(c.season_label)}`,
          points: c.pace.map((p) => ({ x: p.matches_played, y: p.points })),
          strokeClass: 'stroke-cup-600',
          width: 1,
        })),
        { id: 'team', label: team?.team_name ?? '', points: pace.map((p) => ({ x: p.matches_played, y: p.points })), strokeClass: 'stroke-pitch-700', width: 3, dots: true },
      ],
    };
  }, [pace, bench, champs, team?.team_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const seasons = benchAt('champion')?.team_seasons ?? 0;

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/football/history" className="hover:underline">Football &middot; Position Tracking</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Historic pace</h1>
      </header>

      <form className="grid gap-3 sm:grid-cols-3 items-end" onSubmit={(e) => e.preventDefault()}>
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">League</span>
          <select value={league.code} onChange={(e) => setParams({ league: e.target.value })} className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white">
            {HISTORY_LEAGUES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Club</span>
          <select value={team?.team_slug ?? ''} onChange={(e) => setParams({ league: league.code, team: e.target.value })} className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white">
            {(table ?? []).map((t) => (
              <option key={t.team_id} value={t.team_slug ?? ''}>
                {t.team_name}
              </option>
            ))}
          </select>
        </label>
      </form>

      {failed && <p className="text-ink-700">History is unavailable right now.</p>}
      {(!table || !pace || !bench) && !failed && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {team && latest && bench && chart && (
        <>
          <p className="text-ink-900 text-lg max-w-prose" data-testid="pace-answer">
            {team.team_name}: {latest.points} points after {latest.matches_played} matches
            {pct !== null && atStage && atStage.length > 0 && (
              <>
                {' '}&mdash; {ordinal(pct)} percentile of {atStage.length} {league.name} team-seasons at this stage
              </>
            )}
            .
          </p>
          <p className="text-sm text-ink-700 max-w-prose">
            {benchAt('champion') && <>Champions had a median of {benchAt('champion')!.p50} points at this stage ({seasons} seasons)</>}
            {benchAt('relegated') && <>; relegated clubs {benchAt('relegated')!.p50}</>}.{' '}
            <Link
              to={`/football/history/what-happened-next?league=${league.code}&played=${latest.matches_played}&mode=points&pts=${Math.max(0, latest.points - 1)}-${latest.points + 1}`}
              className="underline underline-offset-2"
            >
              Where clubs on {latest.points - 1}&ndash;{latest.points + 1} points finished
            </Link>
          </p>

          <LineChart
            ariaLabel={`${team.team_name} points by matches played against historical benchmarks`}
            xLabel="Matches played"
            yLabel="Points"
            yMin={0}
            bands={chart.bands}
            series={chart.series}
            height={340}
          />
          <ChartLegend
            items={[
              { label: team.team_name, swatchClass: 'bg-pitch-700' },
              { label: 'Champions, middle half', swatchClass: 'bg-amber-400/60' },
              { label: 'Relegated, middle half', swatchClass: 'bg-loss-600/30' },
              { label: 'All clubs, median', swatchClass: 'bg-ink-500', dashed: true },
              ...(champs.length ? [{ label: `Highest-scoring champions: ${champs.map((c) => `${c.team_name} ${seasonName(c.season_label)} (${c.points})`).join(', ')}`, swatchClass: 'bg-cup-600' }] : []),
            ]}
          />

          <details className="text-sm text-ink-700 max-w-prose">
            <summary className="cursor-pointer text-ink-900">How this is calculated</summary>
            <p className="mt-2">
              Benchmarks use every complete {table?.[0]?.clubs}-club {league.name} season, compared by matches played. The shaded bands are the
              middle half (25th to 75th percentile) of champions&rsquo; and relegated clubs&rsquo; points after each match. Points include
              deductions from the date they applied. The percentile compares {team.team_name}&rsquo;s points with every club&rsquo;s after the same
              number of matches; ties count half.
            </p>
          </details>
        </>
      )}
    </article>
  );
}
