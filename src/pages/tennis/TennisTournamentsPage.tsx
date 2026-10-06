// ============================================================================
// src/pages/tennis/TennisTournamentsPage.tsx
//
// /tennis/tournaments -- every tournament on a tour, grouped across sponsor
// renames (tennis.events, phase 3): search by name, city or country; filter
// by level, surface and country; sortable. Current events only by default.
// ATP default, ?tour=wta. Server-rendered at build (ATP).
// ============================================================================

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { Country, FilterSelect, LevelBadge, PlayerLink, SlamsToggle, TennisHeader, useSlamsParam } from '../../components/tennis/TennisBits';
import TourToggle from '../../components/tennis/TourToggle';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { TENNIS_TOURNAMENTS_PATH, loadTennisTournaments, tennisEditionPath, tennisEventPath, tennisTournamentsPath, type TennisTournamentsData } from '../../lib/tennisApi';
import { countryCounts, countryName, matchesSearch, tournamentsSentence, withSlams, type EventRow } from '../../lib/tennisEvents';
import { DATA_NOTE, FIRST_YEAR, LEVEL_LABEL, parseTour, type Level } from '../../lib/tennisStats';

const LEVELS: Level[] = ['Grand Slam', 'Finals', '1000', 'Premier', '500', '250'];

export default function TennisTournamentsPage({ initialData }: { initialData?: TennisTournamentsData }) {
  const [params] = useSearchParams();
  const tour = parseTour(params.get('tour')) ?? initialData?.tour ?? 'ATP';
  const { data, failed, loading } = useKeyedFetch(tour, () => loadTennisTournaments(tour), initialData ? { key: initialData.tour, data: initialData } : undefined);
  const [query, setQuery] = useState('');
  // "Grand Slams only" is the Level filter set to Grand Slam, kept in the URL (?slams=1) as on the other tennis pages.
  const [slams, setSlams] = useSlamsParam();
  const [pickedLevel, setPickedLevel] = useState('');
  const level = slams ? 'Grand Slam' : pickedLevel;
  const setLevel = (v: string) => {
    setSlams(v === 'Grand Slam');
    setPickedLevel(v === 'Grand Slam' ? '' : v);
  };
  const [surface, setSurface] = useState('');
  const [country, setCountry] = useState('');
  const [current, setCurrent] = useState(true);
  useDocumentHead({
    title: `${tour} tournaments: champions, records and draws since ${FIRST_YEAR[tour]}`,
    description: data ? tournamentsSentence(data) : `Every ${tour} tournament since ${FIRST_YEAR[tour]}: champions, most titles and draws.`,
    path: TENNIS_TOURNAMENTS_PATH,
  });

  const all = useMemo(() => data?.rows ?? [], [data]);
  const countries = useMemo(() => countryCounts(all), [all]);
  const surfaces = useMemo(() => [...new Set(all.map((r) => r.surface).filter(Boolean))].sort() as string[], [all]);
  const rows = useMemo(
    () =>
      all.filter(
        (r) =>
          (!current || query || r.last_year >= (data?.latestYear ?? 0) - 1) &&
          (!level || r.level === level) &&
          (!surface || r.surface === surface) &&
          (!country || r.country === country) &&
          matchesSearch(r, query)
      ),
    [all, current, query, level, surface, country, data]
  );

  const columns: Column<EventRow>[] = [
    { key: 'name', label: 'Tournament', render: (r) => <Link to={tennisEventPath(r.tour, r.slug)} className="text-pitch-800 underline underline-offset-2">{r.name}</Link>, sortValue: (r) => r.name },
    { key: 'level', label: 'Level', render: (r) => <LevelBadge level={r.level} />, sortValue: (r) => r.level_rank },
    { key: 'where', label: 'Where', render: (r) => <span>{r.city} <span className="text-ink-500"><Country code={r.country} short /></span></span>, sortValue: (r) => `${countryName(r.country)} ${r.city}`, className: 'hidden sm:table-cell' },
    { key: 'surface', label: 'Surface', render: (r) => r.surface ?? '–', sortValue: (r) => r.surface, className: 'hidden md:table-cell' },
    { key: 'years', label: 'Years', render: (r) => (r.first_year === r.last_year ? r.first_year : `${r.first_year}–${r.last_year}`), sortValue: (r) => r.editions, align: 'right', descFirst: true, className: 'hidden md:table-cell' },
    { key: 'top', label: 'Most titles', render: (r) => (r.top ? <><PlayerLink tour={r.tour} slug={r.top.slug} name={r.top.name} /><span className="font-mono text-xs text-ink-500">{` ${r.top.titles}`}</span></> : '–'), sortValue: (r) => r.top?.titles ?? 0, descFirst: true, className: 'hidden lg:table-cell' },
    {
      key: 'latest',
      label: 'Latest champion',
      render: (r) => (r.latest?.winner_slug ? <><PlayerLink tour={r.tour} slug={r.latest.winner_slug} name={r.latest.winner!} /> <Link to={tennisEditionPath(r.tour, r.slug, r.latest.year)} className="font-mono text-xs text-ink-500 hover:underline">{r.latest.year}</Link></> : '–'),
      sortValue: (r) => r.latest?.year ?? 0,
      descFirst: true,
    },
  ];

  return (
    <article className="space-y-5">
      <TennisHeader title="Tournaments" toggle={<TourToggle tour={tour} to={(t) => withSlams(tennisTournamentsPath(t), slams)} />}>
        <p className="text-ink-700 max-w-prose">Every tournament since {FIRST_YEAR[tour]}, kept together through sponsor renames: champions by year, who has won it most, and each year's draw with the finalists' paths.</p>
      </TennisHeader>
      {failed && <p className="text-ink-700">Tournaments are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="tennis-tournaments-story">{tournamentsSentence(data)}</p>
          <div className="flex flex-wrap items-center gap-3">
            <SlamsToggle on={slams} onChange={setSlams} />
            <label className="text-sm">
              <span className="sr-only">Search tournaments</span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tournament, city or country" className="border border-chalk-300 rounded px-2 py-1 w-60 bg-white" data-testid="tennis-tournament-search" />
            </label>
            <FilterSelect label="Level" value={level} onChange={setLevel} testId="tennis-level-filter" options={[{ value: '', label: 'All' }, ...LEVELS.filter((l) => all.some((r) => r.level === l)).map((l) => ({ value: l, label: LEVEL_LABEL[l] }))]} />
            <FilterSelect label="Surface" value={surface} onChange={setSurface} options={[{ value: '', label: 'All' }, ...surfaces.map((s) => ({ value: s, label: s }))]} />
            <FilterSelect label="Country" value={country} onChange={setCountry} testId="tennis-event-country-filter" options={[{ value: '', label: 'All' }, ...countries.map((c) => ({ value: c.code, label: `${c.name} (${c.n})` }))]} />
            <label className="text-sm inline-flex items-center gap-1.5">
              <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} />
              <span>Current calendar only</span>
            </label>
            <span className="text-xs text-ink-500">{`${rows.length} tournament${rows.length === 1 ? '' : 's'}`}</span>
          </div>
          <SortableTable columns={columns} rows={rows} rowKey={(r) => String(r.event_id)} initialSort={{ key: 'level', dir: 'asc' }} caption={`${tour} tournaments`} testId="tennis-tournaments-table" empty="No tournament matches those filters." />
          <p className="text-xs text-ink-500">{`Level and surface are as at the latest edition. "Current calendar" means played this season or last; searching looks through every tournament. ${DATA_NOTE}`}</p>
        </>
      )}
    </article>
  );
}
