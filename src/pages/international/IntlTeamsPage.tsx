// ============================================================================
// src/pages/international/IntlTeamsPage.tsx
//
// /international/teams -- International "Your Team": every nation with its
// current Elo rating and rank, record and titles. Searchable, filterable by
// confederation, sortable by every column. Current FIFA sides by default
// (a confederation and a game in the last four years); a box shows the rest
// (former nations such as Yugoslavia, and non-FIFA sides).
// ============================================================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { IntlHeader } from '../../components/intl/IntlBits';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { INTL_TEAMS_PATH, intlTeamPath, loadIntlTeams } from '../../lib/intlApi';
import { CONFEDERATIONS, DATA_NOTE, type TeamSummary } from '../../lib/intlStats';

export default function IntlTeamsPage() {
  const { data, failed, loading } = useKeyedFetch('teams', () => loadIntlTeams());
  const [query, setQuery] = useState('');
  const [conf, setConf] = useState('');
  const [all, setAll] = useState(false);
  useDocumentHead({
    title: 'International teams: every nation’s rating, record and titles',
    description: 'Every national team’s World Football Elo rating, all-time record and World Cup, Euro and Nations League titles, since 1872.',
    path: INTL_TEAMS_PATH,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((t) => (all || q || t.elo_rank != null) && (!conf || t.confederation === conf) && (!q || t.team.toLowerCase().includes(q)));
  }, [data, query, conf, all]);

  const columns: Column<TeamSummary>[] = [
    { key: 'rank', label: 'Rank', render: (t) => t.elo_rank ?? '–', sortValue: (t) => t.elo_rank, align: 'right' },
    { key: 'team', label: 'Nation', render: (t) => <Link to={intlTeamPath(t.slug)} className="text-pitch-800 underline underline-offset-2">{t.team}</Link>, sortValue: (t) => t.team },
    { key: 'conf', label: 'Confederation', render: (t) => t.confederation ?? '–', sortValue: (t) => t.confederation, className: 'hidden sm:table-cell' },
    { key: 'elo', label: 'Elo', render: (t) => Math.round(t.elo), sortValue: (t) => t.elo, align: 'right', descFirst: true },
    { key: 'peak', label: 'Peak', render: (t) => <span title={`Reached ${t.elo_peak_date}`}>{Math.round(t.elo_peak)}</span>, sortValue: (t) => t.elo_peak, align: 'right', descFirst: true, className: 'hidden md:table-cell' },
    { key: 'p', label: 'Played', render: (t) => t.played, sortValue: (t) => t.played, align: 'right', descFirst: true, className: 'hidden md:table-cell' },
    { key: 'winpct', label: 'Won %', render: (t) => `${Math.round((100 * t.won) / Math.max(1, t.played))}%`, sortValue: (t) => t.won / Math.max(1, t.played), align: 'right', descFirst: true, className: 'hidden sm:table-cell' },
    { key: 'wc', label: 'World Cups', render: (t) => t.wc_titles || '', sortValue: (t) => t.wc_titles, align: 'right', descFirst: true },
    { key: 'euro', label: 'Euros', render: (t) => t.euro_titles || '', sortValue: (t) => t.euro_titles, align: 'right', descFirst: true, className: 'hidden sm:table-cell' },
    { key: 'unl', label: 'Nations Lg', render: (t) => t.unl_titles || '', sortValue: (t) => t.unl_titles, align: 'right', descFirst: true, className: 'hidden lg:table-cell' },
  ];

  return (
    <article className="space-y-5">
      <IntlHeader title="Your Team">
        <p className="text-ink-700 max-w-prose">Every nation’s rating from every result since 1872, its record and its titles. Pick one for its history and head-to-heads.</p>
      </IntlHeader>
      {failed && <p className="text-ink-700">Nations are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm">
              <span className="sr-only">Search nations</span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nation" className="border border-chalk-300 rounded px-2 py-1 w-48 bg-white" data-testid="intl-team-search" />
            </label>
            <label className="text-sm inline-flex items-center gap-1.5">
              <span className="text-ink-500">Confederation</span>
              <select value={conf} onChange={(e) => setConf(e.target.value)} className="border border-chalk-300 rounded px-2 py-1 bg-white" data-testid="intl-conf-filter">
                <option value="">All</option>
                {CONFEDERATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-sm inline-flex items-center gap-1.5">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
              <span>Include former and non-FIFA sides</span>
            </label>
            <span className="text-xs text-ink-500">{`${rows.length} nation${rows.length === 1 ? '' : 's'}`}</span>
          </div>
          <SortableTable columns={columns} rows={rows} rowKey={(t) => t.team} initialSort={{ key: 'rank', dir: 'asc' }} caption="International teams" testId="intl-teams-table" empty="No nation matches." />
          <p className="text-xs text-ink-500">{`Elo: the World Football Elo method, computed by FixtureShark from every result (start 1500; weighted by competition and margin; shoot-outs count as draws). Rank is among confederation members who have played in the last four years. Titles: World Cup, Euro and UEFA Nations League. Teams are filed under today’s nation (Soviet Union under Russia, West Germany under Germany), as in the source. ${DATA_NOTE}`}</p>
        </>
      )}
    </article>
  );
}
