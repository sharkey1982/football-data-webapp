// ============================================================================
// src/pages/fpl/PlayerProjectionsTablePage.tsx
//
// Standalone player table (Fantasy menu): every player, one row each, over a
// filterable gameweek range -- either as points-per-gameweek (actual where
// played, projected where not) or as a points-by-contribution breakdown
// summed across the range. Distinct from the per-fixture "Player
// Projections" browser (/fpl/gameweek/:matchweek), which stays as-is.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { getDefaultMatchweek } from '../../lib/fplSeasonApi';
import { getPlayerGameweekPointsRange, type PlayerGameweekPoints } from '../../lib/fplPlayerTableApi';
import { FPL_POSITION_LABEL } from '../../lib/fplApi';
import GameweekRangeFilter from '../../components/fpl/GameweekRangeFilter';
import { getErrorMessage } from '../../lib/errorMessage';

type ViewMode = 'by_gameweek' | 'by_contribution';

type PlayerRow = {
  fpl_player_id: number;
  web_name: string;
  team_name: string;
  fpl_position: number | null;
  fpl_position_label: string;
  price: number | null;
  byMatchweek: Map<number, { actual: number | null; projected: number | null }>;
  total: number;
  hasAnyActual: boolean;
  hasAnyProjected: boolean;
  contribution: {
    appearance: number;
    goals: number;
    assists: number;
    cleanSheet: number;
    defensiveContribution: number;
    saves: number;
    bonus: number;
    goalsConceded: number;
    penalties: number;
    cardsOwnGoals: number;
    total: number;
  };
};

const CONTRIBUTION_COLUMNS: { key: keyof PlayerRow['contribution']; label: string }[] = [
  { key: 'appearance', label: 'Playing time' },
  { key: 'goals', label: 'Goals' },
  { key: 'assists', label: 'Assists' },
  { key: 'cleanSheet', label: 'Clean sheet' },
  { key: 'defensiveContribution', label: 'Def. contribution' },
  { key: 'saves', label: 'Saves' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'goalsConceded', label: 'Goals conceded' },
  { key: 'penalties', label: 'Penalties' },
  { key: 'cardsOwnGoals', label: 'Cards / OG' },
];

function buildPlayerRows(raw: PlayerGameweekPoints[]): PlayerRow[] {
  const byPlayer = new Map<number, PlayerRow>();
  for (const r of raw) {
    let row = byPlayer.get(r.fpl_player_id);
    if (!row) {
      row = {
        fpl_player_id: r.fpl_player_id,
        web_name: r.web_name,
        team_name: r.team_name,
        fpl_position: r.fpl_position,
        fpl_position_label: r.fpl_position_label,
        price: r.price,
        byMatchweek: new Map(),
        total: 0,
        hasAnyActual: false,
        hasAnyProjected: false,
        contribution: { appearance: 0, goals: 0, assists: 0, cleanSheet: 0, defensiveContribution: 0, saves: 0, bonus: 0, goalsConceded: 0, penalties: 0, cardsOwnGoals: 0, total: 0 },
      };
      byPlayer.set(r.fpl_player_id, row);
    }
    row.byMatchweek.set(r.matchweek, { actual: r.actual_points, projected: r.projected_points });
    const shown = r.actual_points ?? r.projected_points;
    if (shown !== null) row.total += shown;
    if (r.actual_points !== null) row.hasAnyActual = true;
    if (r.projected_points !== null) row.hasAnyProjected = true;

    // Contribution breakdown mirrors the same actual-over-projected choice
    // as the total above: real stats (reconstructed via the official
    // 2025/26 scoring rules) where the fixture's been played, the model's
    // own component breakdown otherwise. Never both for the same gameweek.
    if (r.actual_points !== null && r.actual_contribution) {
      const c = r.actual_contribution;
      row.contribution.appearance += c.appearance;
      row.contribution.goals += c.goals;
      row.contribution.assists += c.assists;
      row.contribution.cleanSheet += c.cleanSheet;
      row.contribution.defensiveContribution += c.defensiveContribution;
      row.contribution.saves += c.saves;
      row.contribution.bonus += c.bonus;
      row.contribution.goalsConceded += c.goalsConceded;
      row.contribution.penalties += c.penalties;
      row.contribution.cardsOwnGoals += c.cardsOwnGoals;
      row.contribution.total += r.actual_points;
    } else if (r.projected_points !== null) {
      row.contribution.appearance += r.xpts_appearance ?? 0;
      row.contribution.goals += r.xpts_goals ?? 0;
      row.contribution.assists += r.xpts_assists ?? 0;
      row.contribution.cleanSheet += r.xpts_clean_sheet ?? 0;
      row.contribution.defensiveContribution += r.xpts_defensive_contribution ?? 0;
      row.contribution.saves += r.xpts_saves ?? 0;
      row.contribution.bonus += r.xpts_bonus ?? 0;
      row.contribution.goalsConceded += r.xpts_goals_conceded ?? 0;
      row.contribution.penalties += r.xpts_penalties ?? 0;
      row.contribution.cardsOwnGoals += r.xpts_cards_own_goals ?? 0;
      row.contribution.total += r.projected_points;
    }
  }
  return [...byPlayer.values()];
}

export default function PlayerProjectionsTablePage() {
  const [defaultGw, setDefaultGw] = useState<number | null>(null);
  const [fromMatchweek, setFromMatchweek] = useState<number | null>(null);
  const [toMatchweek, setToMatchweek] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('by_gameweek');
  const [positionFilter, setPositionFilter] = useState<number | 'all'>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [rawRows, setRawRows] = useState<PlayerGameweekPoints[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Default range: current gameweek to +4 (5 weeks total, matching the
  // "Next 5 GWs" preset every other page uses) -- a useful "next few weeks
  // plus this one" window on first load without pulling the whole season.
  useEffect(() => {
    let cancelled = false;
    getDefaultMatchweek()
      .then((mw) => {
        if (!cancelled) setDefaultGw(mw);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load the default gameweek'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (fromMatchweek === null || toMatchweek === null) return;
    if (toMatchweek < fromMatchweek) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPlayerGameweekPointsRange(fromMatchweek, toMatchweek)
      .then((data) => {
        if (!cancelled) setRawRows(data);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load player points'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromMatchweek, toMatchweek]);

  const matchweeks = useMemo(() => {
    if (fromMatchweek === null || toMatchweek === null) return [];
    const out: number[] = [];
    for (let w = fromMatchweek; w <= toMatchweek; w++) out.push(w);
    return out;
  }, [fromMatchweek, toMatchweek]);

  const allRows = useMemo(() => buildPlayerRows(rawRows ?? []), [rawRows]);

  const teamOptions = useMemo(() => [...new Set(allRows.map((r) => r.team_name))].sort((a, b) => a.localeCompare(b)), [allRows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (positionFilter !== 'all' && r.fpl_position !== positionFilter) return false;
      if (teamFilter !== 'all' && r.team_name !== teamFilter) return false;
      if (s && !r.web_name.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [allRows, positionFilter, teamFilter, search]);

  const sorted = useMemo(() => {
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'web_name') return factor * a.web_name.localeCompare(b.web_name);
      if (sortKey === 'total') return factor * (a.total - b.total);
      if (sortKey === 'price') return factor * ((a.price ?? -Infinity) - (b.price ?? -Infinity));
      if (sortKey === 'value') {
        const av = a.price && a.price > 0 ? a.total / a.price : -Infinity;
        const bv = b.price && b.price > 0 ? b.total / b.price : -Infinity;
        return factor * (av - bv);
      }
      if (viewMode === 'by_gameweek' && sortKey.startsWith('mw:')) {
        const mw = Number(sortKey.slice(3));
        const av = a.byMatchweek.get(mw);
        const bv = b.byMatchweek.get(mw);
        const aVal = (av?.actual ?? av?.projected) ?? -Infinity;
        const bVal = (bv?.actual ?? bv?.projected) ?? -Infinity;
        return factor * (aVal - bVal);
      }
      if (viewMode === 'by_contribution') {
        const key = sortKey as keyof PlayerRow['contribution'];
        if (key in a.contribution) return factor * (a.contribution[key] - b.contribution[key]);
      }
      return 0;
    });
  }, [filtered, sortKey, sortDir, viewMode]);

  const handleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortIndicator = (key: string) => (key === sortKey ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Player Points Table</h1>
        <p className="text-sm text-ink-500 mt-1">
          Every player, one row each, across the gameweek range below. Actual points where a fixture&rsquo;s been played, the
          model&rsquo;s projection otherwise. Switch to the contribution view to see those points broken down by source (goals,
          assists, bonus, etc.) instead of totals.
        </p>
      </div>

      <div className="bg-white border border-chalk-300 rounded-lg p-3">
        <GameweekRangeFilter defaultGw={defaultGw} fromGw={fromMatchweek} toGw={toMatchweek} onChange={(f, t) => { setFromMatchweek(f); setToMatchweek(t); }} initialPreset="next5" />
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white border border-chalk-300 rounded-lg px-3 py-2">
        <div className="flex rounded-lg border border-chalk-300 overflow-hidden">
          <button
            type="button"
            onClick={() => {
              setViewMode('by_gameweek');
              setSortKey('total');
            }}
            className={['px-3 py-1.5 text-xs font-medium transition-colors', viewMode === 'by_gameweek' ? 'bg-pitch-800 text-white' : 'bg-white text-ink-700 hover:bg-chalk-100'].join(' ')}
          >
            By gameweek
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('by_contribution');
              setSortKey('total');
            }}
            className={['px-3 py-1.5 text-xs font-medium transition-colors', viewMode === 'by_contribution' ? 'bg-pitch-800 text-white' : 'bg-white text-ink-700 hover:bg-chalk-100'].join(' ')}
          >
            By contribution
          </button>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={'Search player\u2026'}
          className="px-2 py-1 text-xs rounded border border-chalk-300 bg-white text-ink-900 placeholder:text-ink-500 w-36"
        />
        <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="px-2 py-1 text-xs rounded border border-chalk-300 bg-white text-ink-900">
          <option value="all">All positions</option>
          {(Object.entries(FPL_POSITION_LABEL) as [string, string][]).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="px-2 py-1 text-xs rounded border border-chalk-300 bg-white text-ink-900">
          <option value="all">All teams</option>
          {teamOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-500 ml-auto">{sorted.length} players</span>
      </div>

      {error && <p className="text-loss-700 text-sm">{error}</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">{'Loading\u2026'}</p>}

      {!loading && !error && (
        <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-ink-500 border-b border-chalk-300 bg-chalk-100">
                  <th className="px-3 py-2 cursor-pointer whitespace-nowrap" onClick={() => handleSort('web_name')}>
                    Player {sortIndicator('web_name')}
                  </th>
                  <th className="px-2 py-2 whitespace-nowrap">Team</th>
                  <th className="px-2 py-2 whitespace-nowrap">Pos</th>
                  <th className="px-2 py-2 text-right cursor-pointer whitespace-nowrap" onClick={() => handleSort('price')}>
                    Price {sortIndicator('price')}
                  </th>
                  <th className="px-2 py-2 text-right cursor-pointer whitespace-nowrap" onClick={() => handleSort('value')} title="Total points / price -- points per \u00a3m">
                    Value {sortIndicator('value')}
                  </th>
                  {viewMode === 'by_gameweek' &&
                    matchweeks.map((mw) => (
                      <th key={mw} className="px-2 py-2 text-right cursor-pointer whitespace-nowrap" onClick={() => handleSort(`mw:${mw}`)}>
                        GW{mw} {sortIndicator(`mw:${mw}`)}
                      </th>
                    ))}
                  {viewMode === 'by_contribution' &&
                    CONTRIBUTION_COLUMNS.map((c) => (
                      <th key={c.key} className="px-2 py-2 text-right cursor-pointer whitespace-nowrap" onClick={() => handleSort(c.key)}>
                        {c.label} {sortIndicator(c.key)}
                      </th>
                    ))}
                  <th className="px-3 py-2 text-right cursor-pointer whitespace-nowrap" onClick={() => handleSort('total')}>
                    Total {sortIndicator('total')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.fpl_player_id} className="border-b border-chalk-200 last:border-b-0 hover:bg-chalk-100 transition-colors">
                    <td className="px-3 py-1.5 font-medium text-ink-900 whitespace-nowrap">{r.web_name}</td>
                    <td className="px-2 py-1.5 text-xs text-ink-700 whitespace-nowrap">{r.team_name}</td>
                    <td className="px-2 py-1.5 font-mono text-xs text-ink-700">{r.fpl_position_label}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{r.price !== null ? `\u00a3${r.price.toFixed(1)}m` : '\u2014'}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">
                      {r.price !== null && r.price > 0 ? (r.total / r.price).toFixed(2) : '\u2014'}
                    </td>
                    {viewMode === 'by_gameweek' &&
                      matchweeks.map((mw) => {
                        const cell = r.byMatchweek.get(mw);
                        if (!cell || (cell.actual === null && cell.projected === null)) {
                          return (
                            <td key={mw} className="px-2 py-1.5 text-right font-mono text-xs text-ink-500">
                              {'\u2014'}
                            </td>
                          );
                        }
                        const isActual = cell.actual !== null;
                        const value = cell.actual ?? cell.projected;
                        return (
                          <td key={mw} className={['px-2 py-1.5 text-right font-mono text-xs', isActual ? 'text-ink-900 font-semibold' : 'text-ink-500 italic'].join(' ')} title={isActual ? 'Actual' : 'Projected'}>
                            {value!.toFixed(1)}
                          </td>
                        );
                      })}
                    {viewMode === 'by_contribution' &&
                      CONTRIBUTION_COLUMNS.map((c) => (
                        <td key={c.key} className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">
                          {r.contribution[c.key].toFixed(2)}
                        </td>
                      ))}
                    <td className="px-3 py-1.5 text-right font-mono text-sm font-semibold text-pitch-800">{r.total.toFixed(1)}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={5 + matchweeks.length + 1} className="px-3 py-6 text-center text-sm text-ink-500">
                      No players match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[11px] text-ink-500 border-t border-chalk-200 bg-chalk-100">
            <span className="font-semibold text-ink-900">Bold</span> = actual points (fixture played). <span className="italic">Italic</span> = model projection (not yet
            played). Contribution columns use real stats (official 2025/26 FPL scoring rules) for played gameweeks and the
            model&rsquo;s own breakdown for weeks not yet played, summed across the range -- same actual-over-projected choice as the
            totals column.
          </div>
        </div>
      )}
    </div>
  );
}
