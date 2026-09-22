// ============================================================================
// src/components/fpl/WeeklySquadView.tsx
//
// Shared by OptimalSquadPage and HindsightOptimalSquadPage. Both show a
// single 15-man squad whose STARTING XI and formation can legitimately
// differ every requested gameweek (weekly_plan is per-week, not one fixed
// shape) -- previously each page only ever rendered the first week's XI on
// the pitch, which looked like "the team" when it was really just one
// week's specific lineup. Requested directly: a week selector so every
// week's pitch is reachable, plus a table view, rather than stacking one
// pitch per gameweek (harmless for data/compute -- the whole result is
// already loaded, no extra fetches needed for pitch data itself -- but a
// genuinely unusable amount of scrolling once a season's worth of
// gameweeks are in the result).
// ============================================================================

import { useEffect, useState } from 'react';
import type { FplOptimizerPlayer, FplOptimizerWeeklyPlan } from '../../lib/fplOptimizerApi';
import { OPTIMIZER_POSITION_LABEL, weeklyScores, weeklyDistribution } from '../../lib/fplOptimizerApi';
import SquadPitch from './SquadPitch';
import BenchStrip from './BenchStrip';
import type { SquadPitchEnrichment } from '../../lib/fplApi';
import { getPlayerSeasonPpg } from '../../lib/fplApi';

type ViewMode = 'pitch' | 'table' | 'weekly';

export default function WeeklySquadView({
  squad,
  weeklyPlan,
  /** Optional -- live page only. Called once per week the user actually
   * views (not pre-fetched for every week up front), and cached per week
   * for the lifetime of this component so revisiting an already-viewed
   * week never refetches. Keeps the (fixture-specific, sometimes slow)
   * enrichment query bounded by how many DIFFERENT weeks someone actually
   * looks at, not by how many weeks are in the result. */
  fetchEnrichment,
}: {
  squad: FplOptimizerPlayer[];
  weeklyPlan: FplOptimizerWeeklyPlan[];
  fetchEnrichment?: (matchweek: number, playerIds: number[]) => Promise<Map<number, SquadPitchEnrichment>>;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('pitch');
  const scores = weeklyScores(squad, weeklyPlan);
  const dist = weeklyDistribution(scores);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [enrichmentByWeek, setEnrichmentByWeek] = useState<Map<number, Map<number, SquadPitchEnrichment>>>(new Map());
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);

  const selectedWeek = weeklyPlan[selectedIndex] ?? weeklyPlan[0] ?? null;
  const [ppgByPlayer, setPpgByPlayer] = useState<Map<number, number | null>>(new Map());

  useEffect(() => {
    let cancelled = false;
    getPlayerSeasonPpg(squad.map((p) => p.id))
      .then((m) => {
        if (!cancelled) setPpgByPlayer(m);
      })
      .catch(() => {
        /* non-critical enrichment -- bench still renders fine without it */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squad]);

  useEffect(() => {
    if (!fetchEnrichment || !selectedWeek || viewMode !== 'pitch') return;
    if (enrichmentByWeek.has(selectedWeek.matchweek)) return; // already cached for this week
    let cancelled = false;
    setEnrichmentLoading(true);
    fetchEnrichment(
      selectedWeek.matchweek,
      squad.map((p) => p.id)
    )
      .then((map) => {
        if (cancelled) return;
        setEnrichmentByWeek((prev) => new Map(prev).set(selectedWeek.matchweek, map));
      })
      .catch(() => {
        // Presentational only -- a failed fetch just means no enrichment
        // badges for this week, never blocks the pitch itself.
        if (!cancelled) setEnrichmentByWeek((prev) => new Map(prev).set(selectedWeek.matchweek, new Map()));
      })
      .finally(() => {
        if (!cancelled) setEnrichmentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchEnrichment, selectedWeek, viewMode, squad, enrichmentByWeek]);

  if (!selectedWeek) return null;

  const xiNames = new Set(selectedWeek.xi);
  const xiPlayers = squad.filter((p) => xiNames.has(p.name));
  const benchPlayers = squad.filter((p) => !xiNames.has(p.name));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {weeklyPlan.map((w, i) => (
            <button
              key={w.matchweek}
              onClick={() => setSelectedIndex(i)}
              className={[
                'px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition-colors',
                i === selectedIndex && viewMode === 'pitch'
                  ? 'bg-pitch-700 border-pitch-700 text-chalk-100'
                  : 'bg-white border-chalk-300 text-ink-700 hover:border-pitch-600',
              ].join(' ')}
            >
              GW{w.matchweek}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-chalk-300 overflow-hidden text-xs font-medium">
          <button
            onClick={() => setViewMode('pitch')}
            className={['px-3 py-1', viewMode === 'pitch' ? 'bg-pitch-700 text-chalk-100' : 'bg-white text-ink-700'].join(' ')}
          >
            Pitch
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={['px-3 py-1', viewMode === 'table' ? 'bg-pitch-700 text-chalk-100' : 'bg-white text-ink-700'].join(' ')}
          >
            Table
          </button>
          <button
            type="button"
            onClick={() => setViewMode('weekly')}
            className={['px-3 py-1', viewMode === 'weekly' ? 'bg-pitch-700 text-chalk-100' : 'bg-white text-ink-700']
              .filter(Boolean)
              .join(' ')}
          >
            Weekly
          </button>
        </div>
      </div>

      {viewMode === 'pitch' && (
        <>
          <div>
            <h2 className="text-sm font-medium text-ink-700 mb-2">
              Starting XI (GW{selectedWeek.matchweek}, {selectedWeek.formation})
            </h2>
            {enrichmentLoading && <p className="text-xs text-ink-500 mb-2">{'Loading extra context\u2026'}</p>}
            <SquadPitch
              starters={xiPlayers}
              formation={selectedWeek.formation}
              matchweek={selectedWeek.matchweek}
              captainName={selectedWeek.captain}
              viceCaptainName={selectedWeek.vice_captain}
              enrichmentByPlayer={enrichmentByWeek.get(selectedWeek.matchweek)}
            />
          </div>
          <BenchStrip bench={benchPlayers} benchOrder={selectedWeek.bench_order} ppgByPlayer={ppgByPlayer} matchweek={selectedWeek.matchweek} />
        </>
      )}

      {viewMode === 'table' && (
        <div className="bg-white border border-chalk-300 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-ink-500 border-b border-chalk-200 bg-chalk-100">
                <th className="px-3 py-2 whitespace-nowrap sticky left-0 bg-chalk-100">Player</th>
                <th className="px-2 py-2 whitespace-nowrap">Pos</th>
                {weeklyPlan.map((w) => (
                  <th key={w.matchweek} className="px-2 py-2 text-center whitespace-nowrap">
                    GW{w.matchweek}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {squad
                .slice()
                .sort((a, b) => a.position - b.position || b.total_xpts - a.total_xpts)
                .map((p) => (
                  <tr key={p.id} className="border-b border-chalk-200 last:border-b-0">
                    <td className="px-3 py-1.5 font-medium text-ink-900 whitespace-nowrap sticky left-0 bg-white">{p.name}</td>
                    <td className="px-2 py-1.5 font-mono text-xs text-ink-700">{OPTIMIZER_POSITION_LABEL[p.position]}</td>
                    {weeklyPlan.map((w) => {
                      const started = w.xi.includes(p.name);
                      const isCaptain = w.captain === p.name;
                      const isVice = w.vice_captain === p.name;
                      const pts = p.gw_xpts[w.matchweek];
                      return (
                        <td key={w.matchweek} className="px-2 py-1.5 text-center font-mono text-xs">
                          {started ? (
                            <span className={isCaptain ? 'text-amber-600 font-bold' : 'text-ink-900'}>
                              {pts !== undefined ? pts.toFixed(0) : '\u2014'}
                              {isCaptain ? ' (C)' : isVice ? ' (V)' : ''}
                            </span>
                          ) : (
                            <span className="text-ink-500">bench</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-chalk-300 bg-chalk-50 font-medium">
                <td className="px-3 py-2 text-ink-900 whitespace-nowrap sticky left-0 bg-chalk-50">Gameweek total</td>
                <td className="px-2 py-2" />
                {scores.map((s) => (
                  <td key={s.matchweek} className="px-2 py-2 text-center font-mono text-xs text-ink-900">
                    {s.total}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {viewMode === 'weekly' && (
        <div className="space-y-4">
          {dist && (
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
              {[
                ['Best week', `${dist.max}`, dist.bestWeek ? `GW${dist.bestWeek}` : ''],
                ['Worst week', `${dist.min}`, dist.worstWeek ? `GW${dist.worstWeek}` : ''],
                ['Average', dist.mean.toFixed(0), `over ${dist.weeks} weeks`],
                ['Spread', `\u00b1${dist.stdDev.toFixed(0)}`, 'standard deviation'],
              ].map(([label, value, note]) => (
                <div key={label} className="border border-chalk-300 rounded-lg bg-white p-2">
                  <div className="text-[11px] text-ink-500">{label}</div>
                  <div className="font-display text-xl text-ink-900">{value}</div>
                  <div className="text-[11px] text-ink-500">{note}</div>
                </div>
              ))}
            </div>
          )}
          <div className="bg-white border border-chalk-300 rounded-lg p-3 space-y-2">
            {scores.map((s) => {
              const max = Math.max(...scores.map((x) => x.total), 1);
              return (
                <div key={s.matchweek} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-xs text-ink-500">GW{s.matchweek}</span>
                  <div className="flex-1 bg-chalk-100 rounded h-5 overflow-hidden flex">
                    <div className="h-full bg-pitch-700" style={{ width: `${(s.xiPoints / max) * 100}%` }} title="starting XI" />
                    <div className="h-full bg-amber-400" style={{ width: `${(s.captainExtra / max) * 100}%` }} title="captain, doubled" />
                  </div>
                  <span className="w-10 text-right font-mono text-xs text-ink-900">{s.total}</span>
                </div>
              );
            })}
            <p className="text-[11px] text-ink-500 pt-1">
              Green is the starting XI; amber is the captain&rsquo;s points counted a second time.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
