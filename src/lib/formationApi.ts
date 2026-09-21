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

/** Per-formation slot geometry, from the Opta formation guide.
 *
 * This replaces a single hardcoded 4-4-2-style layout that was applied
 * to every formation. That was right for 4-4-2 and wrong elsewhere: in
 * 5-3-2 slot 4 is a defender, not a midfielder, and in 3-4-3 slot 2 is
 * a wing-back in midfield rather than a full-back. One template put
 * players in the wrong third of the pitch. */
export type SlotGeometry = { slot: number; x_pct: number; y_pct: number };

export async function getFormationGeometry(): Promise<Map<string, Map<number, SlotGeometry>>> {
  const { data, error } = await supabase
    .from('formation_slot_geometry')
    .select('source_formation_code, slot, x_pct, y_pct');
  if (error) throw error;
  const out = new Map<string, Map<number, SlotGeometry>>();
  for (const r of (data ?? [])) {
    if (!out.has(r.source_formation_code)) out.set(r.source_formation_code, new Map());
    out.get(r.source_formation_code)!.set(Number(r.slot), {
      slot: Number(r.slot),
      x_pct: Number(r.x_pct),
      y_pct: Number(r.y_pct),
    });
  }
  return out;
}

export async function getFormationNames(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('formation_code_names')
    .select('source_formation_code, canonical_formation');
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.source_formation_code, r.canonical_formation]));
}

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
  const { data, error } = await supabase
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

/** Formation label: the name from the Opta guide where known, otherwise
 * the raw code. Never a guess. */
export function formationLabel(code: string, canonical: string | null | undefined): string {
  return canonical ? canonical : `Formation ${code}`;
}

// ---- Comparing formations by ROLE --------------------------------------------
// Each formation numbers its eleven slots differently, so formations are
// compared by role, read from where each slot sits on the pitch (x: 0 left to
// 100 right; y: 0 own goal to 100 opponents' goal). A 4-3-3's wide forwards
// and a 4-2-3-1's wide attacking midfielders are both "Wide players".
export const ROLES = ['Strikers', 'No.10', 'Wide players', 'Central midfield', 'Full-backs', 'Centre-backs', 'Goalkeeper'] as const;
export type Role = (typeof ROLES)[number];

export function roleOf(x: number, y: number): Role {
  const wide = (edge: number) => x < edge || x > 100 - edge;
  if (y < 10) return 'Goalkeeper';
  if (y < 40) return wide(25) ? 'Full-backs' : 'Centre-backs';
  if (y < 66) return wide(25) ? 'Wide players' : 'Central midfield';
  if (y < 80) return wide(35) ? 'Wide players' : 'No.10';
  return wide(35) ? 'Wide players' : 'Strikers';
}

export type RoleMetric = 'goals' | 'assists' | 'ga';

export type RoleGrid = {
  formations: { code: string; name: string; matches: number }[];
  /** share of the formation's total for each role (0-1); null = no such role */
  cells: Record<Role, (number | null)[]>;
  max: number;
};

/**
 * Share of each formation's goals / assists / goals+assists by role, for
 * formations used in at least `minMatches` matches (fewer is too thin to
 * compare). Shares in each formation's column sum to 1.
 */
export function buildRoleGrid(
  slots: FormationSlot[],
  geometry: Map<string, Map<number, { slot: number; x_pct: number; y_pct: number }>>,
  names: Map<string, string>,
  metric: RoleMetric,
  minMatches = 50
): RoleGrid {
  const value = (s: FormationSlot) => (metric === 'goals' ? s.goals : metric === 'assists' ? s.assists : s.goals + s.assists);
  const byCode = new Map<string, FormationSlot[]>();
  for (const s of slots) (byCode.get(s.source_formation_code) ?? byCode.set(s.source_formation_code, []).get(s.source_formation_code)!).push(s);
  const formations = [...byCode.entries()]
    .map(([code, ss]) => ({ code, name: names.get(code) ?? ss[0]?.canonical_formation ?? code, matches: Math.round(ss.reduce((a, s) => a + s.starts, 0) / 11), ss }))
    .filter((f) => f.matches >= minMatches && geometry.has(f.code))
    .sort((a, b) => b.matches - a.matches);
  const cells = Object.fromEntries(ROLES.map((r) => [r, formations.map(() => null as number | null)])) as Record<Role, (number | null)[]>;
  formations.forEach((f, i) => {
    const total = f.ss.reduce((a, s) => a + value(s), 0);
    const geo = geometry.get(f.code)!;
    for (const s of f.ss) {
      const g = geo.get(Number(s.source_formation_slot));
      if (!g) continue;
      const r = roleOf(g.x_pct, g.y_pct);
      cells[r][i] = (cells[r][i] ?? 0) + (total > 0 ? value(s) / total : 0);
    }
  });
  const max = Math.max(0.0001, ...ROLES.flatMap((r) => cells[r].filter((v): v is number => v != null)));
  return { formations: formations.map(({ code, name, matches }) => ({ code, name, matches })), cells, max };
}
