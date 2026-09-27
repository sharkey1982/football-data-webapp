// ============================================================================
// src/pages/football/LeagueSeasonPage.tsx
//
// Canonical page for one league-season: /football/leagues/:league/:season.
// The season's story in prose, the final (or live) table with outcomes, and
// its fingerprint against the league's other complete seasons. Server-rendered
// at build with initialData so crawlers read the numbers without JavaScript.
// ============================================================================

import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import {
  isEnglish,
  leaguePath,
  leagueSeasonPath,
  loadLeagueSeason,
  parseSeasonSegment,
  seasonDisplay,
  seasonFingerprint,
  seasonRanks,
  seasonSegment,
  seasonStory,
  type LeagueSeasonData,
  type SeasonTableRow,
} from '../../lib/leagueSeasonApi';
import { clubSeasonPath } from '../../lib/clubSeasonApi';
import NotFoundPage from '../NotFoundPage';

type SortKey = 'position' | 'team' | 'won' | 'goals_for' | 'goals_against' | 'goal_difference' | 'points';

function outcomeLabel(r: SeasonTableRow, english: boolean): string | null {
  if (r.champion) return 'Champions';
  if (r.promoted) return 'Promoted';
  if (r.relegated) return english ? 'Relegated' : 'Out next season';
  return null;
}

export default function LeagueSeasonPage({ initialData }: { initialData?: LeagueSeasonData }) {
  const { league: leagueSlug = '', season: seasonSeg } = useParams();
  const startYear = parseSeasonSegment(seasonSeg);
  const key = startYear === null ? null : `${leagueSlug}:${startYear}`;
  const initialKey = initialData ? `${initialData.league.slug}:${initialData.season.start_year}` : null;
  const { data, failed, loading } = useKeyedFetch(
    key,
    () => loadLeagueSeason(leagueSlug, startYear as number),
    initialData && initialKey ? { key: initialKey, data: initialData } : undefined
  );
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'position', desc: false });

  const when = data ? seasonDisplay(data.league.code, data.season.start_year) : '';
  const path = data ? leagueSeasonPath(data.league, data.season.start_year) : `/football/leagues/${leagueSlug}/${seasonSeg ?? ''}`;
  useDocumentHead({
    title: data ? `${data.eraName} ${when}: ${data.summary.is_final ? 'final table' : 'table'} and statistics` : 'League season',
    description: data ? seasonStory(data) : 'Final table, story and statistics for a league season.',
    path,
  });

  if (startYear === null || (!loading && !failed && data === null)) return <NotFoundPage />;
  // One URL per season: "2024-25" for a calendar-year league becomes "2024".
  if (data && seasonSeg !== seasonSegment(data.league.code, data.season.start_year)) {
    return <Navigate to={leagueSeasonPath(data.league, data.season.start_year)} replace />;
  }

  const english = data ? isEnglish(data.league) : false;
  const idx = data ? data.seasons.findIndex((s) => s.season_id === data.season.season_id) : -1;
  const prev = data && idx > 0 ? data.seasons[idx - 1] : null;
  const next = data && idx >= 0 && idx < data.seasons.length - 1 ? data.seasons[idx + 1] : null;
  const split = data?.rows.some((r) => r.split_group != null) ?? false;
  const showDeduction = data?.rows.some((r) => r.deduction > 0) ?? false;

  const sorted = data
    ? [...data.rows].sort((a, b) => {
        const v = sort.key === 'team' ? a.team_name.localeCompare(b.team_name) : (a[sort.key] as number) - (b[sort.key] as number);
        return (sort.desc ? -v : v) || a.position - b.position;
      })
    : [];
  const header = (k: SortKey, label: string, align = 'text-right') => (
    <th scope="col" className={`${align} font-medium text-xs px-2 py-2`} aria-sort={sort.key === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="hover:underline" onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : k !== 'position' && k !== 'team' && k !== 'goals_against' }))}>
        {label}
      </button>
    </th>
  );

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/football/leagues" className="hover:underline">Football &middot; Leagues</Link>
          {data && (
            <>
              {' '}&middot;{' '}
              <Link to={leaguePath(data.league)} className="hover:underline">{data.league.name}</Link>
            </>
          )}
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">{data ? `${data.eraName} ${when}` : 'League season'}</h1>
        {data && data.eraName !== data.league.name && <p className="text-sm text-ink-500 mt-1">{`Now the ${data.league.name}.`}</p>}
      </header>

      {failed && <p className="text-ink-700">This season is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="season-story">{seasonStory(data)}</p>

          <nav aria-label="Other seasons" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {prev && (
              <Link to={leagueSeasonPath(data.league, prev.start_year)} className="text-pitch-800 underline underline-offset-2">
                &larr; {seasonDisplay(data.league.code, prev.start_year)}
              </Link>
            )}
            <Link to={leaguePath(data.league)} className="text-pitch-800 underline underline-offset-2">
              {`All ${data.league.name} seasons`}
            </Link>
            <Link to={`/football/records/${data.league.slug}`} className="text-pitch-800 underline underline-offset-2">
              {`${data.league.name} records`}
            </Link>
            {next && (
              <Link to={leagueSeasonPath(data.league, next.start_year)} className="text-pitch-800 underline underline-offset-2">
                {seasonDisplay(data.league.code, next.start_year)} &rarr;
              </Link>
            )}
          </nav>

          <section aria-labelledby="table-heading">
            <h2 id="table-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">
              {data.summary.is_final ? 'Final table' : 'Table'}
            </h2>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    {header('position', '#')}
                    {header('team', 'Club', 'text-left')}
                    <th scope="col" className="text-right font-medium text-xs px-2 py-2">P</th>
                    {header('won', 'W', `hidden sm:table-cell text-right`)}
                    <th scope="col" className="hidden sm:table-cell text-right font-medium text-xs px-2 py-2">D</th>
                    <th scope="col" className="hidden sm:table-cell text-right font-medium text-xs px-2 py-2">L</th>
                    {header('goals_for', 'GF', `hidden sm:table-cell text-right`)}
                    {header('goals_against', 'GA', `hidden sm:table-cell text-right`)}
                    {header('goal_difference', 'GD')}
                    {header('points', 'Pts')}
                    <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => {
                    const outcome = outcomeLabel(r, english);
                    return (
                      <tr key={r.team_id} className={r.champion ? 'bg-amber-100/60' : r.relegated ? 'bg-loss-600/10' : i % 2 ? 'bg-chalk-100/60' : undefined}>
                        <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{r.position}</td>
                        <th scope="row" className="text-left px-2 py-1.5 font-normal">
                          {r.team_slug ? (
                            <Link to={english ? clubSeasonPath(r.team_slug, data.league.code, data.season.start_year) : `/football/teams/${r.team_slug}`} className="hover:underline">{r.team_name}</Link>
                          ) : (
                            r.team_name
                          )}
                          {split && r.split_group != null && <span className="text-xs text-ink-500">{` (group ${r.split_group})`}</span>}
                          {outcome && <span className="sm:hidden text-xs text-ink-500">{` · ${outcome}`}</span>}
                        </th>
                        <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{r.played}</td>
                        <td className="hidden sm:table-cell px-2 py-1.5 text-right font-mono text-xs tabular-nums">{r.won}</td>
                        <td className="hidden sm:table-cell px-2 py-1.5 text-right font-mono text-xs tabular-nums">{r.drawn}</td>
                        <td className="hidden sm:table-cell px-2 py-1.5 text-right font-mono text-xs tabular-nums">{r.lost}</td>
                        <td className="hidden sm:table-cell px-2 py-1.5 text-right font-mono text-xs tabular-nums">{r.goals_for}</td>
                        <td className="hidden sm:table-cell px-2 py-1.5 text-right font-mono text-xs tabular-nums">{r.goals_against}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{r.goal_difference > 0 ? `+${r.goal_difference}` : r.goal_difference}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums font-semibold">
                          {r.points}
                          {r.deduction > 0 && <span className="text-loss-600">{`*`}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-ink-700 hidden sm:table-cell">{outcome ?? ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {showDeduction && (
              <p className="text-xs text-ink-500 mt-2">
                {`* Points deducted: ${data.rows
                  .filter((r) => r.deduction > 0)
                  .map((r) => `${r.team_name} ${r.deduction}`)
                  .join(', ')}.`}
              </p>
            )}
            {split && <p className="text-xs text-ink-500 mt-2">After the regular season the league split into groups; the official table ranks within them.</p>}
            <p className="text-sm mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              <Link to={`/table?league=${data.league.league_id}&season=${data.season.season_id}&view=timelapse`} className="text-pitch-800 underline underline-offset-2">
                Watch the season unfold
              </Link>
              {english && (
                <Link to={`/football/history/what-happened-next?league=${data.league.code}`} className="text-pitch-800 underline underline-offset-2">
                  Where teams in each position finished
                </Link>
              )}
            </p>
          </section>

          {seasonRanks(data).length > 0 && (
            <section aria-labelledby="ranks-heading">
              <h2 id="ranks-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Where this season ranks</h2>
              <ul className="mt-2 space-y-1 text-sm text-ink-900 list-disc pl-5 max-w-prose">
                {seasonRanks(data).map((t) => <li key={t}>{t}</li>)}
              </ul>
            </section>
          )}

          <section aria-labelledby="fingerprint-heading">
            <h2 id="fingerprint-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Season in numbers</h2>
            <div className="overflow-x-auto mt-2">
              <table className="text-sm border border-chalk-300 rounded-lg overflow-hidden">
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    <th scope="col" className="text-left font-medium text-xs px-3 py-2">Measure</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">{when}</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">League average</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonFingerprint(data.summary, data.seasons).map((f, i) => (
                    <tr key={f.label} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                      <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                        {f.label}
                        {f.note && <span className="block text-ink-500">{f.note}</span>}
                      </th>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{f.value}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">{f.average ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-500 mt-2 max-w-prose">
              {`League average: every complete ${data.league.name} season on file${data.summary.is_final ? ' except this one' : ''}; points thresholds only from seasons with ${data.summary.clubs} clubs.${
                data.summary.covid_affected ? ' Played wholly or partly behind closed doors.' : ''
              }`}
            </p>
          </section>
        </>
      )}
    </article>
  );
}
