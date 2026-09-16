// ============================================================================
// src/components/fpl/BenchStrip.tsx
//
// Extracted from OptimalSquadPage.tsx (was a local function there) so the
// hindsight-optimal page can reuse it without duplicating the bench-order
// logic or styling.
// ============================================================================

import type { FplOptimizerPlayer } from '../../lib/fplOptimizerApi';
import { OPTIMIZER_POSITION_LABEL } from '../../lib/fplOptimizerApi';

export default function BenchStrip({ bench, benchOrder }: { bench: FplOptimizerPlayer[]; benchOrder: string[] }) {
  // bench_order (non-GK auto-sub priority) drives display order where a
  // player appears in it; the bench GK (never in bench_order) goes last.
  const ordered = [...bench].sort((a, b) => {
    const ai = benchOrder.indexOf(a.name);
    const bi = benchOrder.indexOf(b.name);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return (
    <div className="border border-chalk-300 rounded-lg bg-chalk-100 p-3">
      <h3 className="font-display uppercase tracking-wide text-xs text-ink-500 mb-2">Bench</h3>
      <div className="flex flex-wrap gap-3">
        {ordered.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 bg-white border border-chalk-300 rounded-lg px-2.5 py-1.5">
            <span className="w-6 h-6 rounded-full bg-chalk-300 text-ink-700 flex items-center justify-center text-[10px] font-mono font-semibold">
              {p.position === 1 ? 'GK' : i}
            </span>
            <div className="text-xs">
              <div className="font-medium text-ink-900">{p.name}</div>
              <div className="text-ink-500 font-mono">
                {OPTIMIZER_POSITION_LABEL[p.position]} &middot; {p.team} &middot; &pound;{p.price.toFixed(1)}m
              </div>
            </div>
            <span className="text-xs font-mono text-pitch-800 font-semibold ml-1">{p.total_xpts.toFixed(1)}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink-500 mt-2">
        Bench picks are deliberately biased toward cheap, reliably-playing options over higher-projected players &mdash;
        the budget saved there goes into a stronger starting XI. A &pound;4.0m defender who nails on is often the right
        bench pick even with modest points on its own. Numbers show auto-substitution priority (GK excluded, since it
        only comes on for the starting keeper).
      </p>
    </div>
  );
}
