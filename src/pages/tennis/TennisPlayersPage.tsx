// ============================================================================
// src/pages/tennis/TennisPlayersPage.tsx
//
// /tennis/players -- "Your Player", the tennis counterpart of Football's Your
// Team: every player on a tour, searchable, sortable by any column. ATP by
// default; ?tour=wta for the WTA. Server-rendered at build (ATP).
// ============================================================================

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { PlayerLink, TennisHeader } from '../../components/tennis/TennisBits';
import TourToggle from '../../components/tennis/TourToggle';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { TENNIS_PLAYERS_PATH, loadTennisPlayers, tennisPlayersPath, type TennisPlayersData } from '../../lib/tennisApi';
import { DATA_NOTE, FIRST_YEAR, parseTour, pct, pctLabel, recordLabel, shortDate, type TennisPlayer } from '../../lib/tennisStats';

const PAGE = 100;

export default function TennisPlayersPage({ initialData }: { initialData?: TennisPlayersData }) {
  const [params] = useSearchParams();
  const tour = parseTour(params.get('tour')) ?? initialData?.tour ?? 'ATP';
  const { data, failed, loading } = useKeyedFetch(tour, () => loadTennisPlayers(tour), initialData ? { key: initialData.tour, data: initialData } : undefined);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  useDocumentHead({
    title: `${tour} players: records, titles and seasons since ${FIRST_YEAR[tour]}`,
    description: `Every ${tour} player at tour level since ${FIRST_YEAR[tour]}: win-loss record, titles, finals and the years they played. Pick one for their full record.`,
    path: TENNIS_PLAYERS_PATH,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data?.players ?? [];
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  }, [data, query]);

  const columns: Column<TennisPlayer>[] = [
    { key: 'name', label: 'Player', render: (p) => <PlayerLink tour={p.tour} slug={p.slug} name={p.name} />, sortValue: (p) => p.name },
    { key: 'recent', label: 'Last 3 seasons', render: (p) => p.recent_matches, sortValue: (p) => p.recent_matches, align: 'right', descFirst: true, className: 'hidden sm:table-cell' },
    { key: 'record', label: 'W–L', render: (p) => recordLabel(p.won, p.lost), sortValue: (p) => p.won + p.lost, align: 'right', descFirst: true },
    { key: 'pct', label: 'Win %', render: (p) => pctLabel(pct(p.won, p.lost)), sortValue: (p) => (p.won + p.lost >= 20 ? pct(p.won, p.lost) : null), align: 'right', descFirst: true },
    { key: 'titles', label: 'Titles', render: (p) => p.titles, sortValue: (p) => p.titles, align: 'right', descFirst: true },
    { key: 'finals', label: 'Finals', render: (p) => p.finals, sortValue: (p) => p.finals, align: 'right', descFirst: true, className: 'hidden sm:table-cell' },
    { key: 'years', label: 'Years', render: (p) => (p.first_year === p.last_year ? p.first_year : `${p.first_year}–${p.last_year}`), sortValue: (p) => p.first_year, align: 'right', className: 'hidden md:table-cell' },
    { key: 'last', label: 'Last match', render: (p) => shortDate(p.last_match), sortValue: (p) => p.last_match, align: 'right', descFirst: true, className: 'hidden md:table-cell' },
  ];

  return (
    <article className="space-y-5">
      <TennisHeader title="Your Player" toggle={<TourToggle tour={tour} to={(t) => tennisPlayersPath(t)} />}>
        <p className="text-ink-700 max-w-prose">Pick a player for their record by season, surface and tournament level, their titles, best wins and latest matches.</p>
      </TennisHeader>
      {failed && <p className="text-ink-700">Players are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && (
        <>
          <div className="flex flex-wrap items-center gap-3">
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
            <span className="text-xs text-ink-500">{`${rows.length.toLocaleString('en-GB')} players`}</span>
          </div>
          <SortableTable
            columns={columns}
            rows={rows}
            rowKey={(p) => String(p.player_id)}
            initialSort={{ key: 'recent', dir: 'desc' }}
            limit={all || query ? undefined : PAGE}
            caption={`${tour} players`}
            testId="tennis-players-table"
            empty="No player matches that name."
          />
          {!all && !query && rows.length > PAGE && (
            <button type="button" onClick={() => setAll(true)} className="text-sm text-pitch-800 underline underline-offset-2">
              {`Show all ${rows.length.toLocaleString('en-GB')}`}
            </button>
          )}
          <p className="text-xs text-ink-500">{`W–L counts matches played (not walkovers). Win % shown sorted only for 20+ matches. ${DATA_NOTE}`}</p>
        </>
      )}
    </article>
  );
}
