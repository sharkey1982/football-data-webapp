import { useMemo, useState } from 'react';
import type { FplFixtureProjectionPlayer } from '../../lib/fplApi';

type SortKey = 'expected_minutes' | 'expected_fpl_points' | 'expected_goals' | 'expected_assists' | 'start_probability';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'expected_minutes', label: 'Min' },
  { key: 'expected_fpl_points', label: 'xPts' },
  { key: 'expected_goals', label: 'xG' },
  { key: 'expected_assists', label: 'xA' },
  { key: 'start_probability', label: 'Start %' },
];

function pct(v: number | null): string {
  return v === null ? '\u2014' : `${Math.round(v * 100)}%`;
}

function dec(v: number | null, digits = 2): string {
  return v === null ? '\u2014' : v.toFixed(digits);
}

function statusLabel(status: string | null): string | null {
  if (!status || status === 'a') return null;
  const map: Record<string, string> = { i: 'Injured', d: 'Doubtful', s: 'Suspended', u: 'Unavailable', n: 'Not available' };
  return map[status] ?? status;
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
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const sorted = useMemo(() => {
    if (!sortKey) return players;
    return [...players].sort((a, b) => (b[sortKey] ?? -1) - (a[sortKey] ?? -1));
  }, [players, sortKey]);

  return (
    <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-chalk-300 bg-chalk-100">
        <span className="text-xs font-medium text-ink-500 mr-1">Sort by</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setSortKey(sortKey === opt.key ? null : opt.key)}
            className={[
              'px-2 py-0.5 text-xs font-medium rounded transition-colors',
              sortKey === opt.key ? 'bg-pitch-800 text-chalk-100' : 'bg-white border border-chalk-300 text-ink-700 hover:bg-chalk-200',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-ink-500 border-b border-chalk-300">
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-2 py-2 font-medium">Pos</th>
              <th className="px-2 py-2 font-medium">Role</th>
              <th className="px-2 py-2 font-medium text-right">Start%</th>
              <th className="px-2 py-2 font-medium text-right">Min</th>
              <th className="px-2 py-2 font-medium text-right">xG</th>
              <th className="px-2 py-2 font-medium text-right">xA</th>
              <th className="px-3 py-2 font-medium text-right">xPts</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const isSelected = p.fpl_player_id === selectedPlayerId;
              const isExpanded = p.fpl_player_id === expandedId;
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
                    <td className="px-3 py-1.5 text-right font-mono text-sm font-semibold text-pitch-800">
                      {dec(p.expected_fpl_points, 1)}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-chalk-100 border-b border-chalk-200">
                      <td colSpan={8} className="px-3 py-2">
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
