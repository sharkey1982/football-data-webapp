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
import { seasonContextStats, type SetPieceRole } from './fplApi';

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
  const { data, error } = await (supabase as any)
    .from('fpl_players')
    .select('canonical_team_id, teams!fpl_players_canonical_team_id_fkey(canonical_name)')
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
  const { data: playerRows, error: playerErr } = await (supabase as any)
    .from('fpl_players')
    .select('fpl_player_id, web_name, element_type, canonical_team_id, minutes, source_payload, status, news, teams!fpl_players_canonical_team_id_fkey(canonical_name)')
    .eq('season_id', 13)
    .not('element_type', 'is', null)
    .not('canonical_team_id', 'is', null)
    .neq('status', 'u'); // left the club -- not part of the squad to review any more
  if (playerErr) throw playerErr;

  const { data: defaultRows, error: defaultErr } = await (supabase as any)
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

  return (playerRows ?? [])
    .map((p: any) => {
      const td = defaultsByPlayer.get(p.fpl_player_id);
      const stats = seasonContextStats({ minutes: p.minutes, source_payload: p.source_payload });
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
  const { error } = await (supabase as any)
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
  const { data: existing, error: readErr } = await (supabase as any)
    .from('team_player_tactical_defaults')
    .select('tactical_role, source_name, confidence')
    .eq('season_id', 13)
    .eq('team_id', teamId)
    .eq('fpl_player_id', fplPlayerId)
    .maybeSingle();
  if (readErr) throw readErr;
  const { error } = await (supabase as any)
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
 * partial-update functions on this table do. */
export async function saveManualStatus(teamId: number, fplPlayerId: number, elementType: FplElementType, status: string | null, note: string | null): Promise<void> {
  const fallbackRole = elementType === 1 ? 'GK' : elementType === 2 ? 'DEF' : elementType === 3 ? 'MID' : 'CF';
  const { data: existing, error: readErr } = await (supabase as any)
    .from('team_player_tactical_defaults')
    .select('tactical_role, source_name, confidence, depth_rank, depth_rank_source')
    .eq('season_id', 13)
    .eq('team_id', teamId)
    .eq('fpl_player_id', fplPlayerId)
    .maybeSingle();
  if (readErr) throw readErr;
  const { error: writeErr } = await (supabase as any)
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
}

/** Last-reviewed timestamp per team, keyed by team_id -- null if never reviewed. */
export async function getTeamReviewDates(): Promise<Map<number, string>> {
  const { data, error } = await (supabase as any).from('team_tactical_review_log').select('team_id, reviewed_at').eq('season_id', 13);
  if (error) throw error;
  return new Map((data ?? []).map((r: any) => [r.team_id, r.reviewed_at]));
}

/** Marks a team's lineup as reviewed right now -- "Mark reviewed" button. */
export async function markTeamReviewed(teamId: number): Promise<void> {
  const { error } = await (supabase as any).from('team_tactical_review_log').upsert({ season_id: 13, team_id: teamId, reviewed_at: new Date().toISOString() }, { onConflict: 'season_id,team_id' });
  if (error) throw error;
}
