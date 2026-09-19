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
import { getFormationSlots, type FormationSlot } from './formationApi';

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
/** Indirect free kicks are deliberately excluded: they rarely produce a
 * direct goal threat and the taker is usually incidental, so listing
 * them adds noise without telling a manager anything actionable. */
export const SET_PIECE_TYPES: { key: string; label: string }[] = [
  { key: 'penalty', label: 'Penalties' },
  { key: 'direct_free_kick', label: 'Direct free kicks' },
  { key: 'corner_left', label: 'Corners (left)' },
  { key: 'corner_right', label: 'Corners (right)' },
];

/** How much of a league's goals and assists come from set pieces at all.
 *
 * This is the headline the raw taker list needs: knowing who takes the
 * corners only matters if set pieces are a meaningful share of output,
 * and at ~31% of goals and ~43% of assists they plainly are.
 *
 * IMPORTANT LIMITATION: the Opta dataset has no penalty / corner /
 * free-kick breakdown -- only open_play_goals and set_piece_assists,
 * both undifferentiated. So "x% of goals from penalties" and "x% of
 * assists from corners versus direct free kicks" CANNOT be produced
 * from it, and aren't estimated here. Splitting an undifferentiated
 * total by assumed ratios would be inventing the finding. */
export type SetPieceShare = {
  goals: number;
  open_play_goals: number;
  set_piece_goals: number;
  pct_goals_from_set_pieces: number;
  assists: number;
  set_piece_assists: number;
  pct_assists_from_set_pieces: number;
};

export async function getSetPieceShare(): Promise<SetPieceShare | null> {
  const slots: FormationSlot[] = await getFormationSlots();
  if (slots.length === 0) return null;
  const goals = slots.reduce((s, r) => s + r.goals, 0);
  const op = slots.reduce((s, r) => s + r.open_play_goals, 0);
  const assists = slots.reduce((s, r) => s + r.assists, 0);
  const spa = slots.reduce((s, r) => s + r.set_piece_assists, 0);
  const spGoals = Math.max(0, goals - op);
  return {
    goals,
    open_play_goals: op,
    set_piece_goals: spGoals,
    pct_goals_from_set_pieces: goals > 0 ? (spGoals / goals) * 100 : 0,
    assists,
    set_piece_assists: spa,
    pct_assists_from_set_pieces: assists > 0 ? (spa / assists) * 100 : 0,
  };
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
