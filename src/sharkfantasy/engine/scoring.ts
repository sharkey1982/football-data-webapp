// ============================================================================
// Shark Fantasy: fantasy points (scoring rules v1, design §3.2) and the
// Shark Rating bonus. Rules are data with a version; every score records it.
// ============================================================================
import type { PlayerMatchStats, Position } from './types';

export interface ScoringRules {
  version: string;
  played: { short: number; long: number };     // 1–59 / 60+
  goal: Record<Position, number>;
  assist: number;
  cleanSheet: Record<Position, number>;
  savesPer: number;                             // 1 point per this many saves (GK)
  penSave: number;
  concededPer: number;                          // −1 per this many conceded (GK/DEF)
  concededPositions: readonly Position[];
  yellow: number;
  red: number;
  penMiss: number;
  ownGoal: number;
  bonus: readonly number[];                     // top 3 Shark Ratings
}

export const SCORING_V1: ScoringRules = {
  version: 'sf-scoring-1',
  played: { short: 1, long: 2 },
  goal: { GK: 6, DEF: 6, MID: 5, FWD: 4 },
  assist: 3,
  cleanSheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 },
  savesPer: 3,
  penSave: 5,
  concededPer: 2,
  concededPositions: ['GK', 'DEF'],
  yellow: -1,
  red: -3,
  penMiss: -2,
  ownGoal: -2,
  bonus: [3, 2, 1],
};

/** The published Shark Rating: a match score from the events, for the bonus. */
export function sharkRating(s: PlayerMatchStats): number {
  const back = s.position === 'GK' || s.position === 'DEF';
  return (s.minutes >= 60 ? 3 : 1)
    + s.goals * (back ? 12 : 10)
    + s.assists * 7
    + (s.cleanSheet ? (back ? 8 : s.position === 'MID' ? 3 : 0) : 0)
    + s.saves * 2 + s.penSaves * 8
    - (back ? 2 * s.conceded : 0)
    - 3 * s.yellow - 9 * s.red - 6 * s.ownGoals - 6 * s.penMisses;
}

/** Bonus by match: top 3 ratings get 3/2/1; ties share a place (FPL's rule). */
export function bonusForMatch(stats: PlayerMatchStats[], rules: ScoringRules = SCORING_V1): Record<string, number> {
  const rated = stats.map(s => ({ id: s.playerId, r: sharkRating(s) })).sort((a, b) => b.r - a.r);
  const out: Record<string, number> = {};
  let place = 0, i = 0;
  while (i < rated.length && place < rules.bonus.length) {
    const tied = rated.filter(x => x.r === rated[i].r);
    for (const t of tied) out[t.id] = rules.bonus[place];
    place += tied.length; i += tied.length;
  }
  return out;
}

export interface PointsBreakdown { total: number; parts: Record<string, number> }

export function fantasyPoints(s: PlayerMatchStats, bonus: number, rules: ScoringRules = SCORING_V1): PointsBreakdown {
  const parts: Record<string, number> = {};
  const add = (k: string, v: number) => { if (v) parts[k] = (parts[k] ?? 0) + v; };
  if (s.minutes > 0) add('played', s.minutes >= 60 ? rules.played.long : rules.played.short);
  add('goals', s.goals * rules.goal[s.position]);
  add('assists', s.assists * rules.assist);
  if (s.cleanSheet) add('clean_sheet', rules.cleanSheet[s.position]);
  if (s.position === 'GK') add('saves', Math.floor(s.saves / rules.savesPer));
  add('pen_saves', s.penSaves * rules.penSave);
  if (rules.concededPositions.includes(s.position)) add('conceded', -Math.floor(s.conceded / rules.concededPer));
  add('yellow', s.yellow * rules.yellow);
  add('red', s.red * rules.red);
  add('pen_miss', s.penMisses * rules.penMiss);
  add('own_goal', s.ownGoals * rules.ownGoal);
  add('bonus', bonus);
  return { total: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}
