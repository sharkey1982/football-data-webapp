// ============================================================================
// src/lib/tacticalRoleAdminApi.ts
//
// Read and correct team_player_tactical_defaults -- the per-player default
// tactical role used whenever no fixture-specific lineup prediction is
// available (i.e. most of the time for anything more than a few days out).
// About half the player pool currently only has a generic position-based
// placeholder (source_name = 'fpl_position_fallback') rather than a real
// role, because the external source (fantasy_football_scout) doesn't cover
// every player -- this page exists to let that be reviewed and manually
// corrected where it matters.
// ============================================================================

import { supabase } from './supabase';
import type { FplElementType } from '../types/database';

export type TacticalRoleRow = {
  fpl_player_id: number;
  web_name: string;
  element_type: FplElementType;
  team_id: number;
  team_name: string;
  tactical_role: string;
  source_name: string;
  confidence: number;
};

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

export async function getTacticalRoleReview(): Promise<TacticalRoleRow[]> {
  // team_player_tactical_defaults has no foreign key to fpl_players at all
  // (confirmed directly -- information_schema returns zero FK constraints
  // for it), so it can't be embedded via PostgREST's join syntax. Two-step
  // fetch and client-side match instead, matching the pattern already
  // proven elsewhere in this project.
  const { data: playerRows, error: playerErr } = await (supabase as any)
    .from('fpl_players')
    .select('fpl_player_id, web_name, element_type, canonical_team_id, teams!fpl_players_canonical_team_id_fkey(canonical_name)')
    .eq('season_id', 13)
    .not('element_type', 'is', null)
    .not('canonical_team_id', 'is', null);
  if (playerErr) throw playerErr;

  const { data: defaultRows, error: defaultErr } = await (supabase as any)
    .from('team_player_tactical_defaults')
    .select('fpl_player_id, team_id, tactical_role, source_name, confidence')
    .eq('season_id', 13);
  if (defaultErr) throw defaultErr;
  const defaultsByPlayer = new Map<number, { tactical_role: string; source_name: string; confidence: number }>();
  for (const d of defaultRows ?? []) defaultsByPlayer.set(d.fpl_player_id, { tactical_role: d.tactical_role, source_name: d.source_name, confidence: Number(d.confidence) });

  return (playerRows ?? [])
    .map((p: any) => {
      const td = defaultsByPlayer.get(p.fpl_player_id);
      return {
        fpl_player_id: p.fpl_player_id,
        web_name: p.web_name ?? 'Unknown',
        element_type: p.element_type as FplElementType,
        team_id: p.canonical_team_id,
        team_name: p.teams?.canonical_name ?? 'Unknown',
        tactical_role: td?.tactical_role ?? 'Unknown',
        source_name: td?.source_name ?? 'none',
        confidence: td?.confidence ?? 0,
      };
    })
    .sort((a: TacticalRoleRow, b: TacticalRoleRow) => a.team_name.localeCompare(b.team_name) || a.element_type - b.element_type || a.web_name.localeCompare(b.web_name));
}

/** Saves a manual correction -- always source_name='manual', confidence=1
 * (the reviewer's own judgement, not a scraped estimate). Upserts on the
 * table's composite key (season_id, team_id, fpl_player_id). */
export async function saveTacticalRoleCorrection(teamId: number, fplPlayerId: number, role: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('team_player_tactical_defaults')
    .upsert(
      { season_id: 13, team_id: teamId, fpl_player_id: fplPlayerId, tactical_role: role, source_name: 'manual', confidence: 1 },
      { onConflict: 'season_id,team_id,fpl_player_id' }
    );
  if (error) throw error;
}
