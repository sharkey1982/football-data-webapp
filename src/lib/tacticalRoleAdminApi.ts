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
import { getCurrentFplSeasonId } from './currentSeason';

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
  /** Admin-set date he is expected back (YYYY-MM-DD), or null. Used by the projections ahead of FPL's date. */
  manual_return_date: string | null;
  /** The date in FPL's own news ("Expected back 18 Oct"), as the projections read it, or null. */
  fpl_return_date: string | null;
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * The return date in FPL's news text, read the same way as the database
 * (fpl_player_fixture_availability): "back"/"until" + day + month, in the
 * year the news was posted, or the next year if that would put it more than
 * two weeks before the news. Returns YYYY-MM-DD or null.
 */
export function parseNewsReturnDate(news: string | null | undefined, newsAdded: string | null | undefined, today: Date = new Date()): string | null {
  if (!news) return null;
  const m = /(?:back|until)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.exec(news);
  if (!m) return null;
  const posted = newsAdded ? new Date(newsAdded) : today;
  const y = posted.getUTCFullYear();
  const month = MONTHS.indexOf(m[2].toLowerCase());
  const day = Number(m[1]);
  let d = new Date(Date.UTC(y, month, day));
  const postedDay = Date.UTC(posted.getUTCFullYear(), posted.getUTCMonth(), posted.getUTCDate());
  if (d.getTime() < postedDay - 14 * 86400000) d = new Date(Date.UTC(y + 1, month, day));
  if (d.getUTCMonth() !== month) return null; // e.g. 31 Sep
  return d.toISOString().slice(0, 10);
}

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
    .eq('season_id', await getCurrentFplSeasonId())
    .not('canonical_team_id', 'is', null);
  if (error) throw error;
  const byId = new Map<number, string>();
  for (const row of (data ?? [])) byId.set(row.canonical_team_id, row.teams?.canonical_name ?? 'Unknown');
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

/** The formation options offered in the admin picker. Deliberately a
 * fixed list rather than whatever happens to be in the data: these are
 * the shapes formation_slot_geometry can actually lay out on a pitch, so
 * offering anything else would save fine and then render nothing. */
export const FORMATION_OPTIONS = ['4-4-2', '4-3-3', '4-2-3-1', '3-4-3', '3-5-2', '5-3-2', '5-4-1', '4-5-1', '4-1-4-1', '3-4-2-1'] as const;

/** A team's CURRENT stored default formation, straight from
 * team_tactical_defaults -- not from the consensus view, which resolves
 * overrides and fallbacks together. The editor needs to show what is
 * stored so a save is a change to a known value. */
export async function getTeamDefaultFormation(teamId: number, seasonId?: number): Promise<{ formation: string | null; isManual: boolean }> {
  const { data, error } = await supabase
    .from('team_tactical_defaults')
    .select('formation, source_name')
    .eq('team_id', teamId)
    .eq('season_id', seasonId ?? (await getCurrentFplSeasonId()))
    .maybeSingle();
  if (error) throw error;
  const row = data as { formation?: string; source_name?: string } | null;
  return { formation: row?.formation ?? null, isManual: row?.source_name === 'manual' };
}

/** Sets a team's formation as a deliberate manual override.
 *
 * source_name='manual' is not cosmetic: fixture_team_tactical_consensus
 * gives manual rows precedence over the scraped per-fixture lineup
 * consensus, where a non-manual default is only a fallback. So this is
 * what makes the edit actually reach the pitch and the projections. */
export async function saveTeamFormation(teamId: number, formation: string, seasonId?: number): Promise<void> {
  const { error } = await supabase
    .from('team_tactical_defaults')
    .upsert({ season_id: seasonId ?? (await getCurrentFplSeasonId()), team_id: teamId, formation, source_name: 'manual', confidence: 1, updated_at: new Date().toISOString() }, { onConflict: 'season_id,team_id' });
  if (error) throw error;
}

export async function getTacticalRoleReview(): Promise<TacticalRoleRow[]> {
  // team_player_tactical_defaults has no foreign key to fpl_players at all
  // (confirmed directly -- information_schema returns zero FK constraints
  // for it), so it can't be embedded via PostgREST's join syntax. Two-step
  // fetch and client-side match instead, matching the pattern already
  // proven elsewhere in this project.
  const { data: playerRows, error: playerErr } = await supabase
    .from('fpl_players')
    .select('fpl_player_id, web_name, element_type, canonical_team_id, minutes, source_payload, status, news, news_added, teams!fpl_players_canonical_team_id_fkey(canonical_name:display_name)')
    .eq('season_id', await getCurrentFplSeasonId())
    .not('element_type', 'is', null)
    .not('canonical_team_id', 'is', null)
    .neq('status', 'u'); // left the club -- not part of the squad to review any more
  if (playerErr) throw playerErr;

  const { data: defaultRows, error: defaultErr } = await supabase
    .from('team_player_tactical_defaults')
    .select('fpl_player_id, team_id, tactical_role, source_name, confidence, depth_rank, manual_status, manual_status_note, manual_return_date')
    .eq('season_id', await getCurrentFplSeasonId());
  if (defaultErr) throw defaultErr;
  const defaultsByPlayer = new Map<number, { tactical_role: string; source_name: string; confidence: number; depth_rank: number | null; manual_status: string | null; manual_status_note: string | null; manual_return_date: string | null }>();
  for (const d of defaultRows ?? [])
    defaultsByPlayer.set(d.fpl_player_id, {
      tactical_role: d.tactical_role,
      source_name: d.source_name,
      confidence: Number(d.confidence),
      depth_rank: d.depth_rank,
      manual_status: d.manual_status ?? null,
      manual_status_note: d.manual_status_note ?? null,
      manual_return_date: d.manual_return_date ?? null,
    });

  // Same merge logic as getFplFixtureProjection: corner_left/corner_right
  // collapse into one 'corner' entry at the better (lower) rank.
  const { data: setPieceRows, error: setPieceErr } = await supabase.from('set_piece_hierarchies').select('*').eq('season_id', await getCurrentFplSeasonId());
  if (setPieceErr) throw setPieceErr;
  const setPieceRolesByPlayer = new Map<number, SetPieceRole[]>();
  for (const row of (setPieceRows ?? [])) {
    const playerId = Number(row.source_player_id);
    if (!Number.isFinite(playerId)) continue;
    // set_piece_type is the five-value CHECK union; the two corner
    // variants collapse to a single 'corner' role here.
    const type: SetPieceRole['type'] =
      row.set_piece_type === 'corner_left' || row.set_piece_type === 'corner_right'
        ? 'corner'
        : (row.set_piece_type as SetPieceRole['type']);
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
        manual_return_date: td?.manual_return_date ?? null,
        fpl_return_date: parseNewsReturnDate(p.news, p.news_added),
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
      { season_id: await getCurrentFplSeasonId(), team_id: teamId, fpl_player_id: fplPlayerId, tactical_role: role, source_name: 'manual', confidence: 1 },
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
    .eq('season_id', await getCurrentFplSeasonId())
    .eq('team_id', teamId)
    .eq('fpl_player_id', fplPlayerId)
    .maybeSingle();
  if (readErr) throw readErr;
  const { error } = await supabase
    .from('team_player_tactical_defaults')
    .upsert(
      {
        season_id: await getCurrentFplSeasonId(),
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
 * Since 6 Oct 2026 the projections read manual_status (and
 * manual_return_date) directly in fpl_player_fixture_availability, fixture
 * by fixture. This used to write fpl_player_squad_state instead, which set
 * a start chance of 0 for every remaining fixture with no way back. */
export async function saveManualStatus(teamId: number, fplPlayerId: number, elementType: FplElementType, status: string | null, note: string | null): Promise<void> {
  const fallbackRole = elementType === 1 ? 'GK' : elementType === 2 ? 'DEF' : elementType === 3 ? 'MID' : 'CF';
  const { data: existing, error: readErr } = await supabase
    .from('team_player_tactical_defaults')
    .select('tactical_role, source_name, confidence, depth_rank, depth_rank_source')
    .eq('season_id', await getCurrentFplSeasonId())
    .eq('team_id', teamId)
    .eq('fpl_player_id', fplPlayerId)
    .maybeSingle();
  if (readErr) throw readErr;
  const { error: writeErr } = await supabase
    .from('team_player_tactical_defaults')
    .upsert(
      {
        season_id: await getCurrentFplSeasonId(),
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

}

/** Saves (or clears, with null) the admin return date (YYYY-MM-DD). The
 * projections use it ahead of FPL's date from the next run: out before it,
 * then 75% / 90% / fit. Preserves the row's other fields like the other
 * partial updates here. */
export async function saveManualReturnDate(teamId: number, fplPlayerId: number, elementType: FplElementType, returnDate: string | null): Promise<void> {
  const fallbackRole = elementType === 1 ? 'GK' : elementType === 2 ? 'DEF' : elementType === 3 ? 'MID' : 'CF';
  const seasonId = await getCurrentFplSeasonId();
  const { data: existing, error: readErr } = await supabase
    .from('team_player_tactical_defaults')
    .select('tactical_role, source_name, confidence')
    .eq('season_id', seasonId)
    .eq('team_id', teamId)
    .eq('fpl_player_id', fplPlayerId)
    .maybeSingle();
  if (readErr) throw readErr;
  const { error } = await supabase
    .from('team_player_tactical_defaults')
    .upsert(
      {
        season_id: seasonId,
        team_id: teamId,
        fpl_player_id: fplPlayerId,
        tactical_role: existing?.tactical_role ?? fallbackRole,
        source_name: existing?.source_name ?? 'fpl_position_fallback',
        confidence: existing?.confidence ?? 0.3,
        manual_return_date: returnDate,
      },
      { onConflict: 'season_id,team_id,fpl_player_id' }
    );
  if (error) throw error;
}

/** Last-reviewed timestamp per team, keyed by team_id -- null if never reviewed. */
export async function getTeamReviewDates(): Promise<Map<number, string>> {
  const { data, error } = await supabase.from('team_tactical_review_log').select('team_id, reviewed_at').eq('season_id', await getCurrentFplSeasonId());
  if (error) throw error;
  return new Map((data ?? []).map((r: any) => [r.team_id, r.reviewed_at]));
}

/** Marks a team's lineup as reviewed right now -- "Mark reviewed" button. */
export async function markTeamReviewed(teamId: number): Promise<void> {
  const { error } = await supabase.from('team_tactical_review_log').upsert({ season_id: await getCurrentFplSeasonId(), team_id: teamId, reviewed_at: new Date().toISOString() }, { onConflict: 'season_id,team_id' });
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
    .eq('season_id', await getCurrentFplSeasonId())
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
  for (const row of (data ?? [])) out.set(row.fpl_player_id, Number(row.expected_minutes));
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
    .eq('season_id', await getCurrentFplSeasonId())
    .eq('team_id', teamId)
    .order('rank', { ascending: true });
  if (error) throw error;
  const out = new Map<SetPieceHierarchyType, SetPieceHierarchyRow[]>();
  for (const row of (data ?? [])) {
    const type = row.set_piece_type as SetPieceHierarchyType;
    const list = out.get(type) ?? [];
    list.push({ set_piece_hierarchy_id: row.set_piece_hierarchy_id, fpl_player_id: Number(row.source_player_id), web_name: row.player_name ?? 'Unknown', rank: row.rank });
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
    .eq('season_id', await getCurrentFplSeasonId())
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
    .eq('season_id', await getCurrentFplSeasonId())
    .eq('team_id', teamId)
    .eq('set_piece_type', setPieceType)
    .order('rank', { ascending: false })
    .limit(1);
  if (readErr) throw readErr;
  const nextRank = ((rows ?? [])[0]?.rank ?? 0) + 1;
  const { error: insertErr } = await supabase.from('set_piece_hierarchies').insert({
    season_id: await getCurrentFplSeasonId(),
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

export async function getTacticalRoleWorklist(seasonId?: number): Promise<TacticalWorklistRow[]> {
  const { data, error } = await supabase.rpc('get_tactical_role_worklist', { p_season_id: seasonId ?? (await getCurrentFplSeasonId()) });
  if (error) throw error;
  // priority is generated by get_tactical_role_worklist itself and is one
  // of 'starter' | 'rotation' | 'fringe' (verified against the function's
  // live output). Plain text to Postgres, so codegen widens it.
  return (data ?? []).map((r) => ({
    ...r,
    priority: r.priority as TacticalWorklistRow['priority'],
    minutes: Number(r.minutes ?? 0),
    ownership: Number(r.ownership ?? 0),
    total_points: Number(r.total_points ?? 0),
    confidence: r.confidence == null ? null : Number(r.confidence),
  }));
}
