// ============================================================================
// Shark Fantasy engine: every number that shapes the football.
// Calibrated against the Premier League 2021/22–2025/26 (FixtureShark's own
// matches table, 1,900 matches) and FPL 2023/24–2024/25 player history; see
// docs/shark-fantasy/calibration.md. Change a number → new ENGINE_VERSION.
// ============================================================================

export const ENGINE_VERSION = 'sf-engine-0.1';

/** Targets the calibration report checks against (with tolerances). */
export const TARGETS = {
  goalsPerMatch: { value: 2.93, tol: 0.12 },
  homeGoals: { value: 1.60, tol: 0.10 },
  awayGoals: { value: 1.33, tol: 0.10 },
  homeWin: { value: 0.442, tol: 0.03 },
  draw: { value: 0.239, tol: 0.03 },
  nilNil: { value: 0.052, tol: 0.015 },
  cleanSheetPerTeam: { value: 0.249, tol: 0.03 },
  yellowsPerMatch: { value: 3.79, tol: 0.3 },
  redsPerMatch: { value: 0.115, tol: 0.04 },
  /** Share of all goals by position (FPL 2023/24–24/25, mapped rows). */
  goalShareDef: { value: 0.13, tol: 0.05 },
  goalShareFwd: { value: 0.36, tol: 0.08 },
  /** Assists per goal (FPL's generous assist rule). */
  assistsPerGoal: { value: 0.85, tol: 0.08 },
  /** Saves per goalkeeper appearance of 60+ minutes. */
  gkSaves: { value: 2.95, tol: 0.5 },
  /** Share of appearances lasting 60+ minutes. */
  share60: { value: 0.683, tol: 0.08 },
  /** The strongest club's share of league titles (balance, not realism). */
  favouriteTitleShare: { value: 0.35, tol: 0.12 },
} as const;

export const MATCH = {
  /** League-average expected goals at home / away before team strengths. */
  homeXg: 1.60,
  awayXg: 1.33,
  /** Strength sensitivity: exp(k × (attack − defence) / 10). */
  k: 0.40,
  /** Shots per team per match at league-average xG. */
  shotsPerTeam: 12.9,
  /** Of shots that don't score, the share on target (→ a save). */
  onTargetMiss: 0.27,
  assistRate: 0.85,
  /** Per team per match. */
  penaltyRate: 0.13,
  penaltyConversion: 0.78,
  /** Of missed penalties, the share saved by the keeper. */
  penaltySavedShare: 0.75,
  ownGoalRate: 0.04,
  yellowRate: 1.86,
  straightRedRate: 0.035,
  /** Per player per 90 minutes at injury proneness 50. */
  injuryRate: 0.022,
  /** Late-game swing: trailing teams push, leading teams sit. */
  trailingBoost: 1.18,
  leadingDamp: 0.9,
  /** A red card: the short side's attack, and the opponent's. */
  manDownAttack: 0.72,
  manDownOpponent: 1.22,
  /** Shot share by position (× finishing). */
  shooterWeight: { GK: 0, DEF: 1.0, MID: 2.25, FWD: 2.4 },
  /** Average finishing factor of shooters, so better finishers don't add goals overall. */
  finishNorm: 1.03,
  /** Card weight for a player already booked. */
  bookedCaution: 0.15,
  assisterWeight: { GK: 0.05, DEF: 1.0, MID: 2.6, FWD: 1.5 },
  cardWeight: { GK: 0.3, DEF: 1.35, MID: 1.2, FWD: 0.75 },
  /** Substitutions per team per match (max 5). */
  subsPerTeam: 3.6,
} as const;

export const WORLD = {
  clubs: 10,
  squad: { GK: 2, DEF: 6, MID: 7, FWD: 5 } as Record<string, number>,
  /** Club quality offsets (shuffled): the spread decides competitive balance. */
  clubOffsets: [7, 5, 3.5, 2, 0.5, -0.5, -2, -3.5, -5, -7],
  /** Within a squad, how much better the first-choice players are. */
  depthDrop: 7,
} as const;

/** Suspensions in a 10-round season. */
export const DISCIPLINE = { yellowsForBan: 3, redBan: 1 } as const;
