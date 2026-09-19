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
import { getFormationSlots, SLOT_POSITIONS, type FormationSlot } from './formationApi';

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

/** What the historical Opta data says about set-piece output by pitch
 * position, pooled across formations.
 *
 * This is the honest form of "what does taking set pieces imply". It
 * describes POSITIONS, not players: the tactical-role data can't yet say
 * which slot a given player occupies (most are still on a positional
 * fallback), so attaching a per-player expectation would be inventing
 * precision the data doesn't support. Pooling across formations is
 * deliberate too -- a single formation's slot can rest on 33 starts. */
export type SetPiecePositionContext = {
  slot: number;
  label: string;
  starts: number;
  set_piece_assists: number;
  set_piece_assists_per_start: number;
  share_of_set_piece_assists: number;
};

export async function getSetPiecePositionContext(): Promise<SetPiecePositionContext[]> {
  const slots: FormationSlot[] = await getFormationSlots();
  const agg = new Map<number, { starts: number; spa: number }>();
  for (const r of slots) {
    const slot = Number(r.source_formation_slot);
    const cur = agg.get(slot) ?? { starts: 0, spa: 0 };
    cur.starts += r.starts;
    cur.spa += r.set_piece_assists;
    agg.set(slot, cur);
  }
  const totalSpa = [...agg.values()].reduce((s, v) => s + v.spa, 0);
  return [...agg.entries()]
    .map(([slot, v]) => ({
      slot,
      label: SLOT_POSITIONS[slot]?.label ?? `Slot ${slot}`,
      starts: v.starts,
      set_piece_assists: v.spa,
      set_piece_assists_per_start: v.starts > 0 ? v.spa / v.starts : 0,
      share_of_set_piece_assists: totalSpa > 0 ? (v.spa / totalSpa) * 100 : 0,
    }))
    .sort((a, b) => b.share_of_set_piece_assists - a.share_of_set_piece_assists);
}

export async function getSetPieceTakers(seasonId = 13): Promise<SetPieceTaker[]> {
  const { data, error } = await (supabase as any).rpc('get_set_piece_takers', { p_season_id: seasonId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    rank: Number(r.rank),
    confidence: r.confidence == null ? null : Number(r.confidence),
  }));
}
