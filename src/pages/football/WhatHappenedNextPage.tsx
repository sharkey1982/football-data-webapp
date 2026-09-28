// ============================================================================
// src/pages/football/WhatHappenedNextPage.tsx
//
// "Teams in this position after this many matches -- where did they finish?"
// Answers from every complete season of the same size (clubs x matches), by
// matches played rather than nominal gameweek, with the denominator always
// shown. The query lives in the URL so any answer can be shared.
// ============================================================================

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { seasonPathByCode } from '../../lib/leagueSeasonApi';
import {
  HISTORY_LEAGUES,
  leagueByCode,
  getLatestSeasonTable,
  getWhatHappenedNext,
  summariseOutcomes,
  comparableGroupFor,
  typicalPlayed,
  share,
  parseRange,
  type WhnRow,
  ordinal,
  seasonName,
} from '../../lib/historyApi';

type Mode = 'position' | 'points';

type SortKey = 'season' | 'team' | 'then' | 'points' | 'final' | 'final_points';

export default function WhatHappenedNextPage() {
  const [params, setParams] = useSearchParams();
  const league = leagueByCode(params.get('league'));
  const mode: Mode = params.get('mode') === 'points' ? 'points' : 'position';
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'season', desc: true });

  useDocumentHead({
    title: 'What happened next? Where teams in any position finished',
    description:
      'Pick a league position or points total after any number of matches and see where every team in that spot since the 1990s finished: champions, top four, relegated.',
    path: '/football/history/what-happened-next',
  });

  // A failed table load falls back to the standard size rather than blocking the answer.
  const tableFetch = useKeyedFetch(String(league.id), () => getLatestSeasonTable(league.id));
  const table = tableFetch.failed ? [] : tableFetch.data;

  const clubs = table?.[0]?.clubs ?? 20;
  const group = comparableGroupFor(clubs);
  const maxGames = 2 * (clubs - 1);
  const defaultPlayed = table && table.length ? Math.max(1, Math.min(maxGames - 1, typicalPlayed(table))) : 10;
  const played = Math.max(1, Math.min(maxGames, Number(params.get('played')) || defaultPlayed));
  const posRange = parseRange(params.get('pos')) ?? [1, 1];
  const ptsRange = parseRange(params.get('pts'));

  const query = {
    leagueId: league.id,
    played,
    comparableGroup: group,
    positionMin: mode === 'position' ? posRange[0] : null,
    positionMax: mode === 'position' ? posRange[1] : null,
    pointsMin: mode === 'points' && ptsRange ? ptsRange[0] : null,
    pointsMax: mode === 'points' && ptsRange ? ptsRange[1] : null,
  };
  const { data: rows, failed } = useKeyedFetch(table === null ? null : JSON.stringify(query), () => getWhatHappenedNext(query));

  const summary = useMemo(() => (rows ? summariseOutcomes(rows) : null), [rows]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const criterion =
    mode === 'position'
      ? posRange[0] === posRange[1]
        ? `${ordinal(posRange[0])}`
        : `${ordinal(posRange[0])} to ${ordinal(posRange[1])}`
      : ptsRange
        ? ptsRange[0] === ptsRange[1]
          ? `on ${ptsRange[0]} points`
          : `on ${ptsRange[0]}–${ptsRange[1]} points`
        : 'any points total';

  // Clubs in the latest table that match the question right now.
  const nowMatching = (table ?? []).filter((t) =>
    t.played === played &&
    (mode === 'position' ? t.position >= posRange[0] && t.position <= posRange[1] : !ptsRange || (t.points >= ptsRange[0] && t.points <= ptsRange[1]))
  );

  const sorted = useMemo(() => {
    if (!rows) return [];
    const val = (r: WhnRow): number | string =>
      sort.key === 'season' ? r.start_year : sort.key === 'team' ? r.team_name : sort.key === 'then' ? r.position_at_played : sort.key === 'points' ? r.points : sort.key === 'final' ? r.final_position : r.final_points;
    return [...rows].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sort.desc ? -c : c;
    });
  }, [rows, sort]);

  const header = (key: SortKey, label: string, right = false) => (
    <th scope="col" className={`${right ? 'text-right' : 'text-left'} font-medium text-xs px-3 py-2`} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="hover:text-ink-900" onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'team' }))}>
        {label}
        {sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );

  const maxCount = summary ? Math.max(1, ...summary.distribution.map((d) => d.count)) : 1;
  const seasonsSpan = rows && rows.length ? `${seasonName(rows[rows.length - 1].season_label)}–${seasonName(rows[0].season_label)}` : '';

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/football/history" className="hover:underline">Football &middot; Position Tracking</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">What happened next?</h1>
      </header>

      <form className="grid gap-3 sm:grid-cols-4 items-end" onSubmit={(e) => e.preventDefault()}>
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">League</span>
          <select value={league.code} onChange={(e) => update({ league: e.target.value, played: null })} className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white">
            {HISTORY_LEAGUES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">After matches</span>
          <input type="number" min={1} max={maxGames} value={played} onChange={(e) => update({ played: e.target.value })} className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white" />
        </label>
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">By</span>
          <select value={mode} onChange={(e) => update({ mode: e.target.value === 'points' ? 'points' : null })} className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white">
            <option value="position">Position</option>
            <option value="points">Points</option>
          </select>
        </label>
        {mode === 'position' ? (
          <label className="block">
            <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Position (e.g. 1 or 18-20)</span>
            <input defaultValue={params.get('pos') ?? '1'} key={`pos-${league.code}`} onBlur={(e) => update({ pos: parseRange(e.target.value) ? e.target.value : null })} className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white" />
          </label>
        ) : (
          <label className="block">
            <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Points (e.g. 20-22)</span>
            <input defaultValue={params.get('pts') ?? ''} key={`pts-${league.code}`} onBlur={(e) => update({ pts: parseRange(e.target.value) ? e.target.value : null })} className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white" />
          </label>
        )}
      </form>

      {failed && <p className="text-ink-700">This question could not be answered right now.</p>}
      {!rows && !failed && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {rows && summary && (
        <>
          {summary.teamSeasons === 0 ? (
            <p className="text-ink-700">No team in a complete {league.name} season matched. Try a wider range.</p>
          ) : (
            <>
              <p className="text-ink-900 text-lg max-w-prose" data-testid="whn-answer">
                {league.name} teams {criterion} after {played} matches: {share(summary.champions, summary.teamSeasons)} won the league
                {summary.relegationKnown > 0 && <>, {share(summary.relegated, summary.relegationKnown)} were relegated</>}.
              </p>

              <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  ['Won the league', share(summary.champions, summary.teamSeasons)],
                  ['Top four', share(summary.topFour, summary.teamSeasons)],
                  ['Top six', share(summary.topSix, summary.teamSeasons)],
                  ['Relegated', summary.relegationKnown ? share(summary.relegated, summary.relegationKnown) : '–'],
                  ['Average finish', summary.meanFinal === null ? '–' : `${summary.meanFinal} (median ${summary.medianFinal})`],
                ].map(([k, v]) => (
                  <div key={k} className="border border-chalk-300 rounded-lg p-3 bg-white">
                    <dt className="text-xs text-ink-500">{k}</dt>
                    <dd className="font-mono text-sm text-ink-900 mt-1">{v}</dd>
                  </div>
                ))}
              </dl>

              <section aria-labelledby="dist-heading">
                <h2 id="dist-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Where they finished</h2>
                <div className="mt-2 flex items-end gap-1 h-32" role="img" aria-label="Number of teams finishing in each position">
                  {summary.distribution.map((d) => (
                    <div key={d.position} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div className="w-full bg-pitch-700 rounded-t" style={{ height: `${(d.count / maxCount) * 100}%` }} title={`${ordinal(d.position)}: ${d.count}`} />
                      <span className="text-[0.6rem] text-ink-500 mt-1">{d.position}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-ink-500 mt-1">Final position. {summary.teamSeasons} team-seasons, {seasonsSpan}.</p>
              </section>

              {nowMatching.length > 0 && (
                <p className="text-sm text-ink-700">
                  In the table now:{' '}
                  {nowMatching.map((t, i) => (
                    <span key={t.team_id}>
                      {i > 0 && ', '}
                      {t.team_slug ? <Link to={`/football/history/pace?league=${league.code}&team=${t.team_slug}`} className="underline underline-offset-2">{t.team_name}</Link> : t.team_name} ({ordinal(t.position)}, {t.points} pts)
                    </span>
                  ))}
                  .
                </p>
              )}

              <section>
                <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Every team-season</h2>
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                    <thead className="bg-chalk-200 text-ink-500">
                      <tr>
                        {header('season', 'Season')}
                        {header('team', 'Team')}
                        {header('then', `After ${played}`, true)}
                        {header('points', 'Points then', true)}
                        {header('final', 'Finished', true)}
                        {header('final_points', 'Final points', true)}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r, i) => (
                        <tr key={`${r.season_id}-${r.team_id}`} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                          <td className="px-3 py-1.5 text-xs font-mono">
                            <Link to={seasonPathByCode(league.code, r.start_year) ?? '#'} className="hover:underline">{seasonName(r.season_label)}</Link>
                          </td>
                          <td className="px-3 py-1.5 text-xs">
                            {r.team_slug ? <Link to={`/football/teams/${r.team_slug}`} className="hover:underline">{r.team_name}</Link> : r.team_name}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{ordinal(r.position_at_played)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.points}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                            {ordinal(r.final_position)}
                            {r.champion ? ' ★' : r.relegated ? ' ↓' : ''}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.final_points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          <details className="text-sm text-ink-700 max-w-prose">
            <summary className="cursor-pointer text-ink-900">How this is calculated</summary>
            <p className="mt-2">
              Every complete {clubs}-club, {maxGames}-match {league.name} season on file. Position after {played} matches ranks each club&rsquo;s
              record after its own {played}th match against every other club&rsquo;s record after the same number &mdash; so postponements
              don&rsquo;t distort it. Points include deductions from the date they applied. Ties share a position. Curtailed seasons are left out,
              and relegation counts only seasons where the next season is on file.
            </p>
          </details>
        </>
      )}
    </article>
  );
}
