// ============================================================================
// src/lib/formationApi.ts
//
// Opta 2011/12 Premier League, aggregated by formation slot.
//
// The slot numbering follows traditional shirt positions, and that was
// VERIFIED against the data rather than assumed: slot 1 records 1 goal
// and 0 box touches in 251 starts (a goalkeeper), slots 9 and 10 record
// 4.4 and 4.3 box touches per start (strikers), and 2/3/5/6 sit at
// 0.7-0.9 (defenders). The separation is sharp and holds across every
// formation code, so one pitch layout serves all of them.
//
// What is NOT known is what each numeric formation code MEANS. Only
// code 2 is mapped (4-4-2). Opta's internal code list isn't public and
// the source workbook isn't stored, so the rest are shown by code and
// start count rather than given an invented name -- labelling code 6 as
// "4-2-3-1" would be attaching a guess to 1,815 starts.
// ============================================================================

import { supabase } from './supabase';

export type FormationSlot = {
  source_formation_code: string;
  canonical_formation: string | null;
  source_formation_slot: string;
  starts: number;
  minutes: number;
  goals: number;
  open_play_goals: number;
  assists: number;
  key_passes: number;
  shots: number;
  big_chances: number;
  opp_box_touches: number;
  set_piece_assists: number;
  /** Share of the formation's total, 0-1. Already computed in the view,
   * and the shares across a formation's eleven slots sum to 1 -- so
   * "this position produced 31% of the goals" is exact, not derived
   * here and at risk of disagreeing with the source. */
  goal_share: number;
  assist_share: number;
  open_play_goal_share: number;
};

/** Goals from set pieces, INCLUDING penalties -- derived as total minus
 * open play, since the source has no set-piece goals column.
 *
 * Clamped at zero: one slot of 121 (a goalkeeper, on 1 vs 2 goals) has
 * open-play goals exceeding total goals, which is rounding noise in the
 * source rather than a systemic problem. Clamping keeps a nonsense
 * negative off the page without hiding that the two columns can
 * disagree at the margin. */
export function setPieceGoals(r: FormationSlot): number {
  return Math.max(0, r.goals - r.open_play_goals);
}

/** Share of a position's goals that came from set pieces. The headline
 * distinction: a striker on 31% is a different player to a centre-back
 * on 100%. */
export function setPieceGoalPct(r: FormationSlot): number | null {
  if (r.goals <= 0) return null;
  return (setPieceGoals(r) / r.goals) * 100;
}

/** Pitch coordinates for the traditional numbering, as percentages.
 * x = across the pitch (0 left, 100 right), y = up it (0 own goal). */
export const SLOT_POSITIONS: Record<number, { x: number; y: number; label: string }> = {
  1: { x: 50, y: 6, label: 'GK' },
  2: { x: 84, y: 26, label: 'RB' },
  5: { x: 62, y: 20, label: 'CB' },
  6: { x: 38, y: 20, label: 'CB' },
  3: { x: 16, y: 26, label: 'LB' },
  7: { x: 84, y: 58, label: 'RM' },
  4: { x: 62, y: 48, label: 'CM' },
  8: { x: 38, y: 48, label: 'CM' },
  11: { x: 16, y: 58, label: 'LM' },
  10: { x: 62, y: 76, label: 'SS' },
  9: { x: 38, y: 88, label: 'ST' },
};

export type FormationMetric = {
  key: keyof FormationSlot | 'set_piece_goals';
  label: string;
  /** Per-start rather than totals: formations have wildly different
   * sample sizes (2,761 starts down to 33), so raw totals would just
   * rank formations by popularity. */
  perStart: boolean;
  /** Already a 0-1 proportion -- render as a percentage, don't divide
   * by starts. */
  isShare?: boolean;
  /** Computed rather than read straight from a column. */
  derived?: boolean;
};

export const FORMATION_METRICS: FormationMetric[] = [
  // Shares first: "this position scores 31% of the team's goals" is the
  // more interpretable claim, and unlike per-start rates it's directly
  // comparable between formations without thinking about sample size.
  { key: 'goal_share', label: 'Share of goals', perStart: false, isShare: true },
  { key: 'open_play_goal_share', label: 'Share of open-play goals', perStart: false, isShare: true },
  { key: 'assist_share', label: 'Share of assists', perStart: false, isShare: true },
  { key: 'open_play_goals', label: 'Open-play goals', perStart: true },
  { key: 'set_piece_goals', label: 'Set-piece goals (inc. pens)', perStart: true, derived: true },
  { key: 'goals', label: 'All goals', perStart: true },
  { key: 'assists', label: 'Assists', perStart: true },
  { key: 'set_piece_assists', label: 'Set-piece assists', perStart: true },
  { key: 'shots', label: 'Shots', perStart: true },
  { key: 'big_chances', label: 'Big chances', perStart: true },
  { key: 'opp_box_touches', label: 'Opposition box touches', perStart: true },
  { key: 'key_passes', label: 'Key passes', perStart: true },
];

export async function getFormationSlots(): Promise<FormationSlot[]> {
  const { data, error } = await (supabase as any)
    .from('tactical_formation_slot_priors')
    .select('source_formation_code, canonical_formation, source_formation_slot, starts, minutes, goals, open_play_goals, assists, key_passes, shots, big_chances, opp_box_touches, set_piece_assists, goal_share, assist_share, open_play_goal_share')
    .eq('venue_scope', 'ALL');
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    starts: Number(r.starts ?? 0),
    minutes: Number(r.minutes ?? 0),
    goals: Number(r.goals ?? 0),
    open_play_goals: Number(r.open_play_goals ?? 0),
    assists: Number(r.assists ?? 0),
    key_passes: Number(r.key_passes ?? 0),
    shots: Number(r.shots ?? 0),
    big_chances: Number(r.big_chances ?? 0),
    opp_box_touches: Number(r.opp_box_touches ?? 0),
    set_piece_assists: Number(r.set_piece_assists ?? 0),
    goal_share: Number(r.goal_share ?? 0),
    assist_share: Number(r.assist_share ?? 0),
    open_play_goal_share: Number(r.open_play_goal_share ?? 0),
  }));
}

/** Formation label: the canonical name where it's known, otherwise the
 * code. Never a guess. */
export function formationLabel(code: string, canonical: string | null): string {
  return canonical ? `${canonical}` : `Formation ${code}`;
}
