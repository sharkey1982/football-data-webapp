// ============================================================================
// src/components/tennis/Opponents.tsx
//
// Player page: the players they've met most and how they got on (Chris,
// 7 Oct 2026). Built from the player's own matches, so it is in the static
// page too. Sortable; search for any opponent; each row links to the full
// head to head.
// ============================================================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SortableTable, { type Column } from '../SortableTable';
import { tennisH2HCanonicalPath } from '../../lib/tennisApi';
import { opponentRecords, opponentsSentence, type OpponentRecord } from '../../lib/tennisH2H';
import { pctLabel, shortDate, type TennisMatch, type Tour } from '../../lib/tennisStats';
import { PlayerLink, Section } from './TennisBits';

const SHOW = 15;

export default function Opponents({ tour, playerId, playerSlug, name, matches }: { tour: Tour; playerId: number; playerSlug: string; name: string; matches: TennisMatch[] }) {
  const rows = useMemo(() => opponentRecords(matches, playerId), [matches, playerId]);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, query]);
  if (rows.length < 2) return null;
  const story = opponentsSentence(name, rows);

  const columns: Column<OpponentRecord>[] = [
    { key: 'name', label: 'Opponent', render: (r) => <PlayerLink tour={tour} slug={r.slug} name={r.name} />, sortValue: (r) => r.name },
    { key: 'played', label: 'Played', render: (r) => r.played, sortValue: (r) => r.played, align: 'right', descFirst: true },
    {
      key: 'record',
      label: 'W–L',
      render: (r) => <span className={r.won > r.lost ? 'text-pitch-800 font-medium' : r.won < r.lost ? 'text-loss-700' : ''}>{`${r.won}–${r.lost}`}</span>,
      sortValue: (r) => r.won - r.lost,
      align: 'right',
      descFirst: true,
    },
    { key: 'pct', label: 'Win %', render: (r) => pctLabel(r.won / r.played), sortValue: (r) => r.won / r.played, align: 'right', descFirst: true },
    {
      key: 'finals',
      label: 'Finals',
      render: (r) => (r.finalsWon + r.finalsLost ? `${r.finalsWon}–${r.finalsLost}` : '–'),
      sortValue: (r) => r.finalsWon + r.finalsLost || null,
      align: 'right',
      descFirst: true,
      className: 'hidden md:table-cell',
    },
    {
      key: 'form',
      label: 'Last 5',
      render: (r) => (
        <span className="font-mono text-xs tracking-wider" aria-label={`Last ${r.form.length}, latest first: ${r.form.map((f) => (f === 'W' ? 'won' : 'lost')).join(', ')}`}>
          {r.form.map((f, i) => (
            <span key={i} className={f === 'W' ? 'text-pitch-800 font-semibold' : 'text-loss-700'}>{f}</span>
          ))}
        </span>
      ),
      className: 'hidden sm:table-cell',
    },
    {
      key: 'last',
      label: 'Last met',
      render: (r) => <span title={`${shortDate(r.last.match_date)}, ${r.last.round}`}>{`${r.last.tournament} ${r.last.year}`}</span>,
      sortValue: (r) => r.last.match_date,
      descFirst: true,
      className: 'hidden sm:table-cell',
    },
    {
      key: 'h2h',
      label: '',
      render: (r) => (
        <Link to={tennisH2HCanonicalPath(tour, playerSlug, r.slug)} aria-label="Head to head" className="text-pitch-800 underline underline-offset-2 text-xs whitespace-nowrap">
          <span className="sm:hidden">H2H</span>
          <span className="hidden sm:inline">Head to head</span>
        </Link>
      ),
    },
  ];

  return (
    <Section title="Most played opponents" id="tp-opponents">
      {story && <p className="text-ink-900 max-w-prose text-sm" data-testid="tennis-opponents-story">{story}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="sr-only">Find an opponent</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an opponent" className="border border-chalk-300 rounded px-2 py-1 w-56 bg-white" data-testid="tennis-opponent-search" />
        </label>
        <span className="text-xs text-ink-500">{`${rows.length.toLocaleString('en-GB')} different opponents`}</span>
      </div>
      <SortableTable
        columns={columns}
        rows={shown}
        rowKey={(r) => String(r.id)}
        initialSort={{ key: 'played', dir: 'desc' }}
        limit={all || query ? undefined : SHOW}
        caption={`${name}'s record against each opponent`}
        testId="tennis-player-opponents"
        empty="No opponent by that name."
      />
      {!all && !query && rows.length > SHOW && (
        <button type="button" onClick={() => setAll(true)} className="text-sm text-pitch-800 underline underline-offset-2">
          {`Show all ${rows.length.toLocaleString('en-GB')}`}
        </button>
      )}
    </Section>
  );
}
