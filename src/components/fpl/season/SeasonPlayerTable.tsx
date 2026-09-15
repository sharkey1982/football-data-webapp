import { Fragment, useMemo, useState } from 'react';
import type { SeasonPlayerProjection } from '../../../lib/fplSeasonApi';
import { FPL_POSITION_LABEL } from '../../../lib/fplApi';

type SortKey =
  | 'web_name'
  | 'team_name'
  | 'fpl_position_label'
  | 'actual_started'
  | 'actual_minutes'
  | 'actual_points'
  | 'start_probability'
  | 'expected_minutes'
  | 'expected_goals'
  | 'expected_assists'
  | 'clean_sheet_probability'
  | 'defensive_contribution_probability'
  | 'experimental_expected_bonus'
  | 'selected_by_percent'
  | 'lineup_confidence'
  | 'expected_fpl_points';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right'; defaultDir: SortDir; title?: string }[] = [
  { key: 'web_name', label: 'Player', align: 'left', defaultDir: 'asc' },
  { key: 'team_name', label: 'Team', align: 'left', defaultDir: 'asc' },
  { key: 'fpl_position_label', label: 'Pos', align: 'left', defaultDir: 'asc' },
  { key: 'selected_by_percent', label: 'Sel%', align: 'right', defaultDir: 'desc', title: "FPL's own selected-by percentage of managers" },
  { key: 'actual_started', label: 'Started', align: 'right', defaultDir: 'desc', title: 'Real result from the match, where played -- independent of any projection' },
  { key: 'actual_minutes', label: 'Act. Min', align: 'right', defaultDir: 'desc' },
  { key: 'actual_points', label: 'Act. Pts', align: 'right', defaultDir: 'desc', title: 'Real FPL points scored, where played' },
  { key: 'start_probability', label: 'Start%', align: 'right', defaultDir: 'desc' },
  { key: 'expected_minutes', label: 'Min', align: 'right', defaultDir: 'desc' },
  { key: 'expected_goals', label: 'xG', align: 'right', defaultDir: 'desc' },
  { key: 'expected_assists', label: 'xA', align: 'right', defaultDir: 'desc' },
  { key: 'clean_sheet_probability', label: 'CS%', align: 'right', defaultDir: 'desc' },
  { key: 'defensive_contribution_probability', label: 'DC%', align: 'right', defaultDir: 'desc' },
  { key: 'experimental_expected_bonus', label: 'Bonus*', align: 'right', defaultDir: 'desc', title: 'Experimental -- from a newer fixture-level probabilistic BPS model, not an official FPL forecast' },
  { key: 'lineup_confidence', label: 'Conf.', align: 'right', defaultDir: 'desc', title: 'How much the minutes/lineup estimate behind this projection can be trusted -- based on whether it comes from a real squad-state update, nailed recent history, or a fallback' },
  { key: 'expected_fpl_points', label: 'xPts', align: 'right', defaultDir: 'desc' },
];

/** Component-by-component xPts breakdown shown when a row is expanded -- these are pulled straight from the stored projection, not recomputed, and should sum close to xPts. */
const BREAKDOWN_FIELDS: { key: keyof SeasonPlayerProjection; label: string }[] = [
  { key: 'xpts_appearance', label: 'Playing time' },
  { key: 'xpts_goals', label: 'Goals' },
  { key: 'xpts_assists', label: 'Assists' },
  { key: 'xpts_clean_sheet', label: 'Clean sheet' },
  { key: 'xpts_defensive_contribution', label: 'Defensive contribution' },
  { key: 'xpts_saves', label: 'Saves' },
  { key: 'xpts_bonus', label: 'Bonus' },
  { key: 'xpts_goals_conceded', label: 'Goals conceded' },
  { key: 'xpts_penalties', label: 'Penalties' },
  { key: 'xpts_cards_own_goals', label: 'Cards / own goals' },
];

function pct(v: number | null): string {
  return v === null ? '\u2014' : `${Math.round(v * 100)}%`;
}

function dec(v: number | null, digits = 2): string {
  return v === null ? '\u2014' : v.toFixed(digits);
}

function compareValues(a: SeasonPlayerProjection, b: SeasonPlayerProjection, key: SortKey): number {
  const av = a[key];
  const bv = b[key];
  if (typeof av === 'string' || typeof bv === 'string') {
    return (av ?? '').toString().localeCompare((bv ?? '').toString());
  }
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return (av as number) - (bv as number);
}

export default function SeasonPlayerTable({ players }: { players: SeasonPlayerProjection[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('expected_minutes');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [positionFilter, setPositionFilter] = useState<number | 'all'>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const teamOptions = useMemo(() => {
    const names = new Set(players.map((p) => p.team_name));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [players]);

  const filtered = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return players.filter((p) => {
      if (positionFilter !== 'all' && p.fpl_position !== positionFilter) return false;
      if (teamFilter !== 'all' && p.team_name !== teamFilter) return false;
      if (searchLower && !p.web_name.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [players, positionFilter, teamFilter, search]);

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
    return [...filtered].sort((a, b) => factor * compareValues(a, b, sortKey));
  }, [filtered, sortKey, sortDir]);

  const anyRetrospective = sorted.some((p) => p.is_retrospective);

  return (
    <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-chalk-300 bg-chalk-100">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={'Search player\u2026'}
          className="px-2 py-1 text-xs rounded border border-chalk-300 bg-white text-ink-900 placeholder:text-ink-500 w-36"
        />
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="px-2 py-1 text-xs rounded border border-chalk-300 bg-white text-ink-900"
        >
          <option value="all">All positions</option>
          {(Object.entries(FPL_POSITION_LABEL) as [string, string][]).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="px-2 py-1 text-xs rounded border border-chalk-300 bg-white text-ink-900"
        >
          <option value="all">All teams</option>
          {teamOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-500 ml-auto">{sorted.length} players</span>
      </div>

      {anyRetrospective && (
        <div className="px-3 py-1.5 text-[11px] text-amber-700 bg-amber-400/10 border-b border-chalk-200">
          Rows marked <strong>Retrospective</strong> are for fixtures already played -- the current model recalculating after the
          fact, not an archived pre-match forecast.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-ink-500 border-b border-chalk-300 bg-chalk-100">
              {COLUMNS.map((col) => {
                const isActive = col.key === sortKey;
                return (
                  <th key={col.key} scope="col" aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} title={col.title}>
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
            {sorted.map((p) => {
              const uncertain = p.start_probability !== null && p.start_probability < 0.85;
              const rowKey = `${p.fixture_id}-${p.fpl_player_id}`;
              const isExpanded = expandedKey === rowKey;
              const hasBreakdown = BREAKDOWN_FIELDS.some((f) => p[f.key] !== null);
              return (
                <Fragment key={rowKey}>
                <tr
                  onClick={() => hasBreakdown && setExpandedKey(isExpanded ? null : rowKey)}
                  className={['border-b border-chalk-200 last:border-b-0 hover:bg-chalk-100 transition-colors', hasBreakdown ? 'cursor-pointer' : ''].join(' ')}
                >
                  <td className="px-3 py-1.5">
                    <div className="font-medium text-ink-900">{p.web_name}</div>
                    {p.is_retrospective && <div className="text-[10px] text-amber-700 uppercase tracking-wide">Retrospective</div>}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-ink-700 whitespace-nowrap">{p.team_name}</td>
                  <td className="px-2 py-1.5 font-mono text-xs text-ink-700">{p.fpl_position_label}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">
                    {p.selected_by_percent === null ? '\u2014' : `${p.selected_by_percent.toFixed(1)}%`}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">
                    {p.actual_started === null ? (
                      <span className="text-ink-500">{'\u2014'}</span>
                    ) : p.actual_started ? (
                      <span className="text-pitch-800 font-medium">{'\u2713'}</span>
                    ) : (
                      <span className="text-ink-500">sub</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">
                    {p.actual_minutes === null ? '\u2014' : p.actual_minutes}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">
                    {p.actual_points === null ? '\u2014' : p.actual_points}
                  </td>
                  <td className={['px-2 py-1.5 text-right font-mono text-xs', uncertain ? 'text-amber-600' : 'text-ink-700'].join(' ')}>
                    {pct(p.start_probability)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">
                    {p.expected_minutes === null ? '\u2014' : Math.round(p.expected_minutes)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{dec(p.expected_goals)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{dec(p.expected_assists)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{pct(p.clean_sheet_probability)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{pct(p.defensive_contribution_probability)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-500">{dec(p.experimental_expected_bonus)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">
                    {p.lineup_confidence === null ? '\u2014' : `${Math.round(p.lineup_confidence * 100)}%`}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-sm font-semibold text-pitch-800">
                    {p.expected_fpl_points === null ? (
                      <span className="text-ink-500 font-normal text-xs">Not yet modelled</span>
                    ) : (
                      dec(p.expected_fpl_points, 1)
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${rowKey}-breakdown`} className="bg-chalk-100/70 border-b border-chalk-200">
                    <td colSpan={COLUMNS.length} className="px-3 py-2">
                      <div className="text-[11px] text-ink-500 mb-1">xPts breakdown by source (sums close to the total above):</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {BREAKDOWN_FIELDS.map((f) => {
                          const v = p[f.key] as number | null;
                          if (v === null) return null;
                          return (
                            <span key={f.key} className="text-xs font-mono text-ink-700">
                              <span className="text-ink-500">{f.label}:</span> {v.toFixed(2)}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-sm text-ink-500">
                  No players match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
