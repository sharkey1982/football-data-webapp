// ============================================================================
// src/pages/tennis/TennisSlamsPage.tsx
//
// /tennis/grand-slams -- the four majors together (Chris, 6 Oct 2026): the
// Slam on now or next (usual dates and UK channel), champions by year with
// each final linked to its draw, and the players with most Slam titles,
// split by Slam. ATP default, ?tour=wta. Server-rendered at build (ATP).
// Each Slam's own page stays at /tennis/tournaments/:tour/:slug.
// ============================================================================

import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { PlayerLink, Section, TennisHeader } from '../../components/tennis/TennisBits';
import TourToggle from '../../components/tennis/TourToggle';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import {
  TENNIS_SLAMS_PATH,
  TENNIS_TV_GUIDE_PATH,
  loadTennisSlams,
  tennisEditionPath,
  tennisEventPath,
  tennisResultsPath,
  tennisSlamsPath,
  type TennisSlamsData,
} from '../../lib/tennisApi';
import { SLAMS, SLAM_SHORT, slamLeaders, slamNow, slamsSentence, slamTable, withSlams, type Slam, type SlamLeader, type SlamYear } from '../../lib/tennisEvents';
import { DATA_NOTE, FIRST_YEAR, parseTour, shortDate } from '../../lib/tennisStats';

/** The Slam's usual surface, for the column headings. */
const SURFACE: Record<Slam, string> = { 'Australian Open': 'Hard', 'French Open': 'Clay', Wimbledon: 'Grass', 'US Open': 'Hard' };
const SURFACE_CLASS: Record<string, string> = { Hard: 'border-t-[#2a6fdb]', Clay: 'border-t-[#d9622b]', Grass: 'border-t-[#1f9d55]' };

export default function TennisSlamsPage({ initialData, today }: { initialData?: TennisSlamsData; today?: string }) {
  const [params] = useSearchParams();
  const tour = parseTour(params.get('tour')) ?? initialData?.tour ?? 'ATP';
  const day = today ?? new Date().toISOString().slice(0, 10);
  const { data, failed, loading } = useKeyedFetch(tour, () => loadTennisSlams(tour), initialData ? { key: initialData.tour, data: initialData } : undefined);
  const table = useMemo(() => slamTable(data?.editions ?? []), [data]);
  const leaders = useMemo(() => slamLeaders(data?.editions ?? []), [data]);
  const now = useMemo(() => (data ? slamNow(data.calendar, data.editions, tour, day) : null), [data, tour, day]);
  const story = data ? slamsSentence(tour, table, leaders) : null;
  useDocumentHead({
    title: `${tour} Grand Slams: every champion since ${FIRST_YEAR[tour]}`,
    description: story ?? `Every ${tour} Grand Slam since ${FIRST_YEAR[tour]}: the Australian Open, French Open, Wimbledon and US Open champions by year, and most titles.`,
    path: TENNIS_SLAMS_PATH,
  });

  const yearColumns: Column<SlamYear>[] = [
    { key: 'year', label: 'Year', render: (r) => <span className="font-mono">{r.year}</span>, sortValue: (r) => r.year, descFirst: true },
    ...SLAMS.map<Column<SlamYear>>((s) => ({
      key: s,
      label: SLAM_SHORT[s],
      render: (r) => <SlamCell e={r.cells[s]} tour={tour} />,
      sortValue: (r) => r.cells[s]?.winner ?? null,
    })),
  ];
  const leaderColumns: Column<SlamLeader>[] = [
    { key: 'name', label: 'Player', render: (l) => <PlayerLink tour={tour} slug={l.slug} name={l.name} />, sortValue: (l) => l.name },
    { key: 'titles', label: 'Titles', render: (l) => <span className="font-semibold">{l.titles}</span>, sortValue: (l) => l.titles, align: 'right', descFirst: true },
    ...SLAMS.map<Column<SlamLeader>>((s) => ({
      key: s,
      label: SLAM_SHORT[s],
      render: (l) => (l.bySlam[s] ? l.bySlam[s] : <span className="text-ink-500">–</span>),
      sortValue: (l) => l.bySlam[s],
      align: 'right',
      descFirst: true,
      className: 'hidden sm:table-cell',
    })),
    { key: 'finals', label: 'Finals', render: (l) => l.finals, sortValue: (l) => l.finals, align: 'right', descFirst: true },
    { key: 'span', label: 'First – last title', render: (l) => (l.titles ? (l.first === l.last ? l.first : `${l.first}–${l.last}`) : '–'), sortValue: (l) => (l.titles ? l.last : null), descFirst: true, className: 'hidden md:table-cell' },
  ];

  return (
    <article className="space-y-6">
      <TennisHeader title="Grand Slams" toggle={<TourToggle tour={tour} to={(t) => tennisSlamsPath(t)} />}>
        <p className="text-ink-700 max-w-prose">
          The Australian Open, French Open, Wimbledon and US Open together: who won each one, year by year, and who has won the most. Each Slam has its own
          page with every draw.
        </p>
        <nav aria-label="The four Slams" className="flex flex-wrap gap-2 text-sm">
          {SLAMS.map((s) => (
            <Link key={s} to={tennisEventPath(tour, s.toLowerCase().replace(/\s+/g, '-'))} className={`border border-chalk-300 border-t-4 ${SURFACE_CLASS[SURFACE[s]]} rounded bg-white px-3 py-1 hover:bg-chalk-200`}>
              {s} <span className="text-xs text-ink-500">{SURFACE[s]}</span>
            </Link>
          ))}
        </nav>
      </TennisHeader>
      {failed && <p className="text-ink-700">The Grand Slams are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && (
        <>
          {story && <p className="text-ink-900 max-w-prose" data-testid="tennis-slams-story">{story}</p>}
          {now && (
            <section aria-labelledby="ts-now" className="rounded-lg border border-amber-600 bg-amber-50 p-4 space-y-1" data-testid="tennis-slam-now">
              <h2 id="ts-now" className="font-display uppercase tracking-wide text-lg text-ink-900">
                {now.state === 'on' ? `On now: ${now.slam}` : `Next: ${now.slam}`}
              </h2>
              <p className="text-sm text-ink-900">
                {now.state === 'on' ? `Started ${shortDate(now.start)}.` : `Usually ${shortDate(now.start)} – ${shortDate(now.end)}.`}
                {now.channel && ` UK TV: ${now.channel}${now.free_to_air ? `; free to air: ${now.free_to_air}` : ''}.`}
                {now.last_winner_slug && (
                  <>
                    {' Holder: '}
                    <PlayerLink tour={tour} slug={now.last_winner_slug} name={now.last_winner!} />.
                  </>
                )}
              </p>
              <p className="text-sm flex flex-wrap gap-x-4">
                {now.edition ? (
                  <Link to={tennisEditionPath(tour, now.slug, now.edition.year)} className="text-pitch-800 underline underline-offset-2">Results and draw so far</Link>
                ) : (
                  <Link to={tennisEventPath(tour, now.slug)} className="text-pitch-800 underline underline-offset-2">{`Every ${now.slam} champion`}</Link>
                )}
                <Link to={TENNIS_TV_GUIDE_PATH} className="text-pitch-800 underline underline-offset-2">TV Guide</Link>
                <Link to={withSlams(tennisResultsPath(tour), true)} className="text-pitch-800 underline underline-offset-2">Grand Slam results by day</Link>
              </p>
            </section>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-6">
            <Section title="Champions by year" id="ts-years">
              <SortableTable columns={yearColumns} rows={table} rowKey={(r) => String(r.year)} initialSort={{ key: 'year', dir: 'desc' }} caption={`${tour} Grand Slam champions by year`} testId="tennis-slams-years" />
            </Section>
            <Section title="Most Grand Slam titles" id="ts-most">
              <SortableTable
                columns={leaderColumns}
                rows={leaders}
                rowKey={(l) => l.slug}
                initialSort={{ key: 'titles', dir: 'desc' }}
                limit={20}
                caption={`${tour} players by Grand Slam titles`}
                testId="tennis-slams-leaders"
              />
            </Section>
          </div>
          <p className="text-xs text-ink-500">{`Each champion links to that year's draw; hover for the runner-up. Wimbledon 2020 was cancelled. Titles count from ${FIRST_YEAR[tour]}, when this data starts, so earlier careers are part-counted. ${DATA_NOTE}`}</p>
        </>
      )}
    </article>
  );
}

function SlamCell({ e, tour }: { e: SlamYear['cells'][Slam]; tour: 'ATP' | 'WTA' }) {
  if (!e) return <span className="text-ink-500">–</span>;
  const label = e.winner ?? (e.matches ? 'in progress' : '–');
  return (
    <Link
      to={tennisEditionPath(tour, e.event_slug, e.year)}
      title={e.runner_up ? `${e.winner} beat ${e.runner_up}` : undefined}
      className={`hover:underline ${e.winner ? 'text-ink-900' : 'text-ink-500'}`}
    >
      {label}
    </Link>
  );
}
