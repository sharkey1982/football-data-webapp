// ============================================================================
// src/pages/tennis/TennisPlayersPage.tsx
//
// /tennis/players -- "Your Player", the tennis counterpart of Football's Your
// Team: every player on a tour, searchable, sortable by any column. ATP by
// default; ?tour=wta for the WTA. ?country=GB filters by the nation played
// for (Wikidata, phase 3). ?status=inactive|all for playing status (default
// active: a match in the 12 months before the latest in the data). Searching
// by name looks through everyone. Server-rendered at build (ATP).
// ============================================================================

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { Country, FilterSelect, PlayerLink, SlamsToggle, TennisHeader, useSlamsParam } from '../../components/tennis/TennisBits';
import { countryCounts, countryName, slamLeaders, withSlams } from '../../lib/tennisEvents';
import TourToggle from '../../components/tennis/TourToggle';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { TENNIS_PLAYERS_PATH, loadTennisPlayers, loadTennisSlamEditions, tennisPlayersPath, tennisSlamsPath, type TennisPlayersData } from '../../lib/tennisApi';
import { activeSince, DATA_NOTE, FIRST_YEAR, isActive, parseStatus, parseTour, type PlayerStatus, pct, pctLabel, recordLabel, shortDate, type TennisPlayer } from '../../lib/tennisStats';

const PAGE = 100;
const STATUS_OPTIONS: { value: PlayerStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
];
const STATUS_WORD: Record<PlayerStatus, string> = { active: 'active ', inactive: 'inactive ', all: '' };

export default function TennisPlayersPage({ initialData }: { initialData?: TennisPlayersData }) {
  const [params, setParams] = useSearchParams();
  const country = (params.get('country') ?? '').toUpperCase();
  const status = parseStatus(params.get('status'));
  const tour = parseTour(params.get('tour')) ?? initialData?.tour ?? 'ATP';
  const { data, failed, loading } = useKeyedFetch(tour, () => loadTennisPlayers(tour), initialData ? { key: initialData.tour, data: initialData } : undefined);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  // Grand Slams only (?slams=1): Slam champions, with a Slam titles column. The Slam finals load only when asked for.
  const [slams, setSlams] = useSlamsParam();
  const slamData = useKeyedFetch(slams ? tour : null, () => loadTennisSlamEditions(tour));
  const slamTitles = useMemo(() => new Map(slamLeaders(slamData.data ?? []).filter((l) => l.titles > 0).map((l) => [l.slug, l.titles])), [slamData.data]);
  useDocumentHead({
    title: `${tour} players: records, titles and seasons since ${FIRST_YEAR[tour]}`,
    description: `Every ${tour} player at tour level since ${FIRST_YEAR[tour]}: win-loss record, titles, finals and the years they played. Pick one for their full record.`,
    path: TENNIS_PLAYERS_PATH,
  });

  const since = useMemo(() => activeSince(data?.players ?? []), [data]);
  // Status first, so the country counts match what the list will show.
  const byStatus = useMemo(
    () => (data?.players ?? []).filter((p) => status === 'all' || isActive(p, since) === (status === 'active')),
    [data, status, since]
  );
  const countries = useMemo(() => countryCounts(byStatus), [byStatus]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    // A name search looks through every player, whatever the status filter.
    let list = q ? data?.players ?? [] : byStatus;
    if (country) list = list.filter((p) => p.country === country);
    if (slams) list = list.filter((p) => slamTitles.has(p.slug));
    return q ? list.filter((p) => p.name.toLowerCase().includes(q) || (p.full_name ?? '').toLowerCase().includes(q)) : list;
  }, [data, byStatus, query, country, slams, slamTitles]);
  const setStatus = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === 'active') next.delete('status');
    else next.set('status', v);
    setParams(next, { replace: true });
  };
  const setCountry = (c: string) => {
    const next = new URLSearchParams(params);
    if (c) next.set('country', c);
    else next.delete('country');
    setParams(next, { replace: true });
  };

  const columns: Column<TennisPlayer>[] = [
    { key: 'name', label: 'Player', render: (p) => <PlayerLink tour={p.tour} slug={p.slug} name={p.name} />, sortValue: (p) => p.name },
    { key: 'status', label: 'Status', render: (p) => (isActive(p, since) ? <span className="text-pitch-800">Active</span> : <span className="text-ink-500">Inactive</span>), sortValue: (p) => (isActive(p, since) ? 1 : 0), descFirst: true, className: 'hidden lg:table-cell' },
    { key: 'country', label: 'Country', render: (p) => <Country code={p.country} short />, sortValue: (p) => (p.country ? countryName(p.country) : null), className: 'hidden sm:table-cell' },
    { key: 'recent', label: 'Last 3 seasons', render: (p) => p.recent_matches, sortValue: (p) => p.recent_matches, align: 'right', descFirst: true, className: 'hidden sm:table-cell' },
    { key: 'record', label: 'W–L', render: (p) => recordLabel(p.won, p.lost), sortValue: (p) => p.won + p.lost, align: 'right', descFirst: true },
    { key: 'pct', label: 'Win %', render: (p) => pctLabel(pct(p.won, p.lost)), sortValue: (p) => (p.won + p.lost >= 20 ? pct(p.won, p.lost) : null), align: 'right', descFirst: true },
    { key: 'titles', label: 'Titles', render: (p) => p.titles, sortValue: (p) => p.titles, align: 'right', descFirst: true },
    ...(slams ? [{ key: 'slams', label: 'Slams', render: (p: TennisPlayer) => slamTitles.get(p.slug) ?? 0, sortValue: (p: TennisPlayer) => slamTitles.get(p.slug) ?? 0, align: 'right' as const, descFirst: true }] : []),
    { key: 'finals', label: 'Finals', render: (p) => p.finals, sortValue: (p) => p.finals, align: 'right', descFirst: true, className: 'hidden sm:table-cell' },
    { key: 'years', label: 'Years', render: (p) => (p.first_year === p.last_year ? p.first_year : `${p.first_year}–${p.last_year}`), sortValue: (p) => p.first_year, align: 'right', className: 'hidden md:table-cell' },
    { key: 'last', label: 'Last match', render: (p) => shortDate(p.last_match), sortValue: (p) => p.last_match, align: 'right', descFirst: true, className: 'hidden md:table-cell' },
  ];

  return (
    <article className="space-y-5">
      <TennisHeader title="Your Player" toggle={<TourToggle tour={tour} to={(t) => withSlams(tennisPlayersPath(t), slams)} />}>
        <p className="text-ink-700 max-w-prose">Pick a player for their record by season, surface and tournament level, their titles, best wins and latest matches.</p>
      </TennisHeader>
      {failed && <p className="text-ink-700">Players are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SlamsToggle on={slams} onChange={setSlams} />
            <label className="text-sm">
              <span className="sr-only">Find a player</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a player"
                className="border border-chalk-300 rounded px-2 py-1 w-56 bg-white"
                data-testid="tennis-player-search"
              />
            </label>
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              testId="tennis-status-filter"
              options={STATUS_OPTIONS}
            />
            <FilterSelect
              label="Country"
              value={country}
              onChange={setCountry}
              testId="tennis-country-filter"
              options={[{ value: '', label: 'All countries' }, ...countries.map((c) => ({ value: c.code, label: `${c.name} (${c.n})` }))]}
            />
            <span className="text-xs text-ink-500">
              {slams && slamData.loading ? 'Loading the Slam champions…' : `${rows.length.toLocaleString('en-GB')} ${query ? '' : STATUS_WORD[status]}${slams ? 'Grand Slam champions' : 'players'}${country ? ` from ${countryName(country)}` : ''}`}
            </span>
            {slams && <Link to={tennisSlamsPath(tour)} className="text-sm text-pitch-800 underline underline-offset-2">Grand Slam champions by year</Link>}
          </div>
          <SortableTable
            key={slams ? 'slams' : 'all'}
            columns={columns}
            rows={rows}
            rowKey={(p) => String(p.player_id)}
            initialSort={slams ? { key: 'slams', dir: 'desc' } : { key: 'recent', dir: 'desc' }}
            limit={all || query || country || slams ? undefined : PAGE}
            caption={`${tour} players`}
            testId="tennis-players-table"
            empty="No player matches that name."
          />
          {!all && !query && !country && !slams && rows.length > PAGE && (
            <button type="button" onClick={() => setAll(true)} className="text-sm text-pitch-800 underline underline-offset-2">
              {`Show all ${rows.length.toLocaleString('en-GB')}`}
            </button>
          )}
          <p className="text-xs text-ink-500">{`W–L counts matches played (not walkovers). Titles are tour-level events in this data (no Olympics, Davis Cup or Laver Cup). Win % sorts only for 20+ matches. Country is the nation played for now. Active: a tour-level match since ${since ? shortDate(since) : '–'} (12 months before the latest result); a long injury shows as inactive. ${DATA_NOTE} Player details: Wikidata (CC0).`}</p>
        </>
      )}
    </article>
  );
}
