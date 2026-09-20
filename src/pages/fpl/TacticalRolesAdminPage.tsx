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
// Two view modes -- Table (flat list across every team, grouped by team
// and collapsible) and Pitch (pick one team, see its formation on a pitch
// built from depth_rank=1 starters, plus the full squad as a table
// alongside it) -- each filterable by a shared scope: Needs Review
// (generic-role rows only), Worth Reviewing (generic AND not fringe, per
// get_tactical_role_worklist -- was a standalone "Worth reviewing first"
// list; now a filter applied to these same views on request, rather than
// a third view), or Everyone.
// Depth rank (1st/2nd/3rd... choice starter within a position) and
// set-piece info (read-only here, sourced from set_piece_hierarchies)
// requested directly, on top of the original role-only review.
// ============================================================================

import { AdminGateNotice } from '../../components/AdminGateNotice';
import { useAuthOptional } from '../../lib/auth';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getTacticalRoleReview,
  getTeamOptions,
  getTeamFormation,
  saveTacticalRoleCorrection,
  saveDepthRankCorrection,
  saveManualStatus,
  getTeamReviewDates,
  markTeamReviewed,
  getProjectedMinutes,
  getSetPieceHierarchyForTeam,
  reorderSetPieceTaker,
  addSetPieceTaker,
  removeSetPieceTaker,
  SET_PIECE_HIERARCHY_TYPES,
  TACTICAL_ROLE_OPTIONS,
  DEPTH_RANK_OPTIONS,
  MANUAL_STATUS_OPTIONS,
  type TacticalRoleRow,
  type TeamOption,
  type SetPieceHierarchyType,
  type SetPieceHierarchyRow,
  getTacticalRoleWorklist,
  type TacticalWorklistRow,
} from '../../lib/tacticalRoleAdminApi';
import { toFormationPitchPlayer, selectStartersAtDepth } from '../../lib/tacticalRoleFormationHelper';
import { FPL_POSITION_LABEL, formatSetPieceRoles } from '../../lib/fplApi';
import { getDefaultMatchweek } from '../../lib/fplSeasonApi';
import FormationPitch from '../../components/fpl/FormationPitch';
import { getErrorMessage } from '../../lib/errorMessage';
import type { FplElementType } from '../../types/database';

type DisplayMode = 'table' | 'pitch';
type ScopeMode = 'needs_review' | 'worth_reviewing' | 'everyone';
type TableSort = 'position' | 'depth';

export default function TacticalRolesAdminPage({ adminMode = false }: { adminMode?: boolean } = {}) {
  // Same two-route shape TeamStrengthPage already uses: one component,
  // mounted publicly as "Starting Lineups" (/football/lineups, read-only,
  // pitch-first -- the predicted XI is the thing a visitor came for) and
  // again at /fpl/tactical-roles with adminMode for the editing pass.
  // Editing requires BOTH the admin route and an admin session, so a
  // signed-in admin on the public page still sees the public page --
  // otherwise the two nav entries lead to visibly identical screens,
  // which is exactly the confusion the Team Strength split fixed.
  const signedInAdmin = useAuthOptional()?.isAdmin ?? false;
  const isAdmin = adminMode && signedInAdmin;
  // Was a standalone "Worth reviewing first" panel (its own list of
  // names, separate from the Table/Pitch team views below). Replaced on
  // request with a third scope option -- "Worth Reviewing" -- that
  // filters the SAME team views everything else already uses, rather
  // than duplicating them in a second list. worklist itself is still
  // fetched; it now only supplies which players are non-fringe.
  const [worklist, setWorklist] = useState<TacticalWorklistRow[]>([]);
  useEffect(() => {
    getTacticalRoleWorklist(13)
      .then(setWorklist)
      .catch(() => setWorklist([]));
  }, []);
  const nonFringeWorklistIds = useMemo(() => new Set(worklist.filter((w) => w.priority !== 'fringe').map((w) => w.fpl_player_id)), [worklist]);
  // Which teams are COLLAPSED in the by-team "needs review" list. Starts
  // empty (everything expanded, matching prior behaviour) -- a team is
  // collapsed only once a person chooses to, or via "Collapse all". A
  // collapsed team still shows its row count, so nothing is hidden,
  // just deferred.
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  function toggleTeamExpanded(team: string) {
    setCollapsedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });
  }
  const [rows, setRows] = useState<TacticalRoleRow[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Public page opens on the pitch showing the full XI: the predicted
  // lineup is what a visitor came for. The admin page opens on the table
  // filtered to what still needs a role, which is the editing workflow.
  const [displayMode, setDisplayMode] = useState<DisplayMode>(adminMode ? 'table' : 'pitch');
  const [scopeMode, setScopeMode] = useState<ScopeMode>(adminMode ? 'needs_review' : 'everyone');
  const [positionFilter, setPositionFilter] = useState<FplElementType | 'all'>('all');
  const [depthFilter, setDepthFilter] = useState<number | 'all'>('all');
  const [tableSort, setTableSort] = useState<TableSort>('position');
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  // Edits save the moment a dropdown changes. Without confirmation a
  // successful save and a silent failure look identical, which is
  // exactly how a working page comes to feel broken.
  const [savedIds, setSavedIds] = useState<Record<number, number>>({});
  // Count of edits made this session. A saved change does NOT reach
  // projections until the refresh job runs, so the page has to say so --
  // otherwise a correct edit also looks like it did nothing.
  const [unappliedEdits, setUnappliedEdits] = useState(0);

  function markSaved(playerId: number) {
    setSavedIds((prev) => ({ ...prev, [playerId]: Date.now() }));
    setUnappliedEdits((n) => n + 1);
    window.setTimeout(() => {
      setSavedIds((prev) => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
    }, 4000);
  }
  const [reviewTeamFilter, setReviewTeamFilter] = useState<number | 'all'>('all');
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [teamFormation, setTeamFormation] = useState<string | null>(null);
  const [pitchDepth, setPitchDepth] = useState(1);
  const [setPieceHierarchy, setSetPieceHierarchy] = useState<Map<SetPieceHierarchyType, SetPieceHierarchyRow[]>>(new Map());
  const [setPieceLoading, setSetPieceLoading] = useState(false);
  const [setPieceError, setSetPieceError] = useState<string | null>(null);
  const [addingToType, setAddingToType] = useState<SetPieceHierarchyType | null>(null);
  const [addPlayerId, setAddPlayerId] = useState<string>('');
  const [projectedMinutesGw, setProjectedMinutesGw] = useState<number | null>(null);
  const [projectedMinutes, setProjectedMinutes] = useState<Map<number, number>>(new Map());
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
    let cancelled = false;
    getDefaultMatchweek()
      .then((gw) => {
        if (cancelled) return;
        setProjectedMinutesGw(gw);
        return getProjectedMinutes(gw);
      })
      .then((m) => {
        if (!cancelled && m) setProjectedMinutes(m);
      })
      .catch(() => {
        /* non-critical enrichment -- table still works without it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedTeamId === null || displayMode !== 'pitch') {
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
  }, [selectedTeamId, displayMode]);

  function reloadSetPieceHierarchy(teamId: number) {
    setSetPieceLoading(true);
    setSetPieceError(null);
    getSetPieceHierarchyForTeam(teamId)
      .then((m) => setSetPieceHierarchy(m))
      .catch((e) => setSetPieceError(getErrorMessage(e, 'Failed to load set-piece takers')))
      .finally(() => setSetPieceLoading(false));
  }

  useEffect(() => {
    if (selectedTeamId === null || displayMode !== 'pitch') {
      return;
    }
    reloadSetPieceHierarchy(selectedTeamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId, displayMode]);

  async function handleReorderSetPiece(row: SetPieceHierarchyRow, type: SetPieceHierarchyType, direction: 'up' | 'down') {
    if (selectedTeamId === null) return;
    setSetPieceError(null);
    try {
      await reorderSetPieceTaker(row.set_piece_hierarchy_id, selectedTeamId, type, direction);
      reloadSetPieceHierarchy(selectedTeamId);
    } catch (e) {
      setSetPieceError(getErrorMessage(e, 'Failed to reorder'));
    }
  }

  async function handleRemoveSetPiece(row: SetPieceHierarchyRow) {
    if (selectedTeamId === null) return;
    setSetPieceError(null);
    try {
      await removeSetPieceTaker(row.set_piece_hierarchy_id);
      reloadSetPieceHierarchy(selectedTeamId);
    } catch (e) {
      setSetPieceError(getErrorMessage(e, 'Failed to remove'));
    }
  }

  async function handleAddSetPiece(type: SetPieceHierarchyType) {
    if (selectedTeamId === null || !addPlayerId) return;
    const player = rows.find((r) => r.fpl_player_id === Number(addPlayerId));
    if (!player) return;
    setSetPieceError(null);
    try {
      await addSetPieceTaker(selectedTeamId, type, player.fpl_player_id, player.web_name);
      setAddingToType(null);
      setAddPlayerId('');
      reloadSetPieceHierarchy(selectedTeamId);
    } catch (e) {
      setSetPieceError(getErrorMessage(e, 'Failed to add player'));
    }
  }

  async function handleRoleChange(row: TacticalRoleRow, newRole: string) {
    setSavingId(row.fpl_player_id);
    setSaveError(null);
    try {
      await saveTacticalRoleCorrection(row.team_id, row.fpl_player_id, newRole);
      markSaved(row.fpl_player_id);
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
      markSaved(row.fpl_player_id);
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
        markSaved(row.fpl_player_id);
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
  const totalWorthReviewing = teamScopedRows.filter((r) => nonFringeWorklistIds.has(r.fpl_player_id)).length;

  const byTeam = useMemo(() => {
    const map = new Map<string, TacticalRoleRow[]>();
    for (const r of rows) map.set(r.team_name, [...(map.get(r.team_name) ?? []), r]);
    return map;
  }, [rows]);

  /** Applies the current scope to any row list -- shared by the by-team
   * table below and by pitchStarters further down, so "Worth Reviewing"
   * means the same thing everywhere rather than drifting between views. */
  function applyScope(list: TacticalRoleRow[]): TacticalRoleRow[] {
    if (scopeMode === 'needs_review') return list.filter((r) => r.source_name === 'fpl_position_fallback');
    if (scopeMode === 'worth_reviewing') return list.filter((r) => nonFringeWorklistIds.has(r.fpl_player_id));
    return list;
  }

  const reviewRows = useMemo(() => {
    let visible = applyScope(rows);
    if (positionFilter !== 'all') visible = visible.filter((r) => r.element_type === positionFilter);
    if (reviewTeamFilter !== 'all') visible = visible.filter((r) => r.team_id === reviewTeamFilter);
    return visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, scopeMode, positionFilter, reviewTeamFilter, nonFringeWorklistIds]);

  const selectedTeamRows = useMemo(() => {
    if (selectedTeamId === null) return [];
    let visible = rows.filter((r) => r.team_id === selectedTeamId);
    if (positionFilter !== 'all') visible = visible.filter((r) => r.element_type === positionFilter);
    if (depthFilter !== 'all') visible = visible.filter((r) => r.depth_rank === depthFilter);
    const byDepth = (a: TacticalRoleRow, b: TacticalRoleRow) => (a.depth_rank ?? 99) - (b.depth_rank ?? 99);
    const byPosition = (a: TacticalRoleRow, b: TacticalRoleRow) => a.element_type - b.element_type;
    return visible.sort((a, b) =>
      tableSort === 'depth'
        ? byDepth(a, b) || byPosition(a, b) || a.web_name.localeCompare(b.web_name)
        : byPosition(a, b) || byDepth(a, b) || a.web_name.localeCompare(b.web_name)
    );
  }, [rows, selectedTeamId, positionFilter, depthFilter, tableSort]);

  // Uses the team's own real, stable formation (fixture_team_tactical_
  // consensus) to select exactly the starters that formation needs, by
  // depth_rank, rather than an arbitrary fixed cap -- the cap approach
  // produced an oversized, unrealistic shape (up to 5 DEF + 5 MID + 3 FWD
  // simultaneously) since every team's cap slots filled regardless of
  // their actual formation.
  const teamRowsForPitch = useMemo(() => rows.filter((r) => r.team_id === selectedTeamId), [rows, selectedTeamId]);
  const pitchStarters = useMemo(() => {
    const starters = selectStartersAtDepth(teamRowsForPitch, pitchDepth);
    // scopeMode is applied AFTER selection, not before -- selectStartersAtDepth's
    // injury-promotion logic needs the full team pool to find a role-matched
    // replacement; pre-filtering would break that.
    return applyScope(starters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamRowsForPitch, pitchDepth, scopeMode, nonFringeWorklistIds]);
  const pitchPlayers = useMemo(() => pitchStarters.map(toFormationPitchPlayer), [pitchStarters]);

  /** A visible, unmistakable outcome for a save that happens on change.
   * "Saving…" then nothing is the same shape as a failure. */
  function SaveState({ row }: { row: TacticalRoleRow }) {
    if (savingId === row.fpl_player_id) {
      return <span className="text-xs text-ink-500 ml-1.5">saving&hellip;</span>;
    }
    if (savedIds[row.fpl_player_id]) {
      return <span className="text-xs text-pitch-800 ml-1.5" aria-live="polite">&#10003; saved</span>;
    }
    return null;
  }

  function RoleSelect({ row }: { row: TacticalRoleRow }) {
    // Read-only rendering rather than a disabled select: a greyed-out
    // dropdown on a public page implies "sign in and you could change
    // this", which isn't true for a visitor and isn't what the page is
    // for. Plain text says what the role IS, which is the public point.
    if (!isAdmin) {
      return (
        <span
          className={['text-xs font-mono', row.source_name === 'fpl_position_fallback' ? 'text-ink-400 italic' : 'text-ink-900'].join(' ')}
          title={row.source_name === 'fpl_position_fallback' ? 'Position-based placeholder, not a confirmed role' : undefined}
        >
          {row.tactical_role}
        </span>
      );
    }
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
    if (!isAdmin) {
      const n = row.depth_rank;
      return (
        <span className="text-xs font-mono text-ink-700">
          {n === null ? '\u2014' : n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`}
        </span>
      );
    }
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
    if (!isAdmin) {
      return (
        <span
          title={row.news ?? undefined}
          className={[
            'text-[10px] font-mono font-semibold rounded px-1 py-0.5 border',
            row.status && row.status !== 'a'
              ? 'text-loss-700 bg-loss-600/10 border-loss-600/40'
              : 'text-ink-400 border-transparent',
          ].join(' ')}
        >
          {label}
        </span>
      );
    }
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
      {adminMode && <AdminGateNotice />}

      {/* A saved role does NOT reach projections until the refresh runs.
          Without saying so, a correct edit looks identical to one that
          failed -- which is the same symptom as a broken save, and the
          two would be indistinguishable. */}
      {unappliedEdits > 0 && (
        <div className="border border-amber-500 bg-amber-500/10 rounded-lg px-4 py-3">
          <p className="font-mono text-xs text-amber-700 uppercase tracking-widest">Not live yet</p>
          <p className="text-sm text-ink-900 mt-1">
            {unappliedEdits} change{unappliedEdits === 1 ? '' : 's'} saved. These are stored, but projections still use
            the old roles until the FPL projections refresh runs.{' '}
            <Link to="/admin/team-ratings" className="text-pitch-800 underline underline-offset-2">
              Run it from Team Strength Admin
            </Link>
            .
          </p>
        </div>
      )}
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">
          {adminMode ? 'Tactical Roles' : 'Starting Lineups'}
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          {adminMode
            ? 'Each player\u2019s default tactical role and starting pecking order \u2014 used whenever no specific predicted lineup is available yet. Rows flagged \u201cgeneric\u201d only have a position-based placeholder, not a real role.'
            : 'Who the model expects each club to start, and in which role \u2014 the lineup behind every player projection on the site. Shown by depth, so 2nd and 3rd choice are visible too, with injuries and suspensions already accounted for.'}
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
                onClick={() => setDisplayMode('table')}
                className={['px-3 py-1.5 text-sm font-medium transition-colors', displayMode === 'table' ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100'].join(' ')}
              >
                Table
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('pitch')}
                className={['px-3 py-1.5 text-sm font-medium transition-colors', displayMode === 'pitch' ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100'].join(' ')}
              >
                Pitch
              </button>
            </div>

            {/* "Needs Review"/"Worth Reviewing" describe the editorial
                backlog, not the football. A visitor wants the lineup, so
                the public page shows everyone and doesn't offer these. */}
            {adminMode && (
            <div className="flex rounded-md border border-chalk-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setScopeMode('needs_review')}
                className={['px-3 py-1.5 text-sm font-medium transition-colors', scopeMode === 'needs_review' ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100'].join(' ')}
              >
                Needs Review
              </button>
              <button
                type="button"
                onClick={() => setScopeMode('worth_reviewing')}
                title="Needs Review, narrowed to players who actually play enough for a role to matter -- excludes fringe players under 90 minutes all season"
                className={['px-3 py-1.5 text-sm font-medium transition-colors', scopeMode === 'worth_reviewing' ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100'].join(' ')}
              >
                Worth Reviewing
              </button>
              <button
                type="button"
                onClick={() => setScopeMode('everyone')}
                className={['px-3 py-1.5 text-sm font-medium transition-colors', scopeMode === 'everyone' ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100'].join(' ')}
              >
                Everyone
              </button>
            </div>
            )}

            {displayMode === 'pitch' && (
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

            {displayMode === 'table' && (
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

            {displayMode === 'table' && scopeMode === 'needs_review' && (
              <span className="text-sm text-ink-500">
                {totalGeneric} of {teamScopedRows.length} unassigned
              </span>
            )}
            {displayMode === 'table' && scopeMode === 'worth_reviewing' && (
              <span className="text-sm text-ink-500">
                {totalWorthReviewing} of {teamScopedRows.length} worth reviewing
              </span>
            )}
          </div>

          {displayMode === 'table' && (
            <div className="space-y-4">
              {(() => {
                const visibleTeams = [...byTeam.entries()].filter(([, players]) => players.some((p) => reviewRows.includes(p)));
                if (visibleTeams.length <= 1) return null;
                const allCollapsed = visibleTeams.every(([team]) => collapsedTeams.has(team));
                return (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedTeams(allCollapsed ? new Set() : new Set(visibleTeams.map(([team]) => team)))
                      }
                      className="text-xs text-pitch-800 hover:underline"
                    >
                      {allCollapsed ? 'Expand all' : 'Collapse all'}
                    </button>
                  </div>
                );
              })()}
              {[...byTeam.entries()].map(([team, players]) => {
                const visible = players.filter((p) => reviewRows.includes(p));
                if (visible.length === 0) return null;
                const genericCount = players.filter((p) => p.source_name === 'fpl_position_fallback').length;
                const isExpanded = !collapsedTeams.has(team);
                return (
                  <div key={team} className="bg-white border border-chalk-300 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleTeamExpanded(team)}
                      aria-expanded={isExpanded}
                      className="w-full px-3 py-2 border-b border-chalk-200 bg-chalk-100 flex items-center justify-between hover:bg-chalk-200/60"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="text-ink-500 text-xs">{isExpanded ? '\u25be' : '\u25b8'}</span>
                        <span className="font-display uppercase tracking-wide text-sm text-ink-900">{team}</span>
                        <span className="text-xs text-ink-500 font-mono">({visible.length})</span>
                      </span>
                      <span className="text-xs text-ink-500 font-mono">
                        {players.length - genericCount}/{players.length} specific
                      </span>
                    </button>
                    {isExpanded && (
                    <table className="w-full text-sm">
                      <tbody>
                        {visible.map((r) => (
                          <tr key={r.fpl_player_id} className="border-b border-chalk-200 last:border-b-0">
                            <td className="px-3 py-1.5 font-medium text-ink-900">{r.web_name}</td>
                            <td className="px-2 py-1.5 font-mono text-xs text-ink-500 uppercase">{FPL_POSITION_LABEL[r.element_type]}</td>
                            <td className="px-2 py-1.5">
                              <RoleSelect row={r} />
                              <SaveState row={r} />
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
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {displayMode === 'pitch' && selectedTeamId !== null && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                {/* "Last reviewed" is an editorial-process fact, not a
                    football one -- it tells an admin whether this club's
                    pass has been done, and means nothing to a visitor. */}
                {isAdmin && (
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
                )}
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
                  depth above to review 2nd/3rd choice separately. An injured player is replaced here by the healthy player in
                  the same specific role at the next depth (e.g. an injured right centre-back is replaced by the next-ranked
                  right centre-back, not just whoever&rsquo;s next by overall rank). Hover a player for role, set-piece, injury
                  status, and season PPG context.
                </p>
              </div>

              <div className="bg-white border border-chalk-300 rounded-lg overflow-hidden self-start">
                <div className="px-3 py-2 border-b border-chalk-200 bg-chalk-100 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-medium text-ink-500 uppercase tracking-wide">Full squad</span>
                  <label className="flex items-center gap-1.5 text-xs text-ink-700">
                    Depth
                    <select
                      value={depthFilter}
                      onChange={(e) => setDepthFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                      className="border border-chalk-300 rounded px-1.5 py-0.5 text-xs"
                    >
                      <option value="all">All</option>
                      {DEPTH_RANK_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="overflow-x-auto max-w-full">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] font-medium text-ink-500 uppercase border-b border-chalk-200">
                        <th className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap">Player</th>
                        <th className="px-2 py-1.5">
                          <button type="button" onClick={() => setTableSort('position')} className={['hover:text-ink-900', tableSort === 'position' ? 'text-ink-900 underline' : ''].join(' ')}>
                            Pos
                          </button>
                        </th>
                        <th className="px-2 py-1.5">Role</th>
                        <th className="px-2 py-1.5">
                          <button type="button" onClick={() => setTableSort('depth')} className={['hover:text-ink-900', tableSort === 'depth' ? 'text-ink-900 underline' : ''].join(' ')}>
                            Depth
                          </button>
                        </th>
                        <th className="px-2 py-1.5">Status</th>
                        <th className="px-2 py-1.5">Set pieces</th>
                        <th className="px-2 py-1.5 text-right">Mins</th>
                        <th className="px-2 py-1.5 text-right">Min/Start</th>
                        <th className="px-2 py-1.5 text-right">PPG</th>
                        <th className="px-2 py-1.5 text-right">{projectedMinutesGw !== null ? `Proj GW${projectedMinutesGw}` : 'Proj Min'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTeamRows.map((r) => (
                        <tr key={r.fpl_player_id} className="border-b border-chalk-200 last:border-b-0">
                          <td className="sticky left-0 z-10 px-3 py-1.5 font-medium text-ink-900 whitespace-nowrap bg-white">{r.web_name}</td>
                          <td className="px-2 py-1.5 font-mono text-xs text-ink-500 uppercase">{FPL_POSITION_LABEL[r.element_type]}</td>
                          <td className="px-2 py-1.5">
                            <RoleSelect row={r} />
                              <SaveState row={r} />
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
                          <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{projectedMinutes.has(r.fpl_player_id) ? Math.round(projectedMinutes.get(r.fpl_player_id)!) : '\u2014'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="w-full border border-chalk-300 rounded-lg bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-ink-500 uppercase tracking-wide">Set piece takers</span>
                  {setPieceLoading && <span className="text-xs text-ink-500 font-mono">{'Loading\u2026'}</span>}
                </div>
                {setPieceError && <p className="text-xs text-loss-700 mb-2">{setPieceError}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {SET_PIECE_HIERARCHY_TYPES.map(({ type, label }) => {
                    const list = setPieceHierarchy.get(type) ?? [];
                    const squadOptions = rows.filter((r) => r.team_id === selectedTeamId && !list.some((l) => l.fpl_player_id === r.fpl_player_id));
                    return (
                      <div key={type} className="border border-chalk-200 rounded p-2">
                        <p className="text-xs font-medium text-ink-700 mb-1">{label}</p>
                        {list.length === 0 && <p className="text-xs text-ink-500 italic">No takers set</p>}
                        <ul className="space-y-0.5">
                          {list.map((r, i) => (
                            <li key={r.set_piece_hierarchy_id} className="flex items-center gap-1 text-xs">
                              <span className="w-4 text-ink-500 font-mono">{r.rank}</span>
                              <span className="flex-1 truncate text-ink-900">{r.web_name}</span>
                              {isAdmin && (
                                <>
                                  <button type="button" disabled={i === 0} onClick={() => handleReorderSetPiece(r, type, 'up')} title="Move up" className="px-1 text-ink-500 hover:text-ink-900 disabled:opacity-20">
                                    &uarr;
                                  </button>
                                  <button type="button" disabled={i === list.length - 1} onClick={() => handleReorderSetPiece(r, type, 'down')} title="Move down" className="px-1 text-ink-500 hover:text-ink-900 disabled:opacity-20">
                                    &darr;
                                  </button>
                                  <button type="button" onClick={() => handleRemoveSetPiece(r)} title="Remove" className="px-1 text-loss-700 hover:text-loss-900">
                                    &times;
                                  </button>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                        {!isAdmin ? null : addingToType === type ? (
                          <div className="flex items-center gap-1 mt-1.5">
                            <select value={addPlayerId} onChange={(e) => setAddPlayerId(e.target.value)} className="flex-1 text-xs border border-chalk-300 rounded px-1 py-0.5">
                              <option value="">Select player&hellip;</option>
                              {squadOptions.map((p) => (
                                <option key={p.fpl_player_id} value={p.fpl_player_id}>
                                  {p.web_name}
                                </option>
                              ))}
                            </select>
                            <button type="button" onClick={() => handleAddSetPiece(type)} disabled={!addPlayerId} className="text-xs px-1.5 py-0.5 rounded bg-pitch-800 text-white disabled:opacity-50">
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingToType(null);
                                setAddPlayerId('');
                              }}
                              className="text-xs px-1.5 py-0.5 rounded border border-chalk-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setAddingToType(type)} className="text-xs text-pitch-800 hover:underline mt-1.5">
                            + Add taker
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-ink-500 mt-2">
                  {!isAdmin
                    ? 'Penalty, free-kick and corner duty as the model currently has it \u2014 it feeds the goal-share allocation behind each player\u2019s projection.'
                    : 'Feeds the penalty/direct free-kick goal-share allocation directly. Changes need \u201cRefresh FPL projections\u201d (Team Strength page) run afterward to show up in points.'}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
