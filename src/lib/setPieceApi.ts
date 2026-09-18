// ============================================================================
// src/lib/setPieceApi.ts
//
// Set-piece takers by club. Factual: who takes what, in what order.
//
// Information FPL managers actively hunt for and which is scattered,
// stale or paywalled almost everywhere else -- a genuine reason to come
// here rather than a restatement of what's already on the official site.
// ============================================================================

import { supabase } from './supabase';

export type SetPieceTaker = {
  team_id: number;
  team_name: string;
  team_slug: string | null;
  set_piece_type: string;
  player_name: string;
  rank: number;
  confidence: number | null;
  source_name: string | null;
  updated_at: string | null;
};

/** Display order and labels. Penalties first because they're worth the
 * most and are what people actually come to check. */
export const SET_PIECE_TYPES: { key: string; label: string }[] = [
  { key: 'penalty', label: 'Penalties' },
  { key: 'direct_free_kick', label: 'Direct free kicks' },
  { key: 'indirect_free_kick', label: 'Indirect free kicks' },
  { key: 'corner_left', label: 'Corners (left)' },
  { key: 'corner_right', label: 'Corners (right)' },
];

export async function getSetPieceTakers(seasonId = 13): Promise<SetPieceTaker[]> {
  const { data, error } = await (supabase as any).rpc('get_set_piece_takers', { p_season_id: seasonId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    rank: Number(r.rank),
    confidence: r.confidence == null ? null : Number(r.confidence),
  }));
}
