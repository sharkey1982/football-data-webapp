// ============================================================================
// src/pages/fpl/TacticalRolesAdminPage.tsx
//
// Review and correct each player's default tactical role
// (team_player_tactical_defaults) -- used whenever no fixture-specific
// lineup prediction is available, which is most of the time for anything
// more than a few days out. About half the pool currently only has a
// generic position-based placeholder because the external source
// (fantasy_football_scout) doesn't cover every player.
//
// Two view modes: "Needs Review" (flat list across every team, filtered to
// generic-role rows by default -- the original quick-scan workflow) and
// "By Team" (pick one team, see its formation on a pitch built from
// depth_rank=1 starters, plus the full squad as a table alongside it).
// Depth rank (1st/2nd/3rd... choice starter within a position) and
// set-piece info (read-only here, sourced from set_piece_hierarchies)
// requested directly, on top of the original role-only review.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  getTacticalRoleReview,
  getTeamOptions,
  getTeamFormation,
  saveTacticalRoleCorrection,
  saveDepthRankCorrection,
  saveManualStatus,
  getTeamReviewDates,
  markTeamReviewed,
  TACTICAL_ROLE_OPTIONS,
  DEPTH_RANK_OPTIONS,
  MANUAL_STATUS_OPTIONS,
  type TacticalRoleRow,
  type TeamOption,
} from '../../lib/tacticalRoleAdminApi';
import { toFormationPitchPlayer, selectStartersAtDepth } from '../../lib/tacticalRoleFormationHelper';
import { FPL_POSITION_LABEL, formatSetPieceRoles } from '../../lib/fplApi';
import FormationPitch from '../../components/fpl/FormationPitch';
import { getErrorMessage } from '../../lib/errorMessage';
import type { FplElementType } from '../../types/database';

type ViewMode = 'review' | 'by_team';

export default function TacticalRolesAdminPage() {
  const [rows, setRows] = useState<TacticalRoleRow[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('review');
  const [onlyGeneric, setOnlyGeneric] = useState(true);
  const [positionFilter, setPositionFilter] = useState<FplElementType | 'all'>('all');
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [reviewTeamFilter, setReviewTeamFilter] = useState<number | 'all'>('all');
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [teamFormation, setTeamFormation] = useState<string | null>(null);
  const [pitchDepth, setPitchDepth] = useState(1);
  const [reviewDates, setReviewDates] = useState<Map<number, string>>(new Map());
  const [markingReviewed, setMarkingReviewed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTacticalRoleReview(), getTeamOptions(), getTeamReviewDates()])
      .then(([r, t, reviewed]) => {
        if (cancelled) return;
        setRows(r);
        setTeams(t);
        setReviewDates(reviewed);
        if (r.length > 0) setSelectedTeamId((prev) => prev ?? r[0].team_id);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load tactical role data'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedTeamId === null || viewMode !== 'by_team') {
      setTeamFormation(null);
      return;
    }
    let cancelled = false;
    getTeamFormation(selectedTeamId)
      .then((f) => {
        if (!cancelled) setTeamFormation(f);
      })
      .catch(() => {
        if (!cancelled) setTeamFormation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId, viewMode]);

  async function handleRoleChange(row: TacticalRoleRow, newRole: string) {
    setSavingId(row.fpl_player_id);
    setSaveError(null);
    try {
      await saveTacticalRoleCorrection(row.team_id, row.fpl_player_id, newRole);
      setRows((prev) => prev.map((r) => (r.fpl_player_id === row.fpl_player_id ? { ...r, tactical_role: newRole, source_name: 'manual', confidence: 1 } : r)));
    } catch (e) {
      setSaveError(getErrorMessage(e, `Failed to save the new role for ${row.web_name}`));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDepthRankChange(row: TacticalRoleRow, newRank: number | null) {
    setSavingId(row.fpl_player_id);
    setSaveError(null);
    try {
      await saveDepthRankCorrection(row.team_id, row.fpl_player_id, row.element_type, newRank);
      setRows((prev) => prev.map((r) => (r.fpl_player_id === row.fpl_player_id ? { ...r, depth_rank: newRank } : r)));
    } catch (e) {
      setSaveError(getErrorMessage(e, `Failed to save the depth rank for ${row.web_name}`));
    } finally {
      setSavingId(null);
    }
  }

  async function handleStatusChange(row: TacticalRoleRow, newStatus: string) {
    setSavingId(row.fpl_player_id);
    setSaveError(null);
    try {
      if (newStatus === '') {
        await saveManualStatus(row.team_id, row.fpl_player_id, row.element_type, null, null);
        // Re-fetch this one player's effective status is awkward without a
        // dedicated endpoint -- simplest correct thing is a full reload,
        // since clearing an override means falling back to whatever the
        // FPL-sourced value actually is, which this component doesn't have
        // cached separately.
        const refreshed = await getTacticalRoleReview();
        setRows(refreshed);
        return;
      }
      const note = window.prompt('Optional note (e.g. expected return date/detail)', row.news ?? '') ?? undefined;
      await saveManualStatus(row.team_id, row.fpl_player_id, row.element_type, newStatus, note || null);
      setRows((prev) => prev.map((r) => (r.fpl_player_id === row.fpl_player_id ? { ...r, status: newStatus, news: note || null, status_is_manual: true } : r)));
    } catch (e) {
      setSaveError(getErrorMessage(e, `Failed to save the status for ${row.web_name}`));
    } finally {
      setSavingId(null);
    }
  }

  async function handleMarkReviewed() {
    if (selectedTeamId === null) return;
    setMarkingReviewed(true);
    try {
      await markTeamReviewed(selectedTeamId);
      setReviewDates((prev) => new Map(prev).set(selectedTeamId, new Date().toISOString()));
    } catch (e) {
      setSaveError(getErrorMessage(e, 'Failed to mark this team as reviewed'));
    } finally {
      setMarkingReviewed(false);
    }
  }

  const teamScopedRows = useMemo(() => (reviewTeamFilter === 'all' ? rows : rows.filter((r) => r.team_id === reviewTeamFilter)), [rows, reviewTeamFilter]);
  const totalGeneric = teamScopedRows.filter((r) => r.source_name === 'fpl_position_fallback').length;

  const byTeam = useMemo(() => {
    const map = new Map<string, TacticalRoleRow[]>();
    for (const r of rows) map.set(r.team_name, [...(map.get(r.team_name) ?? []), r]);
    return map;
  }, [rows]);

  const reviewRows = useMemo(() => {
    let visible = onlyGeneric ? rows.filter((r) => r.source_name === 'fpl_position_fallback') : rows;
    if (positionFilter !== 'all') visible = visible.filter((r) => r.element_type === positionFilter);
    if (reviewTeamFilter !== 'all') visible = visible.filter((r) => r.team_id === reviewTeamFilter);
    return visible;
  }, [rows, onlyGeneric, positionFilter, reviewTeamFilter]);

  const selectedTeamRows = useMemo(() => {
    if (selectedTeamId === null) return [];
    let visible = rows.filter((r) => r.team_id === selectedTeamId);
    if (positionFilter !== 'all') visible = visible.filter((r) => r.element_type === positionFilter);
    return visible.sort((a, b) => a.element_type - b.element_type || (a.depth_rank ?? 99) - (b.depth_rank ?? 99) || a.web_name.localeCompare(b.web_name));
  }, [rows, selectedTeamId, positionFilter]);

  // Uses the team's own real, stable formation (fixture_team_tactical_
  // consensus) to select exactly the starters that formation needs, by
  // depth_rank, rather than an arbitrary fixed cap -- the cap approach
  // produced an oversized, unrealistic shape (up to 5 DEF + 5 MID + 3 FWD
  // simultaneously) since every team's cap slots filled regardless of
  // their actual formation.
  const teamRowsForPitch = useMemo(() => rows.filter((r) => r.team_id === selectedTeamId), [rows, selectedTeamId]);
  const pitchStarters = useMemo(() => selectStartersAtDepth(teamRowsForPitch, pitchDepth), [teamRowsForPitch, pitchDepth]);
  const pitchPlayers = useMemo(() => pitchStarters.map(toFormationPitchPlayer), [pitchStarters]);

  function RoleSelect({ row }: { row: TacticalRoleRow }) {
    return (
      <select
        value={row.tactical_role}
        disabled={savingId === row.fpl_player_id}
        onChange={(e) => handleRoleChange(row, e.target.value)}
        className={[
          'text-xs font-mono border rounded px-1.5 py-0.5',
          row.source_name === 'fpl_position_fallback' ? 'border-loss-600 bg-loss-600/10 text-loss-700' : 'border-chalk-300',
        ].join(' ')}
      >
        {TACTICAL_ROLE_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  function DepthRankSelect({ row }: { row: TacticalRoleRow }) {
    return (
      <select
        value={row.depth_rank ?? ''}
        disabled={savingId === row.fpl_player_id}
        onChange={(e) => handleDepthRankChange(row, e.target.value === '' ? null : Number(e.target.value))}
        className="text-xs font-mono border border-chalk-300 rounded px-1.5 py-0.5"
      >
        <option value="">&mdash;</option>
        {DEPTH_RANK_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`}
          </option>
        ))}
      </select>
    );
  }

  function SetPieceBadges({ row }: { row: TacticalRoleRow }) {
    const formatted = formatSetPieceRoles(row.set_piece_roles);
    if (!formatted) return <span className="text-ink-400">&mdash;</span>;
    return <span className="text-[10px] font-mono font-semibold text-amber-600" title={formatted.full}>{formatted.compact}</span>;
  }

  function StatusBadge({ row }: { row: TacticalRoleRow }) {
    const label = row.status === 'i' ? 'INJ' : row.status === 'd' ? 'DBT' : row.status === 's' ? 'SUS' : row.status === 'a' ? 'OK' : '\u2014';
    return (
      <select
        value={row.status_is_manual ? row.status ?? '' : ''}
        disabled={savingId === row.fpl_player_id}
        onChange={(e) => handleStatusChange(row, e.target.value)}
        title={row.news ?? undefined}
        className={[
          'text-[10px] font-mono font-semibold rounded px-1 py-0.5 border',
          row.status_is_manual
            ? 'text-amber-700 bg-amber-600/10 border-amber-600/40'
            : row.status && row.status !== 'a'
              ? 'text-loss-700 bg-loss-600/10 border-loss-600/40'
              : 'text-ink-400 border-transparent',
        ].join(' ')}
      >
        <option value="">{label}</option>
        {MANUAL_STATUS_OPTIONS.filter((o) => o.value !== '').map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Tactical Roles</h1>
        <p className="text-sm text-ink-500 mt-1">
          Each player&rsquo;s default tactical role and starting pecking order &mdash; used whenever no specific predicted lineup
          is available yet. Rows flagged &ldquo;generic&rdquo; only have a position-based placeholder, not a real role.
        </p>
      </div>

      {loading && <p className="text-ink-500 font-mono text-sm">{'Loading\u2026'}</p>}
      {error && <p className="text-loss-700 text-sm">{error}</p>}
      {saveError && <p className="text-loss-700 text-sm">{saveError}</p>}

      {!loading && !error && (
        <>
          <div className="flex flex-wrap items-center gap-3 bg-white border border-chalk-300 rounded-lg p-3">
            <div className="flex rounded-md border border-chalk-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('review')}
                className={['px-3 py-1.5 text-sm font-medium transition-colors', viewMode === 'review' ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100'].join(' ')}
              >
                Needs Review
              </button>
              <button
                type="button"
                onClick={() => setViewMode('by_team')}
                className={['px-3 py-1.5 text-sm font-medium transition-colors', viewMode === 'by_team' ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100'].join(' ')}
              >
                By Team
              </button>
            </div>

            {viewMode === 'by_team' && (
              <select
                value={selectedTeamId ?? ''}
                onChange={(e) => setSelectedTeamId(e.target.value === '' ? null : Number(e.target.value))}
                className="text-sm border border-chalk-300 rounded px-2 py-1.5"
              >
                {teams.map((t) => (
                  <option key={t.team_id} value={t.team_id}>
                    {t.team_name}
                  </option>
                ))}
              </select>
            )}

            {viewMode === 'review' && (
              <select
                value={reviewTeamFilter}
                onChange={(e) => setReviewTeamFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="text-sm border border-chalk-300 rounded px-2 py-1.5"
              >
                <option value="all">All teams</option>
                {teams.map((t) => (
                  <option key={t.team_id} value={t.team_id}>
                    {t.team_name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value === 'all' ? 'all' : (Number(e.target.value) as FplElementType))}
              className="text-sm border border-chalk-300 rounded px-2 py-1.5"
            >
              <option value="all">All positions</option>
              {(Object.entries(FPL_POSITION_LABEL) as [string, string][]).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>

            {viewMode === 'review' && (
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={onlyGeneric} onChange={(e) => setOnlyGeneric(e.target.checked)} />
                Only unassigned ({totalGeneric} of {teamScopedRows.length})
              </label>
            )}
          </div>

          {viewMode === 'review' && (
            <div className="space-y-4">
              {[...byTeam.entries()].map(([team, players]) => {
                const visible = players.filter((p) => reviewRows.includes(p));
                if (visible.length === 0) return null;
                const genericCount = players.filter((p) => p.source_name === 'fpl_position_fallback').length;
                return (
                  <div key={team} className="bg-white border border-chalk-300 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-chalk-200 bg-chalk-100 flex items-center justify-between">
                      <span className="font-display uppercase tracking-wide text-sm text-ink-900">{team}</span>
                      <span className="text-xs text-ink-500 font-mono">
                        {players.length - genericCount}/{players.length} specific
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {visible.map((r) => (
                          <tr key={r.fpl_player_id} className="border-b border-chalk-200 last:border-b-0">
                            <td className="px-3 py-1.5 font-medium text-ink-900">{r.web_name}</td>
                            <td className="px-2 py-1.5 font-mono text-xs text-ink-500 uppercase">{FPL_POSITION_LABEL[r.element_type]}</td>
                            <td className="px-2 py-1.5">
                              <RoleSelect row={r} />
                            </td>
                            <td className="px-2 py-1.5">
                              <DepthRankSelect row={r} />
                            </td>
                            <td className="px-2 py-1.5">
                              <StatusBadge row={r} />
                            </td>
                            <td className="px-2 py-1.5">
                              <SetPieceBadges row={r} />
                            </td>
                            <td className="px-3 py-1.5 text-right text-[10px] text-ink-500 font-mono uppercase">
                              {savingId === r.fpl_player_id ? 'Saving\u2026' : r.source_name === 'manual' ? 'manually corrected' : r.source_name}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === 'by_team' && selectedTeamId !== null && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <span className="text-xs text-ink-500">
                    {reviewDates.has(selectedTeamId)
                      ? `Last reviewed ${new Date(reviewDates.get(selectedTeamId)!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : 'Not yet reviewed'}
                  </span>
                  <button
                    type="button"
                    onClick={handleMarkReviewed}
                    disabled={markingReviewed}
                    className="px-2.5 py-1 text-xs font-medium rounded-md border border-chalk-300 bg-white text-ink-700 hover:bg-chalk-100 disabled:opacity-50"
                  >
                    {markingReviewed ? 'Saving\u2026' : 'Mark reviewed'}
                  </button>
                </div>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <h2 className="text-sm font-medium text-ink-700">
                    {teamFormation ? `Formation: ${teamFormation}` : 'Formation not available'}
                  </h2>
                  <div className="flex rounded-md border border-chalk-300 overflow-hidden">
                    {DEPTH_RANK_OPTIONS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPitchDepth(n)}
                        className={['px-2.5 py-1 text-xs font-medium transition-colors', pitchDepth === n ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100'].join(' ')}
                      >
                        {n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`}
                      </button>
                    ))}
                  </div>
                </div>
                <FormationPitch players={pitchPlayers} formation={teamFormation} selectedPlayerId={selectedPlayerId} onSelectPlayer={setSelectedPlayerId} />
                <p className="text-[11px] text-ink-500 mt-2">
                  Shows only the players at the selected depth &mdash; a team only has one genuinely-ranked 1st choice per
                  position, not one per formation slot, so this may not fill a full XI; that&rsquo;s expected, not a bug. Switch
                  depth above to review 2nd/3rd choice separately. Injured players never appear here. Hover a player for role,
                  set-piece, injury status, and season PPG context.
                </p>
              </div>

              <div className="bg-white border border-chalk-300 rounded-lg overflow-hidden self-start">
                <div className="px-3 py-2 border-b border-chalk-200 bg-chalk-100 text-xs font-medium text-ink-500 uppercase tracking-wide">
                  Full squad
                </div>
                <div className="overflow-x-auto max-w-full">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] font-medium text-ink-500 uppercase border-b border-chalk-200">
                        <th className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">Player</th>
                        <th className="px-2 py-1.5">Pos</th>
                        <th className="px-2 py-1.5">Role</th>
                        <th className="px-2 py-1.5">Depth</th>
                        <th className="px-2 py-1.5">Status</th>
                        <th className="px-2 py-1.5">Set pieces</th>
                        <th className="px-2 py-1.5 text-right">Mins</th>
                        <th className="px-2 py-1.5 text-right">Min/Start</th>
                        <th className="px-2 py-1.5 text-right">PPG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTeamRows.map((r) => (
                        <tr key={r.fpl_player_id} className="border-b border-chalk-200 last:border-b-0">
                          <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-ink-900 whitespace-nowrap">{r.web_name}</td>
                          <td className="px-2 py-1.5 font-mono text-xs text-ink-500 uppercase">{FPL_POSITION_LABEL[r.element_type]}</td>
                          <td className="px-2 py-1.5">
                            <RoleSelect row={r} />
                          </td>
                          <td className="px-2 py-1.5">
                            <DepthRankSelect row={r} />
                          </td>
                          <td className="px-2 py-1.5">
                            <StatusBadge row={r} />
                          </td>
                          <td className="px-2 py-1.5">
                            <SetPieceBadges row={r} />
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{r.minutes !== null ? r.minutes : '\u2014'}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{r.avg_minutes_per_start !== null ? Math.round(r.avg_minutes_per_start) : '\u2014'}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{r.points_per_game !== null ? r.points_per_game.toFixed(1) : '\u2014'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
