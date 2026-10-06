// ============================================================================
// src/pages/tennis/TennisResultsPage.tsx
//
// /tennis/results -- Fixtures & Results, named as Football's and the NFL's
// (Chris, 6 Oct 2026). The shared calendar heat map shows matches per day;
// pick a day for its matches, by tournament and round, with each player's
// ranking and the pre-match favourite, so upsets stand out. The source has no
// match fixtures, so the fixtures side is "Next on the calendar": the coming
// tournaments on their usual dates (tennis_calendar). ?tour=wta for the WTA,
// ?date=YYYY-MM-DD for a day, ?slams=1 for Grand Slams only. Static (ATP,
// latest day).
// ============================================================================

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import FixtureCalendarHeatmap from '../../components/FixtureCalendarHeatmap';
import { LevelBadge, PlayerLink, SlamsToggle, TennisHeader, useSlamsParam } from '../../components/tennis/TennisBits';
import TourToggle from '../../components/tennis/TourToggle';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { TENNIS_RESULTS_PATH, loadTennisResults, tennisEditionPath, tennisEventPath, tennisResultsPath, tennisSlamsPath, type TennisResultsData } from '../../lib/tennisApi';
import { comingTournaments, SLAM_SHORT, withSlams } from '../../lib/tennisEvents';
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

  const [slams, setSlams] = useSlamsParam();
  const pool = useMemo(() => (data?.matches ?? []).filter((m) => !slams || m.level === 'Grand Slam'), [data, slams]);
  // With Grand Slams only, open on the latest Slam day in view rather than an empty day.
  const latestShown = slams ? pool.reduce<string | null>((a, m) => (a == null || m.match_date > a ? m.match_date : a), null) : data?.latestDate ?? null;
  const selected = dateParam ?? latestShown;
  const counts = useMemo(() => countsByDate(pool), [pool]);
  const groups = useMemo(() => groupByTournament(pool.filter((m) => m.match_date === selected)), [pool, selected]);
  const coming = useMemo(() => (data?.calendar ? comingTournaments(data.calendar, tour, data.latestDate, slams) : []), [data, tour, slams]);
  const lastSlams = useMemo(
    () => (data?.calendar ?? []).filter((c) => c.tour === tour && c.level === 'Grand Slam').sort((a, b) => a.usual_start.localeCompare(b.usual_start)),
    [data, tour]
  );
  const n = groups.reduce((a, g) => a + g.matches.length, 0);
  const shown = data ? leftMonthOf(data.to) : { year: 2026, month: 0 };

  useDocumentHead({
    title: `${tour} tennis fixtures and results by day`,
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
      <TennisHeader title="Fixtures & Results" toggle={<TourToggle tour={tour} to={(t) => withSlams(tennisResultsPath(t), slams)} />}>
        <div className="flex flex-wrap items-center gap-3">
          <SlamsToggle on={slams} onChange={setSlams} />
          {slams && (
            <p className="text-sm text-ink-700" data-testid="tennis-results-slam-links">
              {'Latest finals: '}
              {lastSlams.map((c, i) => (
                <span key={c.slug}>
                  {i > 0 && ' · '}
                  <Link to={tennisEditionPath(tour, c.slug, c.last_year)} className="text-pitch-800 underline underline-offset-2">{`${SLAM_SHORT[c.name] ?? c.name} ${c.last_year}`}</Link>
                </span>
              ))}
              {' · '}
              <Link to={tennisSlamsPath(tour)} className="text-pitch-800 underline underline-offset-2">All Grand Slams</Link>
            </p>
          )}
        </div>
      </TennisHeader>
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
              {`Darker days have more ${slams ? 'Grand Slam ' : ''}matches. Latest results: ${shortDate(data.latestDate)}.`}
              {slams && pool.length === 0 && ' No Grand Slam was played in these two months: use the calendar arrows or the links above.'}
            </p>
          </div>

          {coming.length > 0 && (
            <section aria-labelledby="tr-next" className="space-y-2" data-testid="tennis-results-coming">
              <h2 id="tr-next" className="font-display uppercase tracking-wide text-lg text-ink-900">Next on the calendar</h2>
              <ul className="divide-y divide-chalk-300 border border-chalk-300 rounded-lg bg-white text-sm">
                {coming.map((c) => (
                  <li key={c.event_id} className="px-3 py-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="w-28 shrink-0 text-xs text-ink-500">{`${shortDate(c.usual_start)} – ${shortDate(c.usual_end)}`}</span>
                    <span className="min-w-0 flex-1">
                      <Link to={tennisEventPath(tour, c.slug)} className="font-medium hover:underline">{c.name}</Link> <LevelBadge level={c.level} />
                      <span className="text-xs text-ink-500">{` ${[c.city, c.surface].filter(Boolean).join(' · ')}`}</span>
                    </span>
                    {c.last_winner_slug && (
                      <span className="text-xs text-ink-500">
                        {`${c.last_year} champion `}
                        <PlayerLink tour={tour} slug={c.last_winner_slug} name={c.last_winner!} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-ink-500">Usual dates, a year on from the last edition: the data has results only, so there is no order of play. The TV Guide has the channels.</p>
            </section>
          )}

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
