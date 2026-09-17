// ============================================================================
// src/pages/TeamStrengthPage.tsx
//
// Dixon-Coles team strength summary: attack/defence ratings and home
// advantage next to season-total projected goals for/against (from the
// same predictions used everywhere else on the site) alongside last
// season's actual GF/GA, so a projection that looks "off" for a team can
// be sanity-checked against what actually happened last season in one
// place, without digging through individual fixtures.
// ============================================================================

import { Fragment, useEffect, useMemo, useState } from 'react';
import { getLeagues, getTeamStrengthSummary, saveTeamStrengthOverride, type TeamStrengthSummary, type TeamStrengthRow } from '../lib/api';
import { getDefaultMatchweek } from '../lib/fplSeasonApi';
import { triggerWorkflow } from '../lib/workflowTrigger';
import { getErrorMessage } from '../lib/errorMessage';

type LeagueOption = { league_id: number; code: string; name: string; competition_type: string | null };
type SortKey = 'canonical_name' | 'attack_strength' | 'defence_strength' | 'projected_gf' | 'projected_ga' | 'last_season_gf' | 'last_season_ga' | 'projected_position_mean';

const selectClass = 'w-full sm:w-56 border border-chalk-300 rounded px-2.5 py-2 text-sm bg-white focus:border-pitch-700';

function fmt(n: number | null, digits = 2): string {
  return n === null ? '\u2014' : n.toFixed(digits);
}

export default function TeamStrengthPage() {
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [summary, setSummary] = useState<TeamStrengthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('attack_strength');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editAttack, setEditAttack] = useState('0');
  const [editDefence, setEditDefence] = useState('0');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [triggeringSim, setTriggeringSim] = useState(false);
  const [triggerSimResult, setTriggerSimResult] = useState<string | null>(null);
  const [triggeringBonus, setTriggeringBonus] = useState(false);
  const [triggerBonusResult, setTriggerBonusResult] = useState<string | null>(null);

  useEffect(() => {
    getLeagues().then((data) => {
      const loaded = ((data ?? []) as LeagueOption[]).filter((l) => l.competition_type === 'league');
      setLeagues(loaded);
      setLeagueId((current) => current ?? loaded.find((l) => l.code === 'E0')?.league_id ?? loaded[0]?.league_id ?? null);
    });
  }, []);

  useEffect(() => {
    if (leagueId === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTeamStrengthSummary(leagueId)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load team strength data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  // attack_strength/defence_strength are log-scale Dixon-Coles parameters
  // (predicted_goals = exp(home_advantage + attack_home - defence_away)) --
  // requested directly to convert both the display AND the override edit
  // form to expected goals per game against a neutral (league-average,
  // no home advantage) opponent, since raw log values gave no sense of
  // real-world scale (confirmed directly: a +0.3 attack adjustment,
  // intended as a modest nudge, was actually a 35% swing in expected
  // goals) and defence_strength's own sign is backwards from normal
  // intuition (higher = FEWER goals conceded, i.e. better).
  //
  // goalsFor = exp(attackStrength); goalsAgainst = exp(-defenceStrength)
  // (defence_strength is SUBTRACTED from the opponent's expected goals in
  // the real prediction formula, so its sign flips here too). Inverses:
  // attackStrength = ln(goalsFor); defenceStrength = -ln(goalsAgainst).
  function attackToGoalsFor(attackStrength: number): number {
    return Math.exp(attackStrength);
  }
  function defenceToGoalsAgainst(defenceStrength: number): number {
    return Math.exp(-defenceStrength);
  }
  function goalsForToAttack(goalsFor: number): number {
    return Math.log(goalsFor);
  }
  function goalsAgainstToDefence(goalsAgainst: number): number {
    return -Math.log(goalsAgainst);
  }

  function startEdit(row: TeamStrengthRow) {
    setEditingTeamId(row.team_id);
    // Pre-fill with the CURRENT EFFECTIVE value (base + any existing
    // override) in goals terms, not the raw adjustment -- editing feels
    // like "here's what it is now, change it to what you think it should
    // be" rather than needing to already know the override delta.
    const effectiveAttack = row.attack_strength + row.attack_adjustment;
    const effectiveDefence = row.defence_strength + row.defence_adjustment;
    setEditAttack(attackToGoalsFor(effectiveAttack).toFixed(2));
    setEditDefence(defenceToGoalsAgainst(effectiveDefence).toFixed(2));
    setEditNote(row.override_note ?? '');
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingTeamId(null);
    setSaveError(null);
  }

  async function handleSaveOverride(row: TeamStrengthRow) {
    const targetGoalsFor = Number(editAttack);
    const targetGoalsAgainst = Number(editDefence);
    if (!Number.isFinite(targetGoalsFor) || targetGoalsFor <= 0 || !Number.isFinite(targetGoalsAgainst) || targetGoalsAgainst <= 0) {
      setSaveError('Goals for/against must be positive numbers');
      return;
    }
    // Convert the absolute goals-per-game targets back to the additive
    // log-scale adjustments the database actually stores and applies
    // (see backfill_fixture_predictions()) -- the override table's
    // schema and the prediction formula are unchanged by this UI change,
    // only how a person specifies the value.
    const attackAdjustment = goalsForToAttack(targetGoalsFor) - row.attack_strength;
    const defenceAdjustment = goalsAgainstToDefence(targetGoalsAgainst) - row.defence_strength;

    setSaving(true);
    setSaveError(null);
    try {
      await saveTeamStrengthOverride(row.team_id, attackAdjustment, defenceAdjustment, editNote.trim() || null);
      if (leagueId !== null) setSummary(await getTeamStrengthSummary(leagueId));
      setEditingTeamId(null);
    } catch (e) {
      setSaveError(getErrorMessage(e, 'Failed to save override'));
    } finally {
      setSaving(false);
    }
  }

  /** Clears an override entirely, going through saveTeamStrengthOverride
   * with explicit zeros rather than the normal goals-target path above --
   * requested directly ("it's not clear how I change the overrides I've
   * made"), and a dedicated reset avoids a subtle rounding trap: typing
   * the model's own value back into the goals inputs and saving would
   * round-trip through toFixed(2) and back through ln(), landing a
   * hair off exact zero and leaving a negligible-but-nonzero override
   * behind instead of genuinely clearing it (saveTeamStrengthOverride's
   * clear condition checks for exact zero). */
  async function handleResetOverride(row: TeamStrengthRow) {
    setSaving(true);
    setSaveError(null);
    try {
      await saveTeamStrengthOverride(row.team_id, 0, 0, null);
      if (leagueId !== null) setSummary(await getTeamStrengthSummary(leagueId));
      setEditingTeamId(null);
    } catch (e) {
      setSaveError(getErrorMessage(e, 'Failed to reset override'));
    } finally {
      setSaving(false);
    }
  }

  async function handleRefreshFplProjections() {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const defaultGw = await getDefaultMatchweek();
      const from = defaultGw;
      const to = defaultGw + 9;
      // Triggers a GitHub Actions workflow rather than calling
      // refresh_fpl_projections_range() directly -- confirmed directly
      // this had never actually worked as a direct call: it takes ~85s
      // for a typical 10-gameweek range, but the anon/authenticated
      // roles this page connects as have a 3s/8s statement_timeout
      // respectively, so it was always killed mid-run before ever
      // reaching the user as anything but a generic failure.
      await triggerWorkflow('refresh-fpl-projections', { from_matchweek: String(from), to_matchweek: String(to) });
      setRefreshResult(`Triggered for GW${from}\u2013${to} \u2014 typically takes 1\u20132 minutes. Note: this updates FPL player projections only -- it does not re-run the bonus or finishing-position simulations, or re-solve the optimizer. Those still need their own buttons/workflows run separately.`);
    } catch (e) {
      setRefreshResult(`Failed: ${getErrorMessage(e, 'Could not trigger the refresh')}`);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleTriggerFinalTableSimulation() {
    setTriggeringSim(true);
    setTriggerSimResult(null);
    try {
      await triggerWorkflow('simulate-final-table', { season_id: '13' });
      setTriggerSimResult('Triggered \u2014 the simulation typically takes 1\u20132 minutes to complete. Reload this page after that to see updated Proj. Pos values.');
    } catch (e) {
      setTriggerSimResult(`Failed: ${getErrorMessage(e, 'Could not trigger the simulation')}`);
    } finally {
      setTriggeringSim(false);
    }
  }

  async function handleTriggerBonusSimulation() {
    setTriggeringBonus(true);
    setTriggerBonusResult(null);
    try {
      const defaultGw = await getDefaultMatchweek();
      const from = defaultGw;
      const to = defaultGw + 9;
      await triggerWorkflow('simulate-fixture-bonus', { from_matchweek: String(from), to_matchweek: String(to) });
      setTriggerBonusResult(`Triggered for GW${from}\u2013${to} \u2014 typically takes 1\u20132 minutes. Run "Refresh FPL projections" above afterwards to pick up the new bonus values.`);
    } catch (e) {
      setTriggerBonusResult(`Failed: ${getErrorMessage(e, 'Could not trigger the simulation')}`);
    } finally {
      setTriggeringBonus(false);
    }
  }

  const sortedRows = useMemo(() => {
    if (!summary) return [];
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...summary.rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' || typeof bv === 'string') return factor * String(av ?? '').localeCompare(String(bv ?? ''));
      const an = av === null ? -Infinity : av;
      const bn = bv === null ? -Infinity : bv;
      return factor * (an - bn);
    });
  }, [summary, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'canonical_name' || key === 'projected_position_mean' ? 'asc' : 'desc');
    }
  }

  const columns: { key: SortKey; label: string; title?: string }[] = [
    { key: 'canonical_name', label: 'Team' },
    {
      key: 'projected_position_mean',
      label: 'Proj. Pos',
      title: 'Mean projected final league position from a 20,000-run Monte Carlo simulation of the remaining season, using the same predicted goals as everywhere else on the site',
    },
    { key: 'attack_strength', label: 'Goals for/gm', title: 'Expected goals per game against a neutral (league-average, no home advantage) opponent. Higher = more attacking.' },
    { key: 'defence_strength', label: 'Goals against/gm', title: 'Expected goals conceded per game against a neutral (league-average, no home advantage) opponent. Lower = better defence.' },
    { key: 'projected_gf', label: 'Proj. GF', title: 'Sum of predicted goals for across every fixture this season, played and upcoming' },
    { key: 'projected_ga', label: 'Proj. GA', title: 'Sum of predicted goals against across every fixture this season, played and upcoming' },
    { key: 'last_season_gf', label: 'Last Szn GF' },
    { key: 'last_season_ga', label: 'Last Szn GA' },
  ];

  /** Per-game rate, or null if there's nothing to divide by. */
  function perGame(total: number | null, count: number): number | null {
    return total !== null && count > 0 ? total / count : null;
  }

  /** True when a saved override postdates the last position simulation
   * -- predicted_home_goals/away_goals update immediately on save, but
   * the finishing-position Monte Carlo simulation is a separate,
   * manually-triggered step that does NOT automatically re-run. */
  function isPositionStale(row: { override_updated_at: string | null; position_simulated_at: string | null }): boolean {
    if (!row.override_updated_at) return false;
    if (!row.position_simulated_at) return true;
    return new Date(row.override_updated_at) > new Date(row.position_simulated_at);
  }

  /** Live preview of what an in-progress edit actually means, now shown
   * directly in the same goals-per-game units as the input itself
   * (previously this converted a log-scale delta to a %-change, which
   * was already an improvement over nothing but still one translation
   * step removed from what's being typed). Shows the change from the
   * CURRENT effective value and where the new value would rank among
   * every other team in the currently-loaded table (summary.rows,
   * already loaded -- no extra fetch). Originally built after a +0.3
   * attack-strength adjustment, intended as a modest nudge, turned out
   * to be a 35% swing in expected goals -- the goals-based input this
   * function now supports is the actual fix for that; this preview is
   * the belt-and-braces check on top of it. */
  function overridePreview(row: TeamStrengthRow, targetGoalsForInput: string, targetGoalsAgainstInput: string): string | null {
    const targetGoalsFor = Number(targetGoalsForInput);
    const targetGoalsAgainst = Number(targetGoalsAgainstInput);
    if (!Number.isFinite(targetGoalsFor) || targetGoalsFor <= 0 || !Number.isFinite(targetGoalsAgainst) || targetGoalsAgainst <= 0) return null;

    const currentGoalsFor = attackToGoalsFor(row.attack_strength + row.attack_adjustment);
    const currentGoalsAgainst = defenceToGoalsAgainst(row.defence_strength + row.defence_adjustment);
    if (Math.abs(targetGoalsFor - currentGoalsFor) < 0.005 && Math.abs(targetGoalsAgainst - currentGoalsAgainst) < 0.005) return null;

    const effectiveAttack = goalsForToAttack(targetGoalsFor);
    const effectiveDefence = goalsAgainstToDefence(targetGoalsAgainst);
    const rows = summary?.rows ?? [];
    const attackRank = 1 + rows.filter((other) => other.team_id !== row.team_id && other.attack_strength > effectiveAttack).length;
    const defenceRank = 1 + rows.filter((other) => other.team_id !== row.team_id && other.defence_strength > effectiveDefence).length;
    const n = rows.length || 1;

    const parts: string[] = [];
    if (Math.abs(targetGoalsFor - currentGoalsFor) >= 0.005) {
      parts.push(`Goals for: ${currentGoalsFor.toFixed(2)} \u2192 ${targetGoalsFor.toFixed(2)}/gm, ranking ${attackRank} of ${n}`);
    }
    if (Math.abs(targetGoalsAgainst - currentGoalsAgainst) >= 0.005) {
      parts.push(`Goals against: ${currentGoalsAgainst.toFixed(2)} \u2192 ${targetGoalsAgainst.toFixed(2)}/gm, ranking ${defenceRank} of ${n}`);
    }
    return parts.join(' \u00b7 ');
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Team Strength</h1>
        <p className="text-sm text-ink-500 mt-1">
          Dixon-Coles attack/defence ratings, this season&rsquo;s total projected goals, and last season&rsquo;s actual goals
          &mdash; a quick sanity check for whether a projection looks fixture-sensitive or just off.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-500 mb-1" htmlFor="league-select">
          League
        </label>
        <select
          id="league-select"
          className={selectClass}
          value={leagueId ?? ''}
          onChange={(e) => setLeagueId(Number(e.target.value))}
        >
          {leagues.map((l) => (
            <option key={l.league_id} value={l.league_id}>
              {l.name} ({l.code})
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {!loading && error && <p className="text-loss-700 text-sm">{error}</p>}

      {!loading && !error && summary && (
        <>
          {!summary.fitRun && (
            <p className="text-sm text-ink-500 bg-chalk-100 border border-chalk-300 rounded-lg px-3 py-2">
              No accepted Dixon-Coles fit for this league yet &mdash; nothing to show.
            </p>
          )}

          {summary.fitRun && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-chalk-300 rounded-lg p-3">
                <div className="text-xs text-ink-500" title="How many extra expected goals the home side gets, added in log-space before exponentiating -- the same figure for every team in this league, not a per-team value">
                  Home advantage
                </div>
                <div className="text-lg font-display text-ink-900">{summary.fitRun.home_advantage.toFixed(3)}</div>
              </div>
              <div className="bg-white border border-chalk-300 rounded-lg p-3">
                <div className="text-xs text-ink-500">Low-score correlation (&rho;)</div>
                <div className="text-lg font-display text-ink-900">{summary.fitRun.rho.toFixed(3)}</div>
              </div>
              <div className="bg-white border border-chalk-300 rounded-lg p-3">
                <div className="text-xs text-ink-500">Matches used to fit</div>
                <div className="text-lg font-display text-ink-900">{summary.fitRun.matches_used}</div>
              </div>
              <div className="bg-white border border-chalk-300 rounded-lg p-3">
                <div className="text-xs text-ink-500">Fitted</div>
                <div className="text-sm font-display text-ink-900">{new Date(summary.fitRun.fitted_at).toLocaleDateString()}</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleRefreshFplProjections}
              disabled={refreshing}
              className="px-3 py-1.5 text-sm rounded border border-pitch-700 text-pitch-800 hover:bg-pitch-50 disabled:opacity-50"
              title="Re-runs FPL player projections (next 10 gameweeks) so they reflect any Team Strength changes -- does not touch the bonus/finishing-position simulations or the optimizer, which still need their own GitHub Actions runs"
            >
              {refreshing ? 'Refreshing\u2026' : 'Refresh FPL projections'}
            </button>
            {refreshResult && <p className="text-xs text-ink-500">{refreshResult}</p>}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleTriggerFinalTableSimulation}
              disabled={triggeringSim}
              className="px-3 py-1.5 text-sm rounded border border-pitch-700 text-pitch-800 hover:bg-pitch-50 disabled:opacity-50"
              title="Triggers the Simulate Final Table GitHub Actions workflow -- takes 1-2 minutes, and this page won't update live, so reload afterwards to see the new Proj. Pos values"
            >
              {triggeringSim ? 'Triggering\u2026' : 'Re-run Proj. Pos simulation'}
            </button>
            {triggerSimResult && <p className="text-xs text-ink-500">{triggerSimResult}</p>}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleTriggerBonusSimulation}
              disabled={triggeringBonus}
              className="px-3 py-1.5 text-sm rounded border border-pitch-700 text-pitch-800 hover:bg-pitch-50 disabled:opacity-50"
              title="Triggers the Simulate Fixture Bonus GitHub Actions workflow for the next 10 gameweeks -- takes 1-2 minutes; run 'Refresh FPL projections' afterwards to pick up the new bonus values"
            >
              {triggeringBonus ? 'Triggering\u2026' : 'Re-run bonus simulation'}
            </button>
            {triggerBonusResult && <p className="text-xs text-ink-500">{triggerBonusResult}</p>}
          </div>

          {summary.rows.some((r) => isPositionStale(r)) && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
              <span className="font-medium">&#9888; Proj. Pos is out of date for:</span>{' '}
              {summary.rows
                .filter((r) => isPositionStale(r))
                .map((r) => r.canonical_name)
                .join(', ')}{' '}
              &mdash; a Team Strength override changed their predicted goals after the position simulation last ran. The
              simulation is a separate, manually-triggered step (the &ldquo;Simulate Final Table&rdquo; workflow) and doesn&rsquo;t
              re-run automatically when an override is saved.
            </p>
          )}

          {summary.relegatedTeams.length > 0 && (
            <p className="text-sm text-ink-500 bg-chalk-100 border border-chalk-300 rounded-lg px-3 py-2">
              <span className="font-medium text-ink-700">Relegated from {summary.lastSeasonLabel ?? 'last season'}:</span>{' '}
              {summary.relegatedTeams.map((t) => t.canonical_name).join(', ')} &mdash; no longer rated in this league, so they
              don&rsquo;t appear in the table below.
            </p>
          )}

          <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-sm">
                <thead className="bg-chalk-100 text-ink-500">
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        title={col.title}
                        onClick={() => handleSort(col.key)}
                        className={[
                          'sticky top-0 z-20 bg-chalk-100 font-medium text-xs px-3 py-1.5 cursor-pointer select-none whitespace-nowrap hover:text-ink-900',
                          col.key === 'canonical_name' ? 'text-left sticky left-0 z-30' : 'text-right',
                        ].join(' ')}
                      >
                        {col.label}
                        {sortKey === col.key && <span className="ml-1">{sortDir === 'asc' ? '\u25b2' : '\u25bc'}</span>}
                      </th>
                    ))}
                    <th
                      title="Projected goals for per game (this season, full-season rate) vs actual goals for per game (this season's results so far) -- is the model tracking what's actually happening this season, not just last season's different context"
                      className="sticky top-0 z-20 bg-chalk-100 font-medium text-xs px-3 py-1.5 whitespace-nowrap text-right"
                    >
                      GF/gm proj&rarr;actual
                    </th>
                    <th
                      title="Projected goals against per game (this season, full-season rate) vs actual goals against per game (this season's results so far)"
                      className="sticky top-0 z-20 bg-chalk-100 font-medium text-xs px-3 py-1.5 whitespace-nowrap text-right"
                    >
                      GA/gm proj&rarr;actual
                    </th>
                    <th
                      title="Manual adjustment on top of the derived attack/defence strength, for known real-world context the model can't see yet (a signing, an injury, actual in-season form). Applied to every future fixture prediction, not just displayed."
                      className="sticky top-0 z-20 bg-chalk-100 font-medium text-xs px-3 py-1.5 whitespace-nowrap text-right"
                    >
                      Override
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r, i) => (
                    <Fragment key={r.team_id}>
                    <tr className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                      <td className={['sticky left-0 z-10 px-3 py-1.5 font-medium text-ink-900', i % 2 === 1 ? 'bg-chalk-100' : 'bg-white'].join(' ')}>
                        {r.canonical_name}
                        {r.is_estimated && (
                          <span
                            className="ml-1.5 text-[10px] uppercase tracking-wide text-amber-700"
                            title="Not enough matches yet to fit directly -- estimated from a related league/team"
                          >
                            est.
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-900 font-semibold" title={r.projected_position_median !== null ? `Median: ${r.projected_position_median}` : undefined}>
                        {fmt(r.projected_position_mean, 1)}
                        {isPositionStale(r) && (
                          <span
                            className="ml-1 text-amber-700"
                            title="An override was saved after this simulation last ran -- this projected position doesn't reflect it yet. Re-run the Simulate Final Table workflow to update it."
                          >
                            &#9888;
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-700 whitespace-nowrap">
                        {r.attack_adjustment !== 0 ? (
                          <span title={`Raw Dixon-Coles: ${r.attack_strength.toFixed(3)} \u2192 ${(r.attack_strength + r.attack_adjustment).toFixed(3)} (log scale)`}>
                            {attackToGoalsFor(r.attack_strength).toFixed(2)}{' '}
                            <span className="text-amber-700 font-semibold">&rarr; {attackToGoalsFor(r.attack_strength + r.attack_adjustment).toFixed(2)}</span>
                          </span>
                        ) : (
                          attackToGoalsFor(r.attack_strength).toFixed(2)
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-700 whitespace-nowrap">
                        {r.defence_adjustment !== 0 ? (
                          <span title={`Raw Dixon-Coles: ${r.defence_strength.toFixed(3)} \u2192 ${(r.defence_strength + r.defence_adjustment).toFixed(3)} (log scale)`}>
                            {defenceToGoalsAgainst(r.defence_strength).toFixed(2)}{' '}
                            <span className="text-amber-700 font-semibold">&rarr; {defenceToGoalsAgainst(r.defence_strength + r.defence_adjustment).toFixed(2)}</span>
                          </span>
                        ) : (
                          defenceToGoalsAgainst(r.defence_strength).toFixed(2)
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-pitch-800 font-semibold">{fmt(r.projected_gf, 1)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-loss-700 font-semibold">{fmt(r.projected_ga, 1)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-700">{fmt(r.last_season_gf, 0)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-700">{fmt(r.last_season_ga, 0)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-700 whitespace-nowrap">
                        {fmt(perGame(r.projected_gf, r.projected_fixtures_counted), 2)}
                        {' \u2192 '}
                        {fmt(perGame(r.this_season_actual_gf, r.this_season_actual_played), 2)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-700 whitespace-nowrap">
                        {fmt(perGame(r.projected_ga, r.projected_fixtures_counted), 2)}
                        {' \u2192 '}
                        {fmt(perGame(r.this_season_actual_ga, r.this_season_actual_played), 2)}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {(r.attack_adjustment !== 0 || r.defence_adjustment !== 0) && (
                          <span className="font-mono text-xs text-amber-700 mr-2" title={r.override_note ?? undefined}>
                            {r.attack_adjustment >= 0 ? '+' : ''}
                            {r.attack_adjustment.toFixed(2)} / {r.defence_adjustment >= 0 ? '+' : ''}
                            {r.defence_adjustment.toFixed(2)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="text-xs text-pitch-700 hover:text-pitch-900 underline"
                        >
                          Adjust
                        </button>
                      </td>
                    </tr>
                    {editingTeamId === r.team_id && (
                      <tr className="bg-chalk-100">
                        <td colSpan={10} className="px-3 py-2">
                          <p className="text-xs text-ink-500 mb-2">
                            <span className="font-medium text-ink-700">Model says (no override):</span>{' '}
                            {attackToGoalsFor(r.attack_strength).toFixed(2)} goals for/gm, {defenceToGoalsAgainst(r.defence_strength).toFixed(2)} goals
                            against/gm &mdash; kept here so you can still compare against whatever you change below.
                          </p>
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="text-xs text-ink-700">
                              Target goals for /gm
                              <input
                                type="number"
                                step="0.05"
                                min="0.01"
                                value={editAttack}
                                onChange={(e) => setEditAttack(e.target.value)}
                                className="block w-28 border border-chalk-300 rounded px-2 py-1 text-sm mt-0.5"
                              />
                            </label>
                            <label className="text-xs text-ink-700">
                              Target goals against /gm
                              <input
                                type="number"
                                step="0.05"
                                min="0.01"
                                value={editDefence}
                                onChange={(e) => setEditDefence(e.target.value)}
                                className="block w-28 border border-chalk-300 rounded px-2 py-1 text-sm mt-0.5"
                              />
                            </label>
                            <label className="text-xs text-ink-700 flex-1 min-w-[12rem]">
                              Note
                              <input
                                type="text"
                                value={editNote}
                                onChange={(e) => setEditNote(e.target.value)}
                                placeholder="e.g. signed a new striker in January"
                                className="block w-full border border-chalk-300 rounded px-2 py-1 text-sm mt-0.5"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => handleSaveOverride(r)}
                              disabled={saving}
                              className="px-3 py-1.5 text-sm rounded bg-pitch-800 text-white hover:bg-pitch-900 disabled:opacity-50"
                            >
                              {saving ? 'Saving\u2026' : 'Save & apply'}
                            </button>
                            {(r.attack_adjustment !== 0 || r.defence_adjustment !== 0 || r.override_note) && (
                              <button
                                type="button"
                                onClick={() => handleResetOverride(r)}
                                disabled={saving}
                                title="Clears the override entirely, going back to exactly what the model itself says -- not just entering the model's numbers into the fields above, which is not guaranteed to land on exact zero"
                                className="px-3 py-1.5 text-sm rounded border border-loss-700 text-loss-700 hover:bg-loss-50 disabled:opacity-50"
                              >
                                Reset to model
                              </button>
                            )}
                            <button type="button" onClick={cancelEdit} className="px-3 py-1.5 text-sm rounded border border-chalk-300 hover:bg-chalk-100">
                              Cancel
                            </button>
                          </div>
                          {overridePreview(r, editAttack, editDefence) && (
                            <p className="text-xs text-amber-800 font-medium mt-1.5">{overridePreview(r, editAttack, editDefence)}</p>
                          )}
                          {saveError && <p className="text-xs text-loss-700 mt-1">{saveError}</p>}
                          <p className="text-xs text-ink-500 mt-1">
                            Expected goals per game against a neutral (league-average, no home advantage) opponent.
                            Saving re-runs predictions for every future fixture involving this team immediately.
                          </p>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-ink-500">
            Proj. Pos is the mean finishing position from a 20,000-run Monte Carlo simulation of the remaining season
            (hover for the median). Projected GF/GA sums this season&rsquo;s Dixon-Coles predicted goals across every fixture
            (played and upcoming) for the current fit &mdash; not a live-updating in-season tally. Last season&rsquo;s GF/GA is the
            real final total; a team with no last-season figure was outside this league then (e.g. newly promoted). GF/gm
            and GA/gm show the model&rsquo;s full-season projected rate against this season&rsquo;s actual rate so far, side by side.
          </p>
        </>
      )}
    </div>
  );
}
