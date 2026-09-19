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
/** Indirect free kicks are deliberately excluded: they rarely produce a
 * direct goal threat and the taker is usually incidental, so listing
 * them adds noise without telling a manager anything actionable. */
export const SET_PIECE_TYPES: { key: string; label: string }[] = [
  { key: 'penalty', label: 'Penalties' },
  { key: 'direct_free_kick', label: 'Direct free kicks' },
  { key: 'corner_left', label: 'Corners (left)' },
  { key: 'corner_right', label: 'Corners (right)' },
];

/** Where goals and assists actually come from, split by set-piece type.
 *
 * Previously this could only report an undifferentiated "from set
 * pieces" total, because the imported slice of the Opta workbook had one
 * combined bucket. The full workbook has the split, so penalties,
 * corners and direct free kicks are now separate -- which is the
 * difference between "set pieces matter" and knowing WHICH duty is
 * worth having. */
export type SetPieceBreakdown = {
  goals: number;
  goals_open_play: number;
  goals_from_corners: number;
  goals_from_direct_fk: number;
  goals_from_set_play: number;
  goals_from_penalties: number;
  assists: number;
  assist_corner: number;
  assist_free_kick: number;
  assist_throw_in: number;
  penalties_taken: number;
  corners_taken: number;
};

export type ShareRow = { label: string; goals: number; pct: number };

export async function getSetPieceBreakdown(): Promise<SetPieceBreakdown | null> {
  const { data, error } = await (supabase as any)
    .from('opta_slot_breakdown')
    .select(
      'goals, goals_open_play, goals_from_corners, goals_from_direct_fk, goals_from_set_play, goals_from_penalties, assists, assist_corner, assist_free_kick, assist_throw_in, penalties_taken, corners_taken'
    );
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return null;
  const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  return {
    goals: sum('goals'),
    goals_open_play: sum('goals_open_play'),
    goals_from_corners: sum('goals_from_corners'),
    goals_from_direct_fk: sum('goals_from_direct_fk'),
    goals_from_set_play: sum('goals_from_set_play'),
    goals_from_penalties: sum('goals_from_penalties'),
    assists: sum('assists'),
    assist_corner: sum('assist_corner'),
    assist_free_kick: sum('assist_free_kick'),
    assist_throw_in: sum('assist_throw_in'),
    penalties_taken: sum('penalties_taken'),
    corners_taken: sum('corners_taken'),
  };
}

export function goalSplit(b: SetPieceBreakdown): ShareRow[] {
  const pct = (n: number) => (b.goals > 0 ? (n / b.goals) * 100 : 0);
  return [
    { label: 'Open play', goals: b.goals_open_play, pct: pct(b.goals_open_play) },
    { label: 'Corners', goals: b.goals_from_corners, pct: pct(b.goals_from_corners) },
    { label: 'Penalties', goals: b.goals_from_penalties, pct: pct(b.goals_from_penalties) },
    { label: 'Other set plays', goals: b.goals_from_set_play, pct: pct(b.goals_from_set_play) },
    { label: 'Direct free kicks', goals: b.goals_from_direct_fk, pct: pct(b.goals_from_direct_fk) },
  ].sort((a, z) => z.goals - a.goals);
}

export function assistSplit(b: SetPieceBreakdown): ShareRow[] {
  const setPiece = b.assist_corner + b.assist_free_kick + b.assist_throw_in;
  const pct = (n: number) => (b.assists > 0 ? (n / b.assists) * 100 : 0);
  return [
    { label: 'Open play', goals: Math.max(0, b.assists - setPiece), pct: pct(Math.max(0, b.assists - setPiece)) },
    { label: 'Corners', goals: b.assist_corner, pct: pct(b.assist_corner) },
    { label: 'Free kicks', goals: b.assist_free_kick, pct: pct(b.assist_free_kick) },
    { label: 'Throw-ins', goals: b.assist_throw_in, pct: pct(b.assist_throw_in) },
  ].sort((a, z) => z.goals - a.goals);
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

/** How much a player's set-piece duty is worth, weighted by type.
 *
 * This is what the Opta type breakdown unlocked. Counting duties treats
 * a penalty taker and a corner taker alike, which is most of the point
 * of an index: penalties produced ~7.3% of all goals from roughly one
 * taker per club, corners ~12.8% spread across more.
 *
 * Weights come from the data rather than being assumed, goals count
 * double against assists (6 points vs 3), and rank decays -- a
 * second-choice penalty taker only takes them when the first is off the
 * pitch.
 *
 * The score is a RANKING, not an expected points figure. It says one
 * player's dead-ball role is worth more than another's, not how many
 * points it will produce. */
export type SetPieceIndexRow = {
  team_id: number;
  team_name: string;
  player_name: string;
  duties: number;
  index_score: number;
  detail: string;
};

export async function getSetPieceIndex(seasonId = 13): Promise<SetPieceIndexRow[]> {
  const { data, error } = await (supabase as any).rpc('get_set_piece_index', { p_season_id: seasonId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    duties: Number(r.duties),
    index_score: Number(r.index_score),
  }));
}
