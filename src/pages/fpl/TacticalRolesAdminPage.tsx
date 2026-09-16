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
  saveTacticalRoleCorrection,
  saveDepthRankCorrection,
  TACTICAL_ROLE_OPTIONS,
  DEPTH_RANK_OPTIONS,
  type TacticalRoleRow,
  type TeamOption,
} from '../../lib/tacticalRoleAdminApi';
import { toFormationPitchPlayer, inferFormation } from '../../lib/tacticalRoleFormationHelper';
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
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTacticalRoleReview(), getTeamOptions()])
      .then(([r, t]) => {
        if (cancelled) return;
        setRows(r);
        setTeams(t);
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

  const totalGeneric = rows.filter((r) => r.source_name === 'fpl_position_fallback').length;

  const byTeam = useMemo(() => {
    const map = new Map<string, TacticalRoleRow[]>();
    for (const r of rows) map.set(r.team_name, [...(map.get(r.team_name) ?? []), r]);
    return map;
  }, [rows]);

  const reviewRows = useMemo(() => {
    let visible = onlyGeneric ? rows.filter((r) => r.source_name === 'fpl_position_fallback') : rows;
    if (positionFilter !== 'all') visible = visible.filter((r) => r.element_type === positionFilter);
    return visible;
  }, [rows, onlyGeneric, positionFilter]);

  const selectedTeamRows = useMemo(() => {
    if (selectedTeamId === null) return [];
    let visible = rows.filter((r) => r.team_id === selectedTeamId);
    if (positionFilter !== 'all') visible = visible.filter((r) => r.element_type === positionFilter);
    return visible.sort((a, b) => a.element_type - b.element_type || (a.depth_rank ?? 99) - (b.depth_rank ?? 99) || a.web_name.localeCompare(b.web_name));
  }, [rows, selectedTeamId, positionFilter]);

  const startersForPitch = useMemo(() => rows.filter((r) => r.team_id === selectedTeamId && r.depth_rank === 1 && r.element_type !== 1), [rows, selectedTeamId]);
  const gkForPitch = useMemo(() => rows.find((r) => r.team_id === selectedTeamId && r.element_type === 1 && r.depth_rank === 1), [rows, selectedTeamId]);
  const pitchPlayers = useMemo(() => {
    const list = gkForPitch ? [gkForPitch, ...startersForPitch] : startersForPitch;
    return list.map(toFormationPitchPlayer);
  }, [startersForPitch, gkForPitch]);
  const inferredFormation = useMemo(() => inferFormation(startersForPitch), [startersForPitch]);

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
                Only unassigned ({totalGeneric} of {rows.length})
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
                <h2 className="text-sm font-medium text-ink-700 mb-2">
                  Inferred starting shape ({inferredFormation}) &mdash; from 1st-choice players only
                </h2>
                <FormationPitch players={pitchPlayers} formation={inferredFormation} selectedPlayerId={selectedPlayerId} onSelectPlayer={setSelectedPlayerId} />
                <p className="text-[11px] text-ink-500 mt-2">
                  Only players marked 1st choice appear here. Set a depth rank for every position on the right to build this
                  out; hover a player for role, set-piece, and season PPG context.
                </p>
              </div>

              <div className="bg-white border border-chalk-300 rounded-lg overflow-hidden self-start">
                <div className="px-3 py-2 border-b border-chalk-200 bg-chalk-100 text-xs font-medium text-ink-500 uppercase tracking-wide">
                  Full squad
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-medium text-ink-500 uppercase border-b border-chalk-200">
                      <th className="px-3 py-1.5">Player</th>
                      <th className="px-2 py-1.5">Pos</th>
                      <th className="px-2 py-1.5">Role</th>
                      <th className="px-2 py-1.5">Depth</th>
                      <th className="px-2 py-1.5">Set pieces</th>
                      <th className="px-2 py-1.5 text-right">PPG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTeamRows.map((r) => (
                      <tr key={r.fpl_player_id} className="border-b border-chalk-200 last:border-b-0">
                        <td className="px-3 py-1.5 font-medium text-ink-900 whitespace-nowrap">{r.web_name}</td>
                        <td className="px-2 py-1.5 font-mono text-xs text-ink-500 uppercase">{FPL_POSITION_LABEL[r.element_type]}</td>
                        <td className="px-2 py-1.5">
                          <RoleSelect row={r} />
                        </td>
                        <td className="px-2 py-1.5">
                          <DepthRankSelect row={r} />
                        </td>
                        <td className="px-2 py-1.5">
                          <SetPieceBadges row={r} />
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{r.points_per_game !== null ? r.points_per_game.toFixed(1) : '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
