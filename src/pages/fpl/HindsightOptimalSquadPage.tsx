// ============================================================================
// src/pages/fpl/HindsightOptimalSquadPage.tsx
//
// The genuinely optimal squad for gameweeks already played -- built from
// REAL results (fpl_player_gameweeks.total_points), not projections.
// Entirely read-only: a scheduled job (scripts/solve-hindsight-optimal.ts)
// solves this and stores it in fpl_hindsight_optimal_squad; this page just
// displays whatever it last computed. Deliberately decoupled from
// projection quality -- this answers "what was the best possible use of
// the budget, given what actually happened", not "what will happen".
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { getHindsightOptimalSquad, type FplHindsightResult } from '../../lib/fplOptimizerApi';
import WeeklySquadView from '../../components/fpl/WeeklySquadView';
import { getErrorMessage } from '../../lib/errorMessage';

export default function HindsightOptimalSquadPage() {
  const [result, setResult] = useState<FplHindsightResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHindsightOptimalSquad()
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load the hindsight-optimal squad'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const captainWeeksByPlayer = useMemo(() => {
    const map = new Map<number, number[]>();
    if (!result) return map;
    result.weekly_plan.forEach((w, i) => {
      const player = result.squad.find((p) => p.name === w.captain);
      if (player) map.set(player.id, [...(map.get(player.id) ?? []), i + 1]);
    });
    return map;
  }, [result]);
  const viceWeeksByPlayer = useMemo(() => {
    const map = new Map<number, number[]>();
    if (!result) return map;
    result.weekly_plan.forEach((w, i) => {
      const player = result.squad.find((p) => p.name === w.vice_captain);
      if (player) map.set(player.id, [...(map.get(player.id) ?? []), i + 1]);
    });
    return map;
  }, [result]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Optimal Squad So Far</h1>
        <p className="text-sm text-ink-500 mt-1">
          The genuinely best possible squad for the season so far, within &pound;100m &mdash; built from real points
          actually scored, not projections. Formation and starting XI are chosen independently each gameweek (that's
          allowed under real FPL rules, free of charge) &mdash; use the GW tabs below to see how the lineup actually
          changed week to week, or switch to the Table view for the whole picture at once. This is a hindsight
          hypothetical benchmark, not a recommendation for what to do next.
        </p>
      </div>

      {loading && <p className="text-ink-500 font-mono text-sm">{'Loading\u2026'}</p>}
      {error && <p className="text-loss-700 text-sm">{error}</p>}

      {!loading && !error && !result && (
        <p className="text-sm text-ink-500">Nothing computed yet &mdash; check back once a gameweek has been played.</p>
      )}

      {!loading && !error && result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-chalk-300 rounded-lg px-3 py-2">
              <div className="text-xs text-ink-500 uppercase tracking-wide">Gameweeks</div>
              <div className="text-lg font-display text-ink-900">
                GW{result.from_matchweek}
                {result.to_matchweek !== result.from_matchweek ? `\u2013${result.to_matchweek}` : ''}
              </div>
            </div>
            <div className="bg-white border border-chalk-300 rounded-lg px-3 py-2">
              <div className="text-xs text-ink-500 uppercase tracking-wide">Points</div>
              <div className="text-lg font-display text-pitch-800">{result.objective_points.toFixed(0)}</div>
            </div>
            <div className="bg-white border border-chalk-300 rounded-lg px-3 py-2">
              <div className="text-xs text-ink-500 uppercase tracking-wide">Budget used</div>
              <div className="text-lg font-display text-ink-900">&pound;{result.budget_used.toFixed(1)}m</div>
            </div>
            <div className="bg-white border border-chalk-300 rounded-lg px-3 py-2">
              <div className="text-xs text-ink-500 uppercase tracking-wide">Solver</div>
              <div className="text-lg font-display text-ink-900">{result.solver_status}</div>
            </div>
          </div>

          <WeeklySquadView
            squad={result.squad}
            weeklyPlan={result.weekly_plan}
            captainWeeksByPlayer={captainWeeksByPlayer}
            viceWeeksByPlayer={viceWeeksByPlayer}
          />

          <div className="text-[11px] text-ink-500 space-y-1">
            {result.notes.map((n, i) => (
              <p key={i}>&bull; {n}</p>
            ))}
            <p>Computed {new Date(result.computed_at).toLocaleString('en-GB')}.</p>
          </div>
        </>
      )}
    </div>
  );
}
