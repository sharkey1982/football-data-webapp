// ============================================================================
// src/pages/fpl/OptimalSquadPage.tsx
//
// Frontend for the fpl-optimize-squad Edge Function (v1.6). Consumes the
// backend result as-is -- no replacement optimisation logic here.
//
// v1.6 has no single squad-wide starting XI/formation/bench -- the best
// legal XI and formation are chosen INDEPENDENTLY for each gameweek in the
// range (weekly_plan), since the model finds the genuinely best XI per
// week rather than assuming one fixed shape holds throughout. The pitch
// below shows the EARLIEST requested gameweek's XI (the most immediately
// actionable one); the weekly table shows every week's own formation,
// captain, and vice-captain so a multi-GW result doesn't silently hide
// that the XI can change week to week.
// ============================================================================

import { trackEvent } from '../../lib/analytics';
import { useEffect, useState } from 'react';
import { optimizeFplSquad, OPTIMIZER_POSITION_LABEL, type FplOptimizerPlayer, type FplOptimizerResult } from '../../lib/fplOptimizerApi';
import { getDefaultMatchweek, getGameweekInPlay } from '../../lib/fplSeasonApi';
import WeeklySquadView from '../../components/fpl/WeeklySquadView';
import GameweekRangeFilter from '../../components/fpl/GameweekRangeFilter';
import { getSquadPitchEnrichment } from '../../lib/fplApi';
import { listScoutPlayers, POSITION, type ScoutListPlayer } from '../../lib/playerScoutApi';
import { getErrorMessage } from '../../lib/errorMessage';

const MAX_RANGE_SPAN = 9; // to - from, matching the backend's own 10-GW cap

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
  // The gameweek in play, if any -- the range filter offers to leave it out.
  const [inPlay, setInPlay] = useState<{ gw: number; played: number; total: number } | null>(null);
  useEffect(() => {
    getGameweekInPlay().then(setInPlay).catch(() => setInPlay(null));
  }, []);
  const [fromGw, setFromGw] = useState<number | null>(null);
  const [toGw, setToGw] = useState<number | null>(null);
  const [budgetInput, setBudgetInput] = useState('100.0');

  const [result, setResult] = useState<FplOptimizerResult | null>(null);
  // Forced picks. Held as full player objects, not bare ids, so the
  // chips can show who was chosen without a second lookup.
  const [mustInclude, setMustInclude] = useState<ScoutListPlayer[]>([]);
  const [mustExclude, setMustExclude] = useState<ScoutListPlayer[]>([]);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<ScoutListPlayer[]>([]);
  const [pickerMode, setPickerMode] = useState<'include' | 'exclude'>('include');
  // What the solve was ASKED for, captured at run time. The result is
  // checked against this rather than against current state, which the
  // user may have edited since.
  const [ranWith, setRanWith] = useState<{ include: ScoutListPlayer[]; exclude: ScoutListPlayer[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // getDefaultMatchweek() now guards against the exact failure this
    // comment used to warn about (a played fixture whose status never got
    // updated, pointing this page at a gameweek with no projection data)
    // -- it's backed by a function that falls back to the nearest
    // gameweek WITH data if the genuinely-next one hasn't been generated
    // yet. Every page now shares this one canonical source.
    getDefaultMatchweek()
      .then((gw) => {
        if (cancelled) return;
        const fallback = gw ?? 1;
        setDefaultGw(fallback);
        setFromGw(fallback);
        setToGw(fallback);
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

  useEffect(() => {
    if (pickerQuery.trim().length < 2) {
      setPickerResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      listScoutPlayers({ search: pickerQuery, limit: 8 })
        .then((r) => !cancelled && setPickerResults(r))
        .catch(() => !cancelled && setPickerResults([]));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pickerQuery]);

  function addForced(p: ScoutListPlayer) {
    // A player can't be both forced in and forced out, so adding to one
    // list removes them from the other rather than leaving a
    // contradiction for the solver to trip over.
    setMustInclude((cur) =>
      pickerMode === 'include'
        ? cur.some((x) => x.fpl_player_id === p.fpl_player_id) ? cur : [...cur, p]
        : cur.filter((x) => x.fpl_player_id !== p.fpl_player_id)
    );
    setMustExclude((cur) =>
      pickerMode === 'exclude'
        ? cur.some((x) => x.fpl_player_id === p.fpl_player_id) ? cur : [...cur, p]
        : cur.filter((x) => x.fpl_player_id !== p.fpl_player_id)
    );
    setPickerQuery('');
    setPickerResults([]);
  }

  async function handleOptimize() {
    if (!rangeValid || !budgetValid || fromGw === null || toGw === null) return;
    setLoading(true);
    setError(null);
    setHasRun(true);
    try {
      setRanWith({ include: mustInclude, exclude: mustExclude });
      const data = await optimizeFplSquad(
        fromGw,
        toGw,
        budget,
        mustInclude.map((p) => p.fpl_player_id),
        mustExclude.map((p) => p.fpl_player_id)
      );
      setResult(data);
      // Inside the try and AFTER the await resolves, so a failed
      // optimisation can't be counted as a success. Params are the run's
      // own settings -- nothing user-identifying.
      trackEvent('optimiser_run', { from_gameweek: fromGw, to_gameweek: toGw, budget });
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to optimise squad'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const isMultiGw = result !== null && result.weeks.length > 1;

  // squad has no starter/bench label of its own; WeeklySquadView derives
  // membership per-week by name match against that week's weekly_plan.xi,
  // and captain/vice per-week straight from that week's own captain/
  // vice_captain fields -- no page-level computation needed.

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Optimiser</h1>
        <p className="text-sm text-ink-500 mt-1">
          The best 15-player FPL squad for a gameweek range, within budget &mdash; built by the backend optimiser, not
          recomputed here.
        </p>
      </div>

      <div className="bg-white border border-chalk-300 rounded-lg p-3 space-y-3">
        <GameweekRangeFilter
          inPlay={inPlay}
          defaultGw={defaultGw}
          fromGw={fromGw}
          toGw={toGw}
          onChange={(f, t) => { setFromGw(f); setToGw(t); }}
          maxRangeSpan={MAX_RANGE_SPAN}
          presets={['this', 'next', 'next10', 'custom']}
        />

        <div className="flex flex-wrap items-end gap-4">
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
          {/* Forced picks. The edge function has accepted
              must_include_ids / must_exclude_ids all along but nothing
              ever sent them, so this is also the first test of whether
              it honours them -- see the check below the result. */}
          <div className="border border-chalk-300 rounded-lg bg-white p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Force</span>
              {(['include', 'exclude'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPickerMode(m)}
                  className={[
                    'px-3 py-1 text-sm rounded border transition-colors',
                    pickerMode === m
                      ? 'bg-pitch-800 text-chalk-100 border-pitch-800'
                      : 'bg-white text-ink-700 border-chalk-300 hover:bg-chalk-100',
                  ].join(' ')}
                >
                  {m === 'include' ? 'Must pick' : 'Never pick'}
                </button>
              ))}
              <input
                type="search"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder={pickerMode === 'include' ? 'Player to force in…' : 'Player to rule out…'}
                className="border border-chalk-300 rounded px-3 py-1.5 text-sm flex-1 min-w-[10rem]"
              />
            </div>

            {pickerResults.length > 0 && (
              <ul className="border border-chalk-300 rounded divide-y divide-chalk-200">
                {pickerResults.map((p) => (
                  <li key={p.fpl_code}>
                    <button
                      type="button"
                      onClick={() => addForced(p)}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-chalk-100"
                    >
                      {p.web_name} <span className="text-ink-500 text-xs">{POSITION[p.element_type]} · {p.team_name}</span>
                      <span className="text-ink-500 text-xs font-mono float-right">
                        {p.now_cost != null ? `£${(p.now_cost / 10).toFixed(1)}m` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {(mustInclude.length > 0 || mustExclude.length > 0) && (
              <div className="space-y-1.5">
                {([['Must pick', mustInclude, setMustInclude], ['Never pick', mustExclude, setMustExclude]] as const).map(
                  ([label, list, setter]) =>
                    list.length > 0 && (
                      <div key={label} className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-ink-500 w-20 shrink-0">{label}</span>
                        {list.map((p) => (
                          <button
                            key={p.fpl_code}
                            type="button"
                            onClick={() => setter((cur) => cur.filter((x) => x.fpl_player_id !== p.fpl_player_id))}
                            className={[
                              'px-2 py-0.5 text-xs rounded-full border',
                              label === 'Must pick'
                                ? 'border-pitch-700 text-pitch-800 bg-pitch-50'
                                : 'border-loss-700 text-loss-700 bg-loss-700/5',
                            ].join(' ')}
                            title="Remove"
                          >
                            {p.web_name} ×
                          </button>
                        ))}
                      </div>
                    )
                )}
                {/* Forced-in players consume budget and squad slots before
                    the solve, so say what's left rather than letting a
                    failure explain it. */}
                <p className="text-xs text-ink-500">
                  {mustInclude.length > 0 && (
                    <>
                      Forcing in {mustInclude.length} player{mustInclude.length === 1 ? '' : 's'} costing{' '}
                      £{(mustInclude.reduce((t, p) => t + (p.now_cost ?? 0), 0) / 10).toFixed(1)}m of your £
                      {budget.toFixed(1)}m.{' '}
                    </>
                  )}
                  {mustExclude.length > 0 && <>Ruling out {mustExclude.length}.</>}
                </p>
              </div>
            )}
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

        <p className="text-xs text-ink-500 bg-chalk-100 border border-chalk-300 rounded px-2.5 py-1.5">
          This picks the single best 15-player squad to hold across the whole selected range &mdash; it does not
          simulate making transfers between gameweeks. The best starting XI and formation are chosen independently
          each gameweek within that fixed squad, so the XI shown can vary week to week even though the 15 players
          don&rsquo;t. Wildcard, Free Hit, and transfer-from-an-existing-squad modes aren&rsquo;t available yet.
        </p>
      </div>

      {loading && <p className="text-ink-500 font-mono text-sm">Optimising squad&hellip; this can take a few seconds.</p>}
      {!loading && error && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}
      {!loading && !error && hasRun && !result && <p className="text-ink-500 text-sm">No result returned.</p>}

      {/* DID IT ACTUALLY OBEY? The edge function's source isn't in this
          repo, so "it honours must_include_ids" was an assumption until
          something checked. Rather than trust it, the page compares the
          squad it got back against what it asked for and says plainly
          whether the constraint held. If this ever reads "ignored", the
          picker above is decoration and the fix belongs in the edge
          function. */}
      {!loading && !error && result && ranWith && (ranWith.include.length > 0 || ranWith.exclude.length > 0) && (() => {
        const picked = new Set(result.squad.map((p) => p.id));
        const missing = ranWith.include.filter((p) => !picked.has(p.fpl_player_id));
        const sneaked = ranWith.exclude.filter((p) => picked.has(p.fpl_player_id));
        const honoured = missing.length === 0 && sneaked.length === 0;
        return (
          <div
            className={`border rounded-lg p-3 text-sm ${
              honoured ? 'border-pitch-700 bg-pitch-50 text-ink-900' : 'border-loss-700 bg-loss-700/5 text-ink-900'
            }`}
          >
            <strong>{honoured ? 'Constraints honoured.' : 'Constraints NOT honoured.'}</strong>{' '}
            {honoured ? (
              <>
                All {ranWith.include.length} forced pick{ranWith.include.length === 1 ? '' : 's'} appear
                {ranWith.include.length === 1 ? 's' : ''} in the squad
                {ranWith.exclude.length > 0 && <>, and none of the {ranWith.exclude.length} ruled out did</>}.
              </>
            ) : (
              <>
                {missing.length > 0 && <>Forced in but absent: {missing.map((p) => p.web_name).join(', ')}. </>}
                {sneaked.length > 0 && <>Ruled out but selected: {sneaked.map((p) => p.web_name).join(', ')}. </>}
                The optimiser ignored part of the request.
              </>
            )}
          </div>
        );
      })()}

      {!loading && !error && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-chalk-300 rounded-lg p-3">
              <div className="text-xs text-ink-500">Squad cost</div>
              <div className="text-lg font-display text-ink-900">&pound;{result.budget_used.toFixed(1)}m</div>
            </div>
            <div className="bg-white border border-chalk-300 rounded-lg p-3">
              <div className="text-xs text-ink-500">Money in bank</div>
              <div className="text-lg font-display text-ink-900">&pound;{result.bank.toFixed(1)}m</div>
            </div>
            <div className="bg-white border border-chalk-300 rounded-lg p-3">
              <div
                className="text-xs text-ink-500"
                title="Sum of each gameweek's best-XI points, captaincy bonus, and auto-substitution EV -- not simply the sum of all 15 players' points"
              >
                Total projected points{isMultiGw ? ` (GW${result.from_matchweek}\u2013${result.to_matchweek})` : ''}
              </div>
              <div className="text-lg font-display text-pitch-800">{result.objective_xpts.toFixed(1)}</div>
            </div>
          </div>

          {isMultiGw && (
            <p className="text-xs text-ink-500">
              Formation and starting XI are chosen independently each gameweek &mdash; use the GW tabs below to see how the
              lineup changes, or switch to the Table view for the whole picture at once.
            </p>
          )}
          <WeeklySquadView
            squad={result.squad}
            weeklyPlan={result.weekly_plan}
            fetchEnrichment={getSquadPitchEnrichment}
          />

          {isMultiGw && (
            <div>
              <h2 className="font-display uppercase tracking-wide text-sm text-ink-500 mb-2">Weekly plan</h2>
              <p className="text-xs text-ink-500 mb-1">Formation, captain, and vice-captain are chosen independently each gameweek.</p>
              <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-chalk-100 text-ink-500">
                      <tr>
                        <th className="text-left font-medium text-xs px-3 py-1.5 whitespace-nowrap">GW</th>
                        <th className="text-left font-medium text-xs px-2 py-1.5 whitespace-nowrap">Formation</th>
                        <th className="text-left font-medium text-xs px-2 py-1.5 whitespace-nowrap">Captain</th>
                        <th className="text-left font-medium text-xs px-2 py-1.5 whitespace-nowrap">Vice-captain</th>
                        <th className="text-right font-medium text-xs px-2 py-1.5 whitespace-nowrap">XI xPts</th>
                        <th className="text-right font-medium text-xs px-3 py-1.5 whitespace-nowrap">Captaincy EV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.weekly_plan.map((w, i) => (
                        <tr key={w.matchweek} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                          <td className="px-3 py-1.5 font-mono text-xs text-ink-700 whitespace-nowrap">GW{w.matchweek}</td>
                          <td className="px-2 py-1.5 font-mono text-xs text-ink-700 whitespace-nowrap">{w.formation}</td>
                          <td className="px-2 py-1.5 font-medium text-ink-900 whitespace-nowrap">{w.captain}</td>
                          <td className="px-2 py-1.5 text-ink-700 whitespace-nowrap">{w.vice_captain}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700 whitespace-nowrap">{w.xi_xpts.toFixed(1)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs text-pitch-800 font-semibold whitespace-nowrap">{w.captain_extra_ev.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div>
            <h2 className="font-display uppercase tracking-wide text-sm text-ink-500 mb-2">Full 15-man squad</h2>
            <SquadTable players={result.squad} />
          </div>
        </div>
      )}
    </div>
  );
}
