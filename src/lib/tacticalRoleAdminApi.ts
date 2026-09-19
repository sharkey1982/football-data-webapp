// ============================================================================
// src/lib/tacticalRoleAdminApi.ts
//
// Read and correct team_player_tactical_defaults -- the per-player default
// tactical role and depth_rank (1st/2nd/3rd choice starter within their
// FPL position) used whenever no fixture-specific lineup prediction is
// available, i.e. most of the time for anything more than a few days out.
// About half the player pool currently only has a generic position-based
// placeholder (source_name = 'fpl_position_fallback') rather than a real
// role, because the external source (fantasy_football_scout) doesn't cover
// every player -- this page exists to let that be reviewed and manually
// corrected where it matters.
//
// depth_rank is seeded automatically from fixture_player_tactical_consensus
// (role_weight >= ~0.8 cleanly separates a team's actual predicted XI from
// fringe/bench players) and tracks its own source (depth_rank_source) so a
// future re-seed never overwrites a manual correction -- the "app default
// vs user override" distinction raised directly, applied here specifically.
//
// Set-piece info reuses the exact merge logic already proven in
// getFplFixtureProjection (corner_left/corner_right collapse into one
// 'corner' entry at the better rank) -- same source table
// (set_piece_hierarchies), same season-long scope, just not tied to one
// fixture here.
//
// Players who have left the club (fpl_players.status = 'u', e.g. a
// permanent transfer out) are excluded entirely -- they're not part of the
// squad to assign a tactical role or depth rank to any more. Players who
// are currently injured/doubtful/suspended (status i/d/s) ARE still
// included, with that status and the news text surfaced, since those are
// temporary and exactly what the depth chart needs to reflect.
// ============================================================================

import { supabase } from './supabase';
import type { FplElementType } from '../types/database';
import { seasonContextStats, getGamesInvolvedCounts, type SetPieceRole } from './fplApi';

export type TacticalRoleRow = {
  fpl_player_id: number;
  web_name: string;
  element_type: FplElementType;
  team_id: number;
  team_name: string;
  tactical_role: string;
  source_name: string;
  confidence: number;
  depth_rank: number | null;
  set_piece_roles: SetPieceRole[];
  points_per_game: number | null;
  avg_minutes_per_start: number | null;
  /** Season-to-date total minutes played -- raw appearance volume, for sense-checking a depth-rank pick alongside PPG and avg minutes/start. */
  minutes: number | null;
  /** Official FPL availability code: a = available, d = doubtful, i = injured, s = suspended. Players with status 'u' (left the club) are excluded entirely, never appear here. This is the EFFECTIVE status -- manual_status if set, otherwise the FPL-sourced one. */
  status: string | null;
  news: string | null;
  /** Whether `status`/`news` above came from a manual override (true) or the FPL-sourced data (false) -- lets the UI show that a value has been manually set. */
  status_is_manual: boolean;
};

export type TeamOption = { team_id: number; team_name: string };

// Every role value actually in use, grouped for a sensible dropdown --
// deliberately not restricted to "roles matching this player's FPL
// position", since the real data has legitimate cross-position
// assignments (e.g. an FPL-registered defender at RW as an auxiliary
// wing-back who pushes forward).
export const TACTICAL_ROLE_OPTIONS = [
  'GK',
  'CB', 'LCB', 'RCB', 'LB', 'RB', 'LWB', 'RWB', 'DEF',
  'DM', 'CM', 'AM', 'LW', 'RW', 'MID',
  'CF', 'FWD',
] as const;

export const DEPTH_RANK_OPTIONS = [1, 2, 3, 4, 5] as const;

/** Current-season EPL teams only -- derived from fpl_players (season_id
 * 13) rather than the raw teams table, which holds 242 teams across every
 * league and season this app has ever touched, not just the current 20. */
export async function getTeamOptions(): Promise<TeamOption[]> {
  const { data, error } = await supabase
    .from('fpl_players')
    .select('canonical_team_id, teams!fpl_players_canonical_team_id_fkey(canonical_name:display_name)')
    .eq('season_id', 13)
    .not('canonical_team_id', 'is', null);
  if (error) throw error;
  const byId = new Map<number, string>();
  for (const row of (data ?? []) as any[]) byId.set(row.canonical_team_id, row.teams?.canonical_name ?? 'Unknown');
  return [...byId.entries()].map(([team_id, team_name]) => ({ team_id, team_name })).sort((a, b) => a.team_name.localeCompare(b.team_name));
}

/** A team's formation (e.g. "4-2-3-1"), stable across the whole season
 * (confirmed directly -- one value per team across all 38 gameweeks), so
 * any single fixture's row is representative. Returns null if the team
 * has no consensus row at all. */
export async function getTeamFormation(teamId: number): Promise<string | null> {
  const { data, error } = await supabase.from('fixture_team_tactical_consensus').select('formation').eq('team_id', teamId).limit(1).maybeSingle();
  if (error) throw error;
  return (data as any)?.formation ?? null;
}

export async function getTacticalRoleReview(): Promise<TacticalRoleRow[]> {
  // team_player_tactical_defaults has no foreign key to fpl_players at all
  // (confirmed directly -- information_schema returns zero FK constraints
  // for it), so it can't be embedded via PostgREST's join syntax. Two-step
  // fetch and client-side match instead, matching the pattern already
  // proven elsewhere in this project.
  const { data: playerRows, error: playerErr } = await supabase
    .from('fpl_players')
    .select('fpl_player_id, web_name, element_type, canonical_team_id, minutes, source_payload, status, news, teams!fpl_players_canonical_team_id_fkey(canonical_name:display_name)')
    .eq('season_id', 13)
    .not('element_type', 'is', null)
    .not('canonical_team_id', 'is', null)
    .neq('status', 'u'); // left the club -- not part of the squad to review any more
  if (playerErr) throw playerErr;

  const { data: defaultRows, error: defaultErr } = await supabase
    .from('team_player_tactical_defaults')
    .select('fpl_player_id, team_id, tactical_role, source_name, confidence, depth_rank, manual_status, manual_status_note')
    .eq('season_id', 13);
  if (defaultErr) throw defaultErr;
  const defaultsByPlayer = new Map<number, { tactical_role: string; source_name: string; confidence: number; depth_rank: number | null; manual_status: string | null; manual_status_note: string | null }>();
  for (const d of defaultRows ?? [])
    defaultsByPlayer.set(d.fpl_player_id, {
      tactical_role: d.tactical_role,
      source_name: d.source_name,
      confidence: Number(d.confidence),
      depth_rank: d.depth_rank,
      manual_status: d.manual_status ?? null,
      manual_status_note: d.manual_status_note ?? null,
    });

  // Same merge logic as getFplFixtureProjection: corner_left/corner_right
  // collapse into one 'corner' entry at the better (lower) rank.
  const { data: setPieceRows, error: setPieceErr } = await supabase.from('set_piece_hierarchies').select('*').eq('season_id', 13);
  if (setPieceErr) throw setPieceErr;
  const setPieceRolesByPlayer = new Map<number, SetPieceRole[]>();
  for (const row of (setPieceRows ?? []) as any[]) {
    const playerId = Number(row.source_player_id);
    if (!Number.isFinite(playerId)) continue;
    const type: SetPieceRole['type'] = row.set_piece_type === 'corner_left' || row.set_piece_type === 'corner_right' ? 'corner' : row.set_piece_type;
    const existing = setPieceRolesByPlayer.get(playerId) ?? [];
    const already = existing.find((r) => r.type === type);
    if (already) already.rank = Math.min(already.rank, row.rank);
    else existing.push({ type, rank: row.rank });
    setPieceRolesByPlayer.set(playerId, existing);
  }

  const gamesInvolvedByPlayer = await getGamesInvolvedCounts((playerRows ?? []).map((p: any) => p.fpl_player_id));

  return (playerRows ?? [])
    .map((p: any) => {
      const td = defaultsByPlayer.get(p.fpl_player_id);
      const stats = seasonContextStats({ minutes: p.minutes, source_payload: p.source_payload }, gamesInvolvedByPlayer.get(p.fpl_player_id) ?? null);
      return {
        fpl_player_id: p.fpl_player_id,
        web_name: p.web_name ?? 'Unknown',
        element_type: p.element_type as FplElementType,
        team_id: p.canonical_team_id,
        team_name: p.teams?.canonical_name ?? 'Unknown',
        tactical_role: td?.tactical_role ?? 'Unknown',
        source_name: td?.source_name ?? 'none',
        confidence: td?.confidence ?? 0,
        depth_rank: td?.depth_rank ?? null,
        set_piece_roles: (setPieceRolesByPlayer.get(p.fpl_player_id) ?? []).sort((a, b) => a.rank - b.rank),
        points_per_game: stats.points_per_game,
        avg_minutes_per_start: stats.avg_minutes_per_start,
        minutes: p.minutes ?? null,
        status: td?.manual_status ?? p.status ?? null,
        news: td?.manual_status ? td?.manual_status_note ?? null : p.news || null,
        status_is_manual: td?.manual_status != null,
      };
    })
    .sort((a: TacticalRoleRow, b: TacticalRoleRow) => a.team_name.localeCompare(b.team_name) || a.element_type - b.element_type || a.web_name.localeCompare(b.web_name));
}

/** Saves a manual role correction -- always source_name='manual',
 * confidence=1 (the reviewer's own judgement, not a scraped estimate).
 * Upserts on the table's composite key. Leaves depth_rank untouched --
 * the two fields are saved independently since they're edited via
 * separate controls. */
export async function saveTacticalRoleCorrection(teamId: number, fplPlayerId: number, role: string): Promise<void> {
  const { error } = await supabase
    .from('team_player_tactical_defaults')
    .upsert(
      { season_id: 13, team_id: teamId, fpl_player_id: fplPlayerId, tactical_role: role, source_name: 'manual', confidence: 1 },
      { onConflict: 'season_id,team_id,fpl_player_id' }
    );
  if (error) throw error;
}

/** Saves a depth-rank correction. Always sets depth_rank_source='manual'
 * so a future automated re-seed skips this row rather than overwriting
 * it. Only updates depth_rank -- if the row doesn't exist yet (no role
 * reviewed), falls back to the same generic position label the rest of
 * the pipeline uses, so this never creates a row with a null
 * tactical_role. */
export async function saveDepthRankCorrection(teamId: number, fplPlayerId: number, elementType: FplElementType, depthRank: number | null): Promise<void> {
  const fallbackRole = elementType === 1 ? 'GK' : elementType === 2 ? 'DEF' : elementType === 3 ? 'MID' : 'CF';
  const { data: existing, error: readErr } = await supabase
    .from('team_player_tactical_defaults')
    .select('tactical_role, source_name, confidence')
    .eq('season_id', 13)
    .eq('team_id', teamId)
    .eq('fpl_player_id', fplPlayerId)
    .maybeSingle();
  if (readErr) throw readErr;
  const { error } = await supabase
    .from('team_player_tactical_defaults')
    .upsert(
      {
        season_id: 13,
        team_id: teamId,
        fpl_player_id: fplPlayerId,
        tactical_role: existing?.tactical_role ?? fallbackRole,
        source_name: existing?.source_name ?? 'fpl_position_fallback',
        confidence: existing?.confidence ?? 0.3,
        depth_rank: depthRank,
        depth_rank_source: 'manual',
      },
      { onConflict: 'season_id,team_id,fpl_player_id' }
    );
  if (error) throw error;
}

export const MANUAL_STATUS_OPTIONS = [
  { value: '', label: 'Use FPL status' },
  { value: 'a', label: 'Available' },
  { value: 'd', label: 'Doubtful' },
  { value: 'i', label: 'Injured' },
  { value: 's', label: 'Suspended' },
] as const;

/** Saves (or clears, if status is null) a manual availability override --
 * takes precedence over the FPL-sourced status/news whenever set.
 * Preserves the existing tactical_role/depth_rank the same way the other
 * partial-update functions on this table do.
 *
 * Also writes (or clears) the corresponding row in fpl_player_squad_state
 * -- the table that ACTUALLY feeds expected_minutes, projections, and the
 * optimizer (via fpl_player_squad_state_current -> fixture_player_expected_
 * minutes_resolved_v3). manual_status on team_player_tactical_defaults on
 * its own is display-only (used by this page's badges and depth-chart
 * injury promotion); nothing in the projection pipeline reads it.
 * Confirmed directly (no view in the database references manual_status)
 * after a manual injury tag didn't change the optimal squad -- this was
 * the gap. Uses a fixed sentinel effective_from so repeated edits update
 * the same row rather than accumulating one per edit, and the view
 * (updated alongside this) prioritises this source over the automated
 * feed regardless of which has a more recent effective_from, so a later
 * scheduled import doesn't silently override it. */
export async function saveManualStatus(teamId: number, fplPlayerId: number, elementType: FplElementType, status: string | null, note: string | null): Promise<void> {
  const fallbackRole = elementType === 1 ? 'GK' : elementType === 2 ? 'DEF' : elementType === 3 ? 'MID' : 'CF';
  const { data: existing, error: readErr } = await supabase
    .from('team_player_tactical_defaults')
    .select('tactical_role, source_name, confidence, depth_rank, depth_rank_source')
    .eq('season_id', 13)
    .eq('team_id', teamId)
    .eq('fpl_player_id', fplPlayerId)
    .maybeSingle();
  if (readErr) throw readErr;
  const { error: writeErr } = await supabase
    .from('team_player_tactical_defaults')
    .upsert(
      {
        season_id: 13,
        team_id: teamId,
        fpl_player_id: fplPlayerId,
        tactical_role: existing?.tactical_role ?? fallbackRole,
        source_name: existing?.source_name ?? 'fpl_position_fallback',
        confidence: existing?.confidence ?? 0.3,
        depth_rank: existing?.depth_rank ?? null,
        depth_rank_source: existing?.depth_rank_source ?? null,
        manual_status: status,
        manual_status_note: note,
      },
      { onConflict: 'season_id,team_id,fpl_player_id' }
    );
  if (writeErr) throw writeErr;

  // Sentinel effective_from -- far enough in the past to never collide
  // with real automated-feed rows, and fixed so repeated saves upsert
  // the same manual-override row instead of piling up.
  const MANUAL_OVERRIDE_EFFECTIVE_FROM = '2020-01-01T00:00:00Z';

  if (!status) {
    // Cleared back to "Use FPL status" -- remove the override entirely so
    // the automated feed (or the normal model fallback) takes over again.
    const { error: deleteErr } = await supabase
      .from('fpl_player_squad_state')
      .delete()
      .eq('season_id', 13)
      .eq('fpl_player_id', fplPlayerId)
      .eq('source_name', 'manual_tactical_override');
    if (deleteErr) throw deleteErr;
    return;
  }

  const STATE_BY_STATUS: Record<string, { state: string; availability_probability: number; start_probability_override: number | null }> = {
    a: { state: 'active', availability_probability: 1, start_probability_override: null },
    d: { state: 'doubtful', availability_probability: 0.5, start_probability_override: null },
    i: { state: 'injured', availability_probability: 0, start_probability_override: 0 },
    s: { state: 'suspended', availability_probability: 0, start_probability_override: 0 },
  };
  const mapped = STATE_BY_STATUS[status];
  if (!mapped) return; // unrecognised status code -- nothing sensible to write downstream

  const { error: squadStateErr } = await supabase.from('fpl_player_squad_state').upsert(
    {
      season_id: 13,
      fpl_player_id: fplPlayerId,
      team_id: teamId,
      state: mapped.state,
      availability_probability: mapped.availability_probability,
      start_probability_override: mapped.start_probability_override,
      effective_from: MANUAL_OVERRIDE_EFFECTIVE_FROM,
      effective_to: null,
      source_name: 'manual_tactical_override',
      source_reference: null,
      evidence: note,
    },
    { onConflict: 'season_id,fpl_player_id,effective_from' }
  );
  if (squadStateErr) throw squadStateErr;
}

/** Last-reviewed timestamp per team, keyed by team_id -- null if never reviewed. */
export async function getTeamReviewDates(): Promise<Map<number, string>> {
  const { data, error } = await supabase.from('team_tactical_review_log').select('team_id, reviewed_at').eq('season_id', 13);
  if (error) throw error;
  return new Map((data ?? []).map((r: any) => [r.team_id, r.reviewed_at]));
}

/** Marks a team's lineup as reviewed right now -- "Mark reviewed" button. */
export async function markTeamReviewed(teamId: number): Promise<void> {
  const { error } = await supabase.from('team_tactical_review_log').upsert({ season_id: 13, team_id: teamId, reviewed_at: new Date().toISOString() }, { onConflict: 'season_id,team_id' });
  if (error) throw error;
}

/** Projected minutes for the given matchweek, keyed by fpl_player_id --
 * requested directly, to sense-check depth-rank assumptions against what
 * the model itself currently expects for the next game, not just season
 * history. Players with no projection yet for this matchweek (e.g. a
 * departed/injured player) simply won't have an entry. fpl_player_projections
 * has no foreign key to fixtures (confirmed directly), so this resolves
 * the matchweek's fixture_ids first rather than attempting an embedded join. */
export async function getProjectedMinutes(matchweek: number): Promise<Map<number, number>> {
  const { data: fixtureRows, error: fixtureErr } = await supabase
    .from('fixtures')
    .select('fixture_id')
    .eq('matchweek', matchweek)
    .eq('season_id', 13)
    .eq('league_id', 1);
  if (fixtureErr) throw fixtureErr;
  const fixtureIds = (fixtureRows ?? []).map((f: any) => f.fixture_id);
  const out = new Map<number, number>();
  if (fixtureIds.length === 0) return out;

  const { data, error } = await supabase
    .from('fpl_player_projections')
    .select('fpl_player_id, expected_minutes')
    .eq('model_version', 'leaguewide_v6')
    .eq('scenario_key', 'baseline')
    .in('fixture_id', fixtureIds);
  if (error) throw error;
  for (const row of (data ?? []) as any[]) out.set(row.fpl_player_id, Number(row.expected_minutes));
  return out;
}

export type SetPieceHierarchyType = 'penalty' | 'direct_free_kick' | 'indirect_free_kick' | 'corner_left' | 'corner_right';

export interface SetPieceHierarchyRow {
  set_piece_hierarchy_id: number;
  fpl_player_id: number;
  web_name: string;
  rank: number;
}

export const SET_PIECE_HIERARCHY_TYPES: { type: SetPieceHierarchyType; label: string }[] = [
  { type: 'penalty', label: 'Penalties' },
  { type: 'direct_free_kick', label: 'Direct free-kicks' },
  { type: 'indirect_free_kick', label: 'Indirect free-kicks' },
  { type: 'corner_left', label: 'Corners (left)' },
  { type: 'corner_right', label: 'Corners (right)' },
];

/** A team's full set-piece taking order, one ranked list per type --
 * requested directly, so a taker change (injury, transfer) can be made
 * by Chris himself rather than requiring a manual SQL update each time.
 * Reading this table directly (not via a computed exposure view) since
 * the edit UI needs the raw ranks, not the derived per-fixture exposure
 * numbers those views compute from it. */
export async function getSetPieceHierarchyForTeam(teamId: number): Promise<Map<SetPieceHierarchyType, SetPieceHierarchyRow[]>> {
  const { data, error } = await supabase
    .from('set_piece_hierarchies')
    .select('set_piece_hierarchy_id, set_piece_type, source_player_id, player_name, rank')
    .eq('season_id', 13)
    .eq('team_id', teamId)
    .order('rank', { ascending: true });
  if (error) throw error;
  const out = new Map<SetPieceHierarchyType, SetPieceHierarchyRow[]>();
  for (const row of (data ?? []) as any[]) {
    const type = row.set_piece_type as SetPieceHierarchyType;
    const list = out.get(type) ?? [];
    list.push({ set_piece_hierarchy_id: row.set_piece_hierarchy_id, fpl_player_id: Number(row.source_player_id), web_name: row.player_name, rank: row.rank });
    out.set(type, list);
  }
  return out;
}

/** Swaps rank with the adjacent entry (up = swap with the one ranked
 * above, i.e. numerically lower) -- an atomic pair of updates so ranks
 * never collide mid-edit, rather than free-text rank entry that could
 * produce two players sharing a rank. */
export async function reorderSetPieceTaker(hierarchyId: number, teamId: number, setPieceType: SetPieceHierarchyType, direction: 'up' | 'down'): Promise<void> {
  const { data: rows, error: readErr } = await supabase
    .from('set_piece_hierarchies')
    .select('set_piece_hierarchy_id, rank')
    .eq('season_id', 13)
    .eq('team_id', teamId)
    .eq('set_piece_type', setPieceType)
    .order('rank', { ascending: true });
  if (readErr) throw readErr;
  const list = (rows ?? []) as { set_piece_hierarchy_id: number; rank: number }[];
  const idx = list.findIndex((r) => r.set_piece_hierarchy_id === hierarchyId);
  if (idx === -1) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return; // already at the top/bottom

  const a = list[idx];
  const b = list[swapIdx];
  // Direct two-step swap -- confirmed directly there's no unique
  // constraint on rank itself (only a CHECK that it's > 0, which a
  // negative temporary value would have violated), so no transient-
  // duplicate collision risk to guard against here.
  const { error: e1 } = await supabase.from('set_piece_hierarchies').update({ rank: b.rank }).eq('set_piece_hierarchy_id', a.set_piece_hierarchy_id);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('set_piece_hierarchies').update({ rank: a.rank }).eq('set_piece_hierarchy_id', b.set_piece_hierarchy_id);
  if (e2) throw e2;
}

/** Adds a player to the bottom of a set-piece list (rank = current max + 1). */
export async function addSetPieceTaker(teamId: number, setPieceType: SetPieceHierarchyType, fplPlayerId: number, webName: string): Promise<void> {
  const { data: rows, error: readErr } = await supabase
    .from('set_piece_hierarchies')
    .select('rank')
    .eq('season_id', 13)
    .eq('team_id', teamId)
    .eq('set_piece_type', setPieceType)
    .order('rank', { ascending: false })
    .limit(1);
  if (readErr) throw readErr;
  const nextRank = ((rows ?? [])[0]?.rank ?? 0) + 1;
  const { error: insertErr } = await supabase.from('set_piece_hierarchies').insert({
    season_id: 13,
    team_id: teamId,
    set_piece_type: setPieceType,
    source_name: 'manual',
    source_player_id: String(fplPlayerId),
    player_name: webName,
    rank: nextRank,
    confidence: 1,
  });
  if (insertErr) throw insertErr;
}

/** Removes a player from a set-piece list entirely (e.g. sold, retired
 * from set-piece duty) -- does not renumber the remaining ranks, since
 * gaps are harmless (only relative order matters to 1/rank weighting
 * downstream). */
export async function removeSetPieceTaker(hierarchyId: number): Promise<void> {
  const { error } = await supabase.from('set_piece_hierarchies').delete().eq('set_piece_hierarchy_id', hierarchyId);
  if (error) throw error;
}

/** Prioritised worklist for the manual tactical-role pass.
 *
 * 412 players sit on the positional fallback, which sounds like a large
 * job and isn't: only 6 are regular starters and 51 are rotation
 * players. The remaining 355 have under 90 minutes all season, and a
 * role assigned to someone who never plays changes no projection.
 *
 * Ordered by minutes then ownership so the pass can stop at any point
 * and whatever's left is always the least consequential. */
export type TacticalWorklistRow = {
  team_id: number;
  team_name: string | null;
  fpl_player_id: number;
  web_name: string;
  slug: string | null;
  position_label: string;
  assigned_role: string | null;
  confidence: number | null;
  minutes: number;
  ownership: number;
  total_points: number;
  priority: 'starter' | 'rotation' | 'fringe';
};

export async function getTacticalRoleWorklist(seasonId = 13): Promise<TacticalWorklistRow[]> {
  const { data, error } = await supabase.rpc('get_tactical_role_worklist', { p_season_id: seasonId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    minutes: Number(r.minutes ?? 0),
    ownership: Number(r.ownership ?? 0),
    total_points: Number(r.total_points ?? 0),
    confidence: r.confidence == null ? null : Number(r.confidence),
  }));
}
