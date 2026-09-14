import { useMemo, useState } from 'react';
import type { FplFixtureProjectionPlayer } from '../../lib/fplApi';

type SortKey =
  | 'web_name'
  | 'fpl_position_label'
  | 'tactical_role'
  | 'start_probability'
  | 'expected_minutes'
  | 'expected_goals'
  | 'expected_assists'
  | 'price'
  | 'value'
  | 'expected_fpl_points';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right'; defaultDir: SortDir }[] = [
  { key: 'web_name', label: 'Player', align: 'left', defaultDir: 'asc' },
  { key: 'fpl_position_label', label: 'Pos', align: 'left', defaultDir: 'asc' },
  { key: 'tactical_role', label: 'Role', align: 'left', defaultDir: 'asc' },
  { key: 'start_probability', label: 'Start%', align: 'right', defaultDir: 'desc' },
  { key: 'expected_minutes', label: 'Min', align: 'right', defaultDir: 'desc' },
  { key: 'expected_goals', label: 'xG', align: 'right', defaultDir: 'desc' },
  { key: 'expected_assists', label: 'xA', align: 'right', defaultDir: 'desc' },
  { key: 'price', label: 'Price', align: 'right', defaultDir: 'desc' },
  { key: 'value', label: 'Value', align: 'right', defaultDir: 'desc' },
  { key: 'expected_fpl_points', label: 'xPts', align: 'right', defaultDir: 'desc' },
];

const COLUMN_COUNT = COLUMNS.length;

function pct(v: number | null): string {
  return v === null ? '\u2014' : `${Math.round(v * 100)}%`;
}

function dec(v: number | null, digits = 2): string {
  return v === null ? '\u2014' : v.toFixed(digits);
}

function price(v: number | null): string {
  return v === null ? '\u2014' : `\u00A3${v.toFixed(1)}m`;
}

function statusLabel(status: string | null): string | null {
  if (!status || status === 'a') return null;
  const map: Record<string, string> = { i: 'Injured', d: 'Doubtful', s: 'Suspended', u: 'Unavailable', n: 'Not available' };
  return map[status] ?? status;
}

function compareValues(a: FplFixtureProjectionPlayer, b: FplFixtureProjectionPlayer, key: SortKey): number {
  const av = a[key];
  const bv = b[key];
  if (typeof av === 'string' || typeof bv === 'string') {
    return (av ?? '').toString().localeCompare((bv ?? '').toString());
  }
  // Numeric (possibly null) columns -- nulls sort to the end regardless of direction.
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return (av as number) - (bv as number);
}

export default function PlayerProjectionTable({
  players,
  selectedPlayerId,
  onSelectPlayer,
}: {
  players: FplFixtureProjectionPlayer[];
  selectedPlayerId: number | null;
  onSelectPlayer: (fplPlayerId: number) => void;
}) {
  // Sortable by default -- clicking any column header sorts by it immediately,
  // no separate "enable sorting" step. Default order is by projected points.
  const [sortKey, setSortKey] = useState<SortKey>('expected_fpl_points');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleHeaderClick = (col: (typeof COLUMNS)[number]) => {
    if (col.key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir(col.defaultDir);
    }
  };

  const sorted = useMemo(() => {
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...players].sort((a, b) => factor * compareValues(a, b, sortKey));
  }, [players, sortKey, sortDir]);

  // Best value = highest projected points per \u00a3m among players with both a
  // price and a projection -- highlighted regardless of current sort/table order.
  const bestValueId = useMemo(() => {
    let bestId: number | null = null;
    let bestValue = -Infinity;
    for (const p of players) {
      if (p.value !== null && p.value > bestValue) {
        bestValue = p.value;
        bestId = p.fpl_player_id;
      }
    }
    return bestId;
  }, [players]);

  return (
    <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-ink-500 border-b border-chalk-300 bg-chalk-100">
              {COLUMNS.map((col) => {
                const isActive = col.key === sortKey;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      onClick={() => handleHeaderClick(col)}
                      className={[
                        'w-full px-2 py-2 first:pl-3 last:pr-3 flex items-center gap-1 font-medium transition-colors hover:text-ink-900',
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
            {sorted.map((p) => {
              const isSelected = p.fpl_player_id === selectedPlayerId;
              const isExpanded = p.fpl_player_id === expandedId;
              const isBestValue = p.fpl_player_id === bestValueId;
              const unavailable = statusLabel(p.status);
              const uncertain = p.start_probability !== null && p.start_probability < 0.85;

              return (
                <>
                  <tr
                    key={p.fpl_player_id}
                    onClick={() => {
                      onSelectPlayer(p.fpl_player_id);
                      setExpandedId(isExpanded ? null : p.fpl_player_id);
                    }}
                    className={[
                      'border-b border-chalk-200 last:border-b-0 cursor-pointer transition-colors',
                      isSelected ? 'bg-amber-400/20' : 'hover:bg-chalk-100',
                    ].join(' ')}
                  >
                    <td className="px-3 py-1.5">
                      <div className="font-medium text-ink-900">{p.web_name}</div>
                      {unavailable && <div className="text-[11px] text-loss-700">{unavailable}</div>}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs text-ink-700">{p.fpl_position_label}</td>
                    <td className="px-2 py-1.5 font-mono text-xs text-ink-700">{p.tactical_role ?? '\u2014'}</td>
                    <td className={['px-2 py-1.5 text-right font-mono text-xs', uncertain ? 'text-amber-600' : 'text-ink-700'].join(' ')}>
                      {pct(p.start_probability)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">
                      {p.expected_minutes === null ? '\u2014' : Math.round(p.expected_minutes)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{dec(p.expected_goals)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{dec(p.expected_assists)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{price(p.price)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <span
                        className={[
                          'font-mono text-xs',
                          isBestValue ? 'bg-amber-400/40 text-ink-900 font-semibold px-1.5 py-0.5 rounded' : 'text-ink-700',
                        ].join(' ')}
                        title={isBestValue ? 'Best value in this squad -- highest projected points per \u00a3m' : undefined}
                      >
                        {dec(p.value)}
                        {isBestValue && ' \u2605'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-sm font-semibold text-pitch-800">
                      {dec(p.expected_fpl_points, 1)}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-chalk-100 border-b border-chalk-200">
                      <td colSpan={COLUMN_COUNT} className="px-3 py-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-ink-700 font-mono">
                          <div>Sub-on chance: {pct(p.sub_appearance_probability)}</div>
                          <div>Availability: {pct(p.availability_probability)}</div>
                          <div>Lineup confidence: {pct(p.lineup_confidence)}</div>
                          <div>Clean sheet: {pct(p.clean_sheet_probability)}</div>
                          <div>Exp. saves: {dec(p.expected_saves)}</div>
                          <div>Def. contribution: {pct(p.defensive_contribution_probability)}</div>
                          <div>Exp. bonus: {dec(p.expected_bonus)}</div>
                          <div>Role sources: {p.tactical_role_sources ?? '\u2014'}</div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-chalk-300 grid grid-cols-3 sm:grid-cols-5 gap-x-4 gap-y-1 text-xs text-ink-500 font-mono">
                          <div>xPts appearance: {dec(p.xpts.appearance)}</div>
                          <div>xPts goals: {dec(p.xpts.goals)}</div>
                          <div>xPts assists: {dec(p.xpts.assists)}</div>
                          <div>xPts clean sheet: {dec(p.xpts.clean_sheet)}</div>
                          <div>xPts saves: {dec(p.xpts.saves)}</div>
                          <div>xPts def. contribution: {dec(p.xpts.defensive_contribution)}</div>
                          <div>xPts goals conceded: {dec(p.xpts.goals_conceded)}</div>
                          <div>xPts cards/OG: {dec(p.xpts.cards_own_goals)}</div>
                          <div>xPts penalties: {dec(p.xpts.penalties)}</div>
                          <div>xPts bonus: {dec(p.xpts.bonus)}</div>
                        </div>
                        {p.news && <div className="mt-2 text-xs text-loss-700 italic">{p.news}</div>}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
