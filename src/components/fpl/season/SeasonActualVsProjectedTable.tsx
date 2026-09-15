// ============================================================================
// src/components/fpl/season/SeasonActualVsProjectedTable.tsx
//
// Season-to-date actual points vs projected points, totals and PPG, for
// every player who's played at least one game -- restricted to fixtures
// that have actually been played, and projected totals computed only over
// those SAME fixtures (never padded with unplayed weeks). See
// getSeasonActualVsProjected in fplSeasonApi.ts for how the numbers are
// derived.
// ============================================================================

import { useMemo, useState } from 'react';
import type { SeasonPlayerActualVsProjected } from '../../../lib/fplSeasonApi';

type SortKey = 'web_name' | 'games_played' | 'actual_total_points' | 'actual_ppg' | 'projected_total_points' | 'projected_ppg';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; defaultDir: SortDir; align: 'left' | 'right' }[] = [
  { key: 'web_name', label: 'Player', defaultDir: 'asc', align: 'left' },
  { key: 'games_played', label: 'Played', defaultDir: 'desc', align: 'right' },
  { key: 'actual_total_points', label: 'Actual Total', defaultDir: 'desc', align: 'right' },
  { key: 'actual_ppg', label: 'Actual PPG', defaultDir: 'desc', align: 'right' },
  { key: 'projected_total_points', label: 'Proj. Total', defaultDir: 'desc', align: 'right' },
  { key: 'projected_ppg', label: 'Proj. PPG', defaultDir: 'desc', align: 'right' },
];

function num(v: number | null, digits = 1): string {
  return v === null ? '\u2014' : v.toFixed(digits);
}

function compareValues(a: SeasonPlayerActualVsProjected, b: SeasonPlayerActualVsProjected, key: SortKey): number {
  const av = a[key];
  const bv = b[key];
  if (typeof av === 'string' || typeof bv === 'string') return (av ?? '').toString().localeCompare((bv ?? '').toString());
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return (av as number) - (bv as number);
}

export default function SeasonActualVsProjectedTable({ rows }: { rows: SeasonPlayerActualVsProjected[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('actual_total_points');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? rows.filter((r) => r.web_name.toLowerCase().includes(s)) : rows;
  }, [rows, search]);

  const sorted = useMemo(() => {
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => factor * compareValues(a, b, sortKey));
  }, [filtered, sortKey, sortDir]);

  const handleHeaderClick = (col: (typeof COLUMNS)[number]) => {
    if (col.key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir(col.defaultDir);
    }
  };

  return (
    <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-chalk-300 bg-chalk-100">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={'Search player\u2026'}
          className="px-2 py-1 text-xs rounded border border-chalk-300 bg-white text-ink-900 placeholder:text-ink-500 w-36"
        />
        <span className="text-xs text-ink-500 ml-auto">{sorted.length} players</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-ink-500 border-b border-chalk-300 bg-chalk-100">
              {COLUMNS.map((col) => {
                const isActive = col.key === sortKey;
                return (
                  <th key={col.key} scope="col" aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button
                      type="button"
                      onClick={() => handleHeaderClick(col)}
                      className={[
                        'w-full px-2 py-2 first:pl-3 last:pr-3 flex items-center gap-1 font-medium transition-colors hover:text-ink-900 whitespace-nowrap',
                        col.align === 'right' ? 'justify-end' : 'justify-start',
                        isActive ? 'text-ink-900' : 'text-ink-500',
                      ].join(' ')}
                    >
                      {col.label}
                      <span className={['text-[9px] w-2.5', isActive ? 'opacity-100' : 'opacity-0'].join(' ')} aria-hidden="true">
                        {sortDir === 'asc' ? '\u25B2' : '\u25BC'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.fpl_player_id} className="border-b border-chalk-200 last:border-b-0 hover:bg-chalk-100 transition-colors">
                <td className="px-3 py-1.5 font-medium text-ink-900">{r.web_name}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{r.games_played}</td>
                <td className="px-2 py-1.5 text-right font-mono text-sm font-semibold text-pitch-800">{r.actual_total_points}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{num(r.actual_ppg)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{num(r.projected_total_points, 0)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-700">{num(r.projected_ppg)}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-sm text-ink-500">
                  No players match the current search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
