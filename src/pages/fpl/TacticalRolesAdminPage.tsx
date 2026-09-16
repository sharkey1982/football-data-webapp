// ============================================================================
// src/pages/fpl/TacticalRolesAdminPage.tsx
//
// Review and correct each player's default tactical role
// (team_player_tactical_defaults) -- used whenever no fixture-specific
// lineup prediction is available, which is most of the time for anything
// more than a few days out. About half the pool currently only has a
// generic position-based placeholder because the external source
// (fantasy_football_scout) doesn't cover every player. This page exists to
// review that gap and correct it directly where a generic role is
// genuinely wrong for a significant player.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  getTacticalRoleReview,
  saveTacticalRoleCorrection,
  TACTICAL_ROLE_OPTIONS,
  type TacticalRoleRow,
} from '../../lib/tacticalRoleAdminApi';
import { FPL_POSITION_LABEL } from '../../lib/fplApi';
import { getErrorMessage } from '../../lib/errorMessage';

export default function TacticalRolesAdminPage() {
  const [rows, setRows] = useState<TacticalRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyGeneric, setOnlyGeneric] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTacticalRoleReview()
      .then((r) => {
        if (!cancelled) setRows(r);
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

  const byTeam = useMemo(() => {
    const map = new Map<string, TacticalRoleRow[]>();
    for (const r of rows) map.set(r.team_name, [...(map.get(r.team_name) ?? []), r]);
    return map;
  }, [rows]);

  async function handleRoleChange(row: TacticalRoleRow, newRole: string) {
    setSavingId(row.fpl_player_id);
    setSaveError(null);
    try {
      await saveTacticalRoleCorrection(row.team_id, row.fpl_player_id, newRole);
      setRows((prev) =>
        prev.map((r) => (r.fpl_player_id === row.fpl_player_id ? { ...r, tactical_role: newRole, source_name: 'manual', confidence: 1 } : r))
      );
    } catch (e) {
      setSaveError(getErrorMessage(e, `Failed to save the new role for ${row.web_name}`));
    } finally {
      setSavingId(null);
    }
  }

  const totalGeneric = rows.filter((r) => r.source_name === 'fpl_position_fallback').length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Tactical Roles</h1>
        <p className="text-sm text-ink-500 mt-1">
          Each player&rsquo;s default tactical role &mdash; used whenever no specific predicted lineup is available yet, which is
          most of the time more than a few days out. Rows flagged &ldquo;generic&rdquo; only have a position-based placeholder,
          not a real role, because the external source doesn&rsquo;t cover every player. Pick the correct role from the dropdown
          to fix one directly.
        </p>
      </div>

      {loading && <p className="text-ink-500 font-mono text-sm">{'Loading\u2026'}</p>}
      {error && <p className="text-loss-700 text-sm">{error}</p>}
      {saveError && <p className="text-loss-700 text-sm">{saveError}</p>}

      {!loading && !error && (
        <>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={onlyGeneric} onChange={(e) => setOnlyGeneric(e.target.checked)} />
              Show only generic roles ({totalGeneric} of {rows.length})
            </label>
          </div>

          <div className="space-y-4">
            {[...byTeam.entries()].map(([team, players]) => {
              const genericCount = players.filter((p) => p.source_name === 'fpl_position_fallback').length;
              const visible = onlyGeneric ? players.filter((p) => p.source_name === 'fpl_position_fallback') : players;
              if (visible.length === 0) return null;
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
                            <select
                              value={r.tactical_role}
                              disabled={savingId === r.fpl_player_id}
                              onChange={(e) => handleRoleChange(r, e.target.value)}
                              className={[
                                'text-xs font-mono border rounded px-1.5 py-0.5',
                                r.source_name === 'fpl_position_fallback' ? 'border-loss-600 bg-loss-600/10 text-loss-700' : 'border-chalk-300',
                              ].join(' ')}
                            >
                              {TACTICAL_ROLE_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
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
        </>
      )}
    </div>
  );
}
