// ============================================================================
// src/pages/fpl/OptimalSquadPage.tsx
//
// Frontend for the fpl-optimize-squad Edge Function. Consumes the backend
// result as-is -- no replacement optimisation logic here. See
// src/lib/fplOptimizerApi.ts for the exact request/response shape, read
// directly from the deployed function source.
// ============================================================================

import { useEffect, useState } from 'react';
import { getDefaultMatchweek } from '../../lib/fplSeasonApi';
import { optimizeFplSquad, OPTIMIZER_POSITION_LABEL, type FplOptimizerPlayer, type FplOptimizerResult } from '../../lib/fplOptimizerApi';
import SquadPitch from '../../components/fpl/SquadPitch';
import { getErrorMessage } from '../../lib/errorMessage';

type Preset = 'this' | 'next3' | 'next5' | 'custom';

const MAX_RANGE_SPAN = 9; // to - from, matching the backend's own 10-GW cap

function BenchStrip({ bench }: { bench: FplOptimizerPlayer[] }) {
  return (
    <div className="border border-chalk-300 rounded-lg bg-chalk-100 p-3">
      <h3 className="font-display uppercase tracking-wide text-xs text-ink-500 mb-2">Bench</h3>
      <div className="flex flex-wrap gap-3">
        {bench.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 bg-white border border-chalk-300 rounded-lg px-2.5 py-1.5">
            <span className="w-6 h-6 rounded-full bg-chalk-300 text-ink-700 flex items-center justify-center text-[10px] font-mono font-semibold">
              {i + 1}
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
        bench pick even with modest points on its own.
      </p>
    </div>
  );
}

function SquadTable({ players }: { players: FplOptimizerPlayer[] }) {
  const weeks = players.length > 0 ? Object.keys(players[0].gw_xpts).map(Number).sort((a, b) => a - b) : [];
  return (
    <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-chalk-100 text-ink-500">
            <tr>
              <th className="text-left font-medium text-xs px-3 py-1.5">Player</th>
              <th className="text-left font-medium text-xs px-2 py-1.5">Club</th>
              <th className="text-left font-medium text-xs px-2 py-1.5">Pos</th>
              <th className="text-right font-medium text-xs px-2 py-1.5">Price</th>
              {weeks.length > 1 &&
                weeks.map((w) => (
                  <th key={w} className="text-right font-medium text-xs px-2 py-1.5">
                    GW{w}
                  </th>
                ))}
              <th className="text-right font-medium text-xs px-3 py-1.5">Total xPts</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.id} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                <td className="px-3 py-1.5 font-medium text-ink-900">{p.name}</td>
                <td className="px-2 py-1.5 text-xs text-ink-700 whitespace-nowrap">{p.team}</td>
                <td className="px-2 py-1.5 font-mono text-xs text-ink-700">{OPTIMIZER_POSITION_LABEL[p.position]}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">&pound;{p.price.toFixed(1)}m</td>
                {weeks.length > 1 &&
                  weeks.map((w) => (
                    <td key={w} className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">
                      {(p.gw_xpts[w] ?? 0).toFixed(1)}
                    </td>
                  ))}
                <td className="px-3 py-1.5 text-right font-mono text-sm font-semibold text-pitch-800">{p.total_xpts.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OptimalSquadPage() {
  const [defaultGw, setDefaultGw] = useState<number | null>(null);
  const [preset, setPreset] = useState<Preset>('this');
  const [fromGw, setFromGw] = useState<number | null>(null);
  const [toGw, setToGw] = useState<number | null>(null);
  const [budgetInput, setBudgetInput] = useState('100.0');

  const [result, setResult] = useState<FplOptimizerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDefaultMatchweek()
      .then((gw) => {
        if (cancelled) return;
        setDefaultGw(gw);
        setFromGw(gw);
        setToGw(gw);
      })
      .catch(() => {
        if (!cancelled) {
          setDefaultGw(1);
          setFromGw(1);
          setToGw(1);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (defaultGw === null) return;
    if (p === 'this') {
      setFromGw(defaultGw);
      setToGw(defaultGw);
    } else if (p === 'next3') {
      setFromGw(defaultGw);
      setToGw(defaultGw + 2);
    } else if (p === 'next5') {
      setFromGw(defaultGw);
      setToGw(defaultGw + 4);
    }
    // 'custom' leaves whatever the person has already set via the number inputs.
  }

  const budget = Number(budgetInput);
  const rangeValid =
    fromGw !== null &&
    toGw !== null &&
    Number.isInteger(fromGw) &&
    Number.isInteger(toGw) &&
    fromGw >= 1 &&
    toGw >= fromGw &&
    toGw - fromGw <= MAX_RANGE_SPAN;
  const budgetValid = Number.isFinite(budget) && budget > 0;

  async function handleOptimize() {
    if (!rangeValid || !budgetValid || fromGw === null || toGw === null) return;
    setLoading(true);
    setError(null);
    setHasRun(true);
    try {
      const data = await optimizeFplSquad(fromGw, toGw, budget);
      setResult(data);
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to optimise squad'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const isMultiGw = result !== null && result.weeks.length > 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Optimal Squad</h1>
        <p className="text-sm text-ink-500 mt-1">
          The best 15-player FPL squad for a gameweek range, within budget &mdash; built by the backend optimiser, not
          recomputed here.
        </p>
      </div>

      <div className="bg-white border border-chalk-300 rounded-lg p-3 space-y-3">
        <div>
          <div className="text-xs font-medium text-ink-500 mb-1">Gameweek range</div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ['this', 'This GW'],
              ['next3', 'Next 3 GWs'],
              ['next5', 'Next 5 GWs'],
              ['custom', 'Custom'],
            ] as [Preset, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={[
                  'px-3 py-1.5 text-sm font-medium rounded-md border transition-colors',
                  preset === key ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'bg-white text-ink-700 border-chalk-300 hover:bg-chalk-100',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1" htmlFor="from-gw">
              From GW
            </label>
            <input
              id="from-gw"
              type="number"
              min={1}
              value={fromGw ?? ''}
              onChange={(e) => {
                setPreset('custom');
                setFromGw(e.target.value === '' ? null : Number(e.target.value));
              }}
              className="w-20 border border-chalk-300 rounded px-2 py-1 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1" htmlFor="to-gw">
              To GW
            </label>
            <input
              id="to-gw"
              type="number"
              min={1}
              value={toGw ?? ''}
              onChange={(e) => {
                setPreset('custom');
                setToGw(e.target.value === '' ? null : Number(e.target.value));
              }}
              className="w-20 border border-chalk-300 rounded px-2 py-1 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1" htmlFor="budget">
              Budget
            </label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-ink-500">&pound;</span>
              <input
                id="budget"
                type="number"
                step="0.1"
                min={0}
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="w-20 border border-chalk-300 rounded px-2 py-1 text-sm font-mono"
              />
              <span className="text-sm text-ink-500">m</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOptimize}
            disabled={!rangeValid || !budgetValid || loading}
            className="px-4 py-2 bg-pitch-800 text-chalk-100 rounded-lg font-medium text-sm hover:bg-pitch-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Optimising\u2026' : 'Build Optimal Squad'}
          </button>
        </div>

        {!rangeValid && fromGw !== null && toGw !== null && (
          <p className="text-xs text-loss-700">
            {toGw < fromGw
              ? 'To GW must be on or after From GW.'
              : toGw - fromGw > MAX_RANGE_SPAN
                ? `Range too wide \u2014 the optimiser supports up to ${MAX_RANGE_SPAN + 1} gameweeks at once.`
                : 'Enter a valid gameweek range.'}
          </p>
        )}

        <p className="text-xs text-ink-500 bg-chalk-100 border border-chalk-300 rounded px-2.5 py-1.5">
          This picks the single best squad to hold across the whole selected range &mdash; it does not simulate making
          transfers between gameweeks. Wildcard, Free Hit, and transfer-from-an-existing-squad modes aren&rsquo;t
          available yet.
        </p>
      </div>

      {loading && <p className="text-ink-500 font-mono text-sm">Optimising squad&hellip; this can take a few seconds.</p>}
      {!loading && error && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}
      {!loading && !error && hasRun && !result && (
        <p className="text-ink-500 text-sm">No result returned.</p>
      )}

      {!loading && !error && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-chalk-300 rounded-lg p-3">
              <div className="text-xs text-ink-500">Formation</div>
              <div className="text-lg font-display text-ink-900">{result.base_formation}</div>
            </div>
            <div className="bg-white border border-chalk-300 rounded-lg p-3">
              <div className="text-xs text-ink-500">Squad cost</div>
              <div className="text-lg font-display text-ink-900">&pound;{result.budget_used.toFixed(1)}m</div>
            </div>
            <div className="bg-white border border-chalk-300 rounded-lg p-3">
              <div className="text-xs text-ink-500">Money in bank</div>
              <div className="text-lg font-display text-ink-900">&pound;{result.bank.toFixed(1)}m</div>
            </div>
            <div className="bg-white border border-chalk-300 rounded-lg p-3">
              <div className="text-xs text-ink-500" title="Starting XI expected points across the range, plus captain bonus and a small bench-value allowance -- not simply the sum of all 15 players' points">
                Total projected points{isMultiGw ? ` (GW${result.from_matchweek}\u2013${result.to_matchweek})` : ''}
              </div>
              <div className="text-lg font-display text-pitch-800">{result.objective_xpts.toFixed(1)}</div>
            </div>
          </div>

          <div>
            <h2 className="font-display uppercase tracking-wide text-sm text-ink-500 mb-2">Starting XI</h2>
            <SquadPitch
              starters={result.starting_core}
              formation={result.base_formation}
              captainId={result.weekly_plan[0] ? result.starting_core.find((p) => p.name === result.weekly_plan[0].captain)?.id : undefined}
              viceCaptainId={result.weekly_plan[0] ? result.starting_core.find((p) => p.name === result.weekly_plan[0].vice_captain)?.id : undefined}
            />
          </div>

          <BenchStrip bench={result.bench} />

          {isMultiGw && (
            <div>
              <h2 className="font-display uppercase tracking-wide text-sm text-ink-500 mb-2">Weekly captain plan</h2>
              <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-chalk-100 text-ink-500">
                    <tr>
                      <th className="text-left font-medium text-xs px-3 py-1.5">GW</th>
                      <th className="text-left font-medium text-xs px-2 py-1.5">Captain</th>
                      <th className="text-left font-medium text-xs px-2 py-1.5">Vice-captain</th>
                      <th className="text-right font-medium text-xs px-2 py-1.5">XI xPts</th>
                      <th className="text-right font-medium text-xs px-3 py-1.5">Captain xPts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.weekly_plan.map((w, i) => (
                      <tr key={w.matchweek} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                        <td className="px-3 py-1.5 font-mono text-xs text-ink-700">GW{w.matchweek}</td>
                        <td className="px-2 py-1.5 font-medium text-ink-900">{w.captain}</td>
                        <td className="px-2 py-1.5 text-ink-700">{w.vice_captain}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{w.xi_xpts.toFixed(1)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs text-pitch-800 font-semibold">{w.captain_xpts.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h2 className="font-display uppercase tracking-wide text-sm text-ink-500 mb-2">Full 15-man squad</h2>
            <SquadTable players={[...result.starting_core, ...result.bench]} />
          </div>
        </div>
      )}
    </div>
  );
}
