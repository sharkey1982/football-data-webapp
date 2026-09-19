// ============================================================================
// src/lib/fplScoringRulesApi.ts
//
// Reference data for the "how points are scored" page -- reads
// fpl_scoring_rules directly (official FPL rule set, keyed by rule_code +
// player_position; a null player_position means the rule applies to every
// position the same way). Read-only, no derived/computed logic here.
// ============================================================================

import { supabase } from './supabase';
import type { FplElementType } from '../types/database';

export type FplScoringRule = {
  rule_id: number;
  rule_code: string;
  player_position: 'GK' | 'DEF' | 'MID' | 'FWD' | null;
  points: number;
  threshold: number | null;
  notes: string | null;
};

export async function getFplScoringRules(): Promise<FplScoringRule[]> {
  // fpl_scoring_rules is new enough that the generated Database type
  // doesn't know about it yet -- scoped `as any`, matching the same
  // pattern already used for fpl_hindsight_optimal_squad.
  const { data, error } = await supabase
    .from('fpl_scoring_rules')
    .select('rule_id, rule_code, player_position, points, threshold, notes')
    .order('rule_id', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    rule_id: r.rule_id,
    rule_code: r.rule_code,
    player_position: r.player_position as FplScoringRule['player_position'],
    points: Number(r.points),
    threshold: r.threshold === null ? null : Number(r.threshold),
    notes: r.notes,
  }));
}

export type FplPlayerLite = {
  id: number;
  name: string;
  position: FplElementType;
};

/** Lightweight player list for the search/filter control -- id, name, and
 * position only, nothing else this page needs. Single-table query,
 * deliberately no team join -- avoids any uncertainty about which FK a
 * join would resolve through, and team isn't needed to filter scoring
 * rules by position. */
export async function getFplPlayerListLite(): Promise<FplPlayerLite[]> {
  const { data, error } = await supabase
    .from('fpl_players')
    .select('fpl_player_id, web_name, element_type')
    .eq('season_id', 13)
    .not('element_type', 'is', null);
  if (error) throw error;
  return (data ?? [])
    .filter((p) => p.element_type !== null)
    .map((p) => ({
      id: p.fpl_player_id,
      name: p.web_name ?? 'Unknown',
      position: p.element_type as FplElementType,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
