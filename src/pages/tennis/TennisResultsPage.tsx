// ============================================================================
// src/pages/tennis/TennisResultsPage.tsx
//
// /tennis/results -- the tennis counterpart of Fixtures & Results (results
// only: the source has no upcoming matches). The shared calendar heat map
// shows matches per day; pick a day for its matches, by tournament and
// round, with each player's ranking and the pre-match favourite, so upsets
// stand out. ?tour=wta for the WTA, ?date=YYYY-MM-DD for a day. Static (ATP,
// latest day).
// ============================================================================

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import FixtureCalendarHeatmap from '../../components/FixtureCalendarHeatmap';
import { LevelBadge, PlayerLink, TennisHeader } from '../../components/tennis/TennisBits';
import TourToggle from '../../components/tennis/TourToggle';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { TENNIS_RESULTS_PATH, loadTennisResults, tennisResultsPath, type TennisResultsData } from '../../lib/tennisApi';
import { countsByDate, DATA_NOTE, groupByTournament, isUpset, odds, parseTour, resultsSentence, scoreLabel, shortDate, type Tour } from '../../lib/tennisStats';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Left-hand calendar month for a date: the month before it, so the date sits in the right-hand month. */
function leftMonthOf(date: string): { year: number; month: number } {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1;
  return m === 0 ? { year: y - 1, month: 11 } : { year: y, month: m - 1 };
}

export default function TennisResultsPage({ initialData }: { initialData?: TennisResultsData }) {
  const [params, setParams] = useSearchParams();
  const tour = parseTour(params.get('tour')) ?? initialData?.tour ?? 'ATP';
  const dateParam = ISO.test(params.get('date') ?? '') ? params.get('date')! : null;
  const [view, setView] = useState<{ tour: Tour; year: number; month: number } | null>(null);
  const anchor = view && view.tour === tour ? view : dateParam ? { tour, ...leftMonthOf(dateParam) } : null;
  const key = `${tour}/${anchor ? `${anchor.year}-${anchor.month}` : 'latest'}`;
  const initialKey = initialData ? `${initialData.tour}/latest` : '';
  const { data, failed, loading } = useKeyedFetch(
    key,
    () => loadTennisResults(tour, anchor?.year ?? null, anchor?.month ?? null),
    initialData ? { key: initialKey, data: initialData } : undefined
  );

  const selected = dateParam ?? data?.latestDate ?? null;
  const counts = useMemo(() => countsByDate(data?.matches ?? []), [data]);
  const groups = useMemo(() => groupByTournament((data?.matches ?? []).filter((m) => m.match_date === selected)), [data, selected]);
  const n = groups.reduce((a, g) => a + g.matches.length, 0);
  const shown = data ? leftMonthOf(data.to) : { year: 2026, month: 0 };

  useDocumentHead({
    title: `${tour} tennis results by day`,
    description: data && selected ? resultsSentence(tour, selected, n, groups.length) : `Every ${tour} tour-level result, day by day, with rankings and the pre-match favourite.`,
    path: TENNIS_RESULTS_PATH,
  });

  function pickDate(d: string) {
    const next = new URLSearchParams(params);
    if (tour !== 'ATP') next.set('tour', tour.toLowerCase());
    next.set('date', d);
    setParams(next);
  }

  return (
    <article className="space-y-5">
      <TennisHeader title="Results" toggle={<TourToggle tour={tour} to={(t) => tennisResultsPath(t)} />} />
      {failed && <p className="text-ink-700">Results are unavailable right now.</p>}
      {loading && !data && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && (
        <>
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <FixtureCalendarHeatmap
              dateCounts={counts}
              loading={loading}
              selectedDates={new Set(selected ? [selected] : [])}
              onToggleDate={pickDate}
              viewYear={shown.year}
              viewMonth={shown.month}
              onChangeMonth={(year, month) => setView({ tour, year, month })}
            />
            <p className="flex-1 min-w-0 text-ink-500 text-sm pt-1">
              {`Darker days have more matches. Latest results: ${shortDate(data.latestDate)}.`}
            </p>
          </div>

          {selected && (
            <section aria-labelledby="tr-day" className="space-y-4" data-testid="tennis-results-day">
              <h2 id="tr-day" className="font-display uppercase tracking-wide text-lg text-ink-900">{shortDate(selected)}</h2>
              {groups.length === 0 && <p className="text-ink-700 text-sm">No matches on this day.</p>}
              {groups.map((g) => (
                <div key={g.tournament} className="space-y-1">
                  <h3 className="text-sm font-medium text-ink-900">
                    {g.tournament} <LevelBadge level={g.level} />
                    <span className="text-xs text-ink-500 font-normal">{` ${[g.location, g.surface].filter(Boolean).join(' · ')}`}</span>
                  </h3>
                  <ul className="divide-y divide-chalk-300 border border-chalk-300 rounded-lg bg-white text-sm">
                    {g.matches.map((m) => {
                      const o = odds(m);
                      const upset = isUpset(m);
                      return (
                        <li key={m.source_key} className="px-3 py-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                          <span className="w-24 shrink-0 text-xs text-ink-500">{m.round}</span>
                          <span className="min-w-0 flex-1">
                            <span className="font-medium"><PlayerLink tour={tour} slug={m.winner_slug} name={m.winner} rank={m.w_rank} /></span>
                            <span className="text-ink-500">{' bt '}</span>
                            <PlayerLink tour={tour} slug={m.loser_slug} name={m.loser} rank={m.l_rank} />
                          </span>
                          <span className="font-mono text-xs tabular-nums">{scoreLabel(m)}</span>
                          {o && (
                            <span className={`font-mono text-xs ${upset ? 'text-loss-700 font-semibold' : 'text-ink-500'}`} title="Pre-match odds, winner / loser">
                              {upset ? `Upset ${o.w.toFixed(2)}` : `${o.w.toFixed(2)} / ${o.l.toFixed(2)}`}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          )}
          <p className="text-xs text-ink-500">{`Rankings in brackets. Odds: pre-match average market price, winner / loser; "Upset" when the winner was the outsider. ${DATA_NOTE}`}</p>
        </>
      )}
    </article>
  );
}
