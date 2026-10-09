// ============================================================================
// src/lib/fplArticleDecisions.ts
//
// Figures for "Three FPL decisions, three time horizons" (/fpl/articles/
// three-decisions-three-horizons), 9 Oct 2026.
//
// Projections: FixtureShark's player projections, model leaguewide_v6
// (baseline), generated 9 Oct 2026 02:11-02:16 UTC (03:11-03:16 UK time),
// read through the optimiser's feed get_fpl_optimizer_candidates_json(6, 15);
// prices as at that day. The optimal squad is analysis_results
// 'transfer_captaincy' (free, no transfers; exact HiGHS solve, 644.12). The
// "due" test is fpl_player_gameweek_history 2023/24-2025/26. Frozen: the
// projections refresh daily.
// ============================================================================

export const DECISIONS_DATA = {
  projectedAt: '9 Oct 2026, 03:16 UK time',
  modelVersion: 'leaguewide_v6',
  gws: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
};

// ---- Opening + transfers: projected points by gameweek, GW6-15 ------------

export type Weekly = { name: string; team: string; price: number; xp: number[]; start: number[]; opp: string[]; note?: string };

export const ISIDOR: Weekly = {
  name: 'Isidor', team: 'Sunderland', price: 5.5,
  xp: [4.79, 4.49, 1.4, 0.92, 0.51, 0.51, 0.54, 0.48, 0.52, 0.54],
  start: [0.9, 0.9, 0.26, 0.14, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05],
  opp: ['H BHA', 'A BOU', 'H LEE', 'A COV', 'H CHE', 'A AVL', 'H TOT', 'A LIV', 'A NEW', 'H NFO'],
  note: 'Covering for Brobbey (hamstring, expected back 25 Oct): 117 minutes this season, all as a substitute.',
};

export const CALVERT_LEWIN: Weekly = {
  name: 'Calvert-Lewin', team: 'Leeds', price: 6.0,
  xp: [3.57, 5.11, 4.82, 4.82, 5.47, 4.31, 6.42, 3.8, 6.31, 4.34],
  start: [0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96],
  opp: ['A ARS', 'H MUN', 'A SUN', 'A BOU', 'H TOT', 'A CHE', 'H COV', 'A MCI', 'H IPS', 'A LIV'],
};

export const WISSA: Weekly = {
  name: 'Wissa', team: 'Newcastle', price: 6.2,
  xp: [4.54, 4.45, 4.16, 4.32, 3.93, 3.11, 3.65, 3.97, 4.22, 4.42],
  start: [0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94],
  opp: ['A COV', 'H AVL', 'A CRY', 'H EVE', 'A FUL', 'H ARS', 'A BHA', 'H MUN', 'H SUN', 'A IPS'],
};

export const HIT = 4;

// ---- Captaincy, GW6 ---------------------------------------------------------

export type CaptainRow = {
  name: string; team: string; fixture: string; price: number; own: number; seasonPts: number;
  xp: number; start: number; mins: number; xg: number; xa: number;
  parts: { appearance: number; goals: number; assists: number; cleanSheet: number; bonus: number; defensive: number };
};

/** The six highest projected players for GW6 (deadline Sat 10 Oct, 11:00 UK). */
export const GW6_CAPTAINS: CaptainRow[] = [
  { name: 'Saka', team: 'Arsenal', fixture: 'Leeds (H)', price: 9.6, own: 14.9, seasonPts: 32, xp: 7.05, start: 0.94, mins: 77, xg: 0.52, xa: 0.31,
    parts: { appearance: 1.87, goals: 2.61, assists: 0.92, cleanSheet: 0.44, bonus: 1.22, defensive: 0.22 } },
  { name: 'Haaland', team: 'Man City', fixture: 'Liverpool (A)', price: 15.6, own: 74.0, seasonPts: 39, xp: 6.66, start: 0.97, mins: 79, xg: 0.75, xa: 0.07,
    parts: { appearance: 1.96, goals: 3.01, assists: 0.2, cleanSheet: 0, bonus: 1.7, defensive: 0.02 } },
  { name: 'Bruno', team: 'Man United', fixture: 'Tottenham (H)', price: 11.9, own: 38.3, seasonPts: 31, xp: 6.09, start: 0.97, mins: 79, xg: 0.38, xa: 0.3,
    parts: { appearance: 1.96, goals: 1.9, assists: 0.89, cleanSheet: 0.28, bonus: 1.08, defensive: 0.2 } },
  { name: 'Barry', team: 'Everton', fixture: 'Hull (A)', price: 5.7, own: 8.5, seasonPts: 20, xp: 6.01, start: 0.94, mins: 77, xg: 0.7, xa: 0.06,
    parts: { appearance: 1.9, goals: 2.8, assists: 0.17, cleanSheet: 0, bonus: 1.35, defensive: 0.02 } },
  { name: 'Tavernier', team: 'Bournemouth', fixture: 'Chelsea (A)', price: 6.1, own: 6.9, seasonPts: 31, xp: 5.39, start: 0.97, mins: 79, xg: 0.31, xa: 0.25,
    parts: { appearance: 1.97, goals: 1.55, assists: 0.75, cleanSheet: 0.15, bonus: 1.07, defensive: 0.31 } },
  { name: 'Mbeumo', team: 'Man United', fixture: 'Tottenham (H)', price: 7.9, own: 20.4, seasonPts: 25, xp: 5.27, start: 0.97, mins: 79, xg: 0.33, xa: 0.25,
    parts: { appearance: 1.97, goals: 1.64, assists: 0.76, cleanSheet: 0.3, bonus: 0.73, defensive: 0.18 } },
];

// ---- Squad construction -----------------------------------------------------

/** Replacement level: the best projected player within £1.0m of the cheapest at his position (GW6-15). */
export const REPLACEMENT: Record<number, { name: string; price: number; xp10: number }> = {
  1: { name: 'Martinez', price: 5.0, xp10: 37.7 },
  2: { name: 'Bogle', price: 4.6, xp10: 33.0 },
  3: { name: 'Iwobi', price: 5.4, xp10: 39.8 },
  4: { name: 'McBurnie', price: 5.5, xp10: 37.3 },
};

export type SquadPlayer = { name: string; team: string; pos: 1 | 2 | 3 | 4; price: number; xp: number[] };

/** The optimiser's best fixed £100m squad for GW6-15 on these projections (analysis_results transfer_captaincy). */
export const OPTIMAL_SQUAD: SquadPlayer[] = [
  { name: 'Raya', team: 'Arsenal', pos: 1, price: 6.1, xp: [5.06, 4.85, 5.05, 3.95, 5.51, 4.48, 4.12, 4.33, 4.53, 4.89] },
  { name: 'Forster', team: 'Bournemouth', pos: 1, price: 4.0, xp: [0.06, 0.08, 0.06, 0.08, 0.08, 0.08, 0.07, 0.07, 0.09, 0.05] },
  { name: 'Guéhi', team: 'Man City', pos: 2, price: 6.0, xp: [3, 4.55, 3.79, 3.94, 3.89, 4.3, 2.78, 4.18, 3.37, 3.56] },
  { name: 'Hall', team: 'Newcastle', pos: 2, price: 5.3, xp: [4.11, 4, 3.71, 3.95, 3.5, 2.69, 3.03, 3.06, 4.2, 3.82] },
  { name: 'De Cuyper', team: 'Brighton', pos: 2, price: 5.0, xp: [3.77, 4.48, 2.66, 2.29, 3.67, 4.5, 3.98, 3.37, 3.63, 4.12] },
  { name: 'Van Hecke', team: 'Tottenham', pos: 2, price: 4.9, xp: [1.76, 3.6, 2.3, 3.76, 3.06, 3.95, 3.45, 3.72, 2.57, 3.98] },
  { name: 'Bogle', team: 'Leeds', pos: 2, price: 4.6, xp: [2.32, 3.18, 3.8, 3.3, 3.84, 2.7, 4.66, 2.2, 4.48, 2.53] },
  { name: 'Saka', team: 'Arsenal', pos: 3, price: 9.6, xp: [7.05, 6.4, 7.18, 5.7, 8.61, 6.57, 5.67, 6.06, 6.28, 7.03] },
  { name: 'Mbeumo', team: 'Man United', pos: 3, price: 7.9, xp: [5.27, 4.59, 5.2, 4.23, 5.42, 4.24, 5.06, 4.85, 6.13, 5.08] },
  { name: 'Ødegaard', team: 'Arsenal', pos: 3, price: 6.8, xp: [5.1, 4.74, 5.17, 4.26, 6.06, 4.8, 4.21, 4.51, 4.67, 5.1] },
  { name: 'Tavernier', team: 'Bournemouth', pos: 3, price: 6.1, xp: [5.39, 6.59, 5.28, 6.28, 6.29, 6.07, 5.52, 5.71, 7.23, 3.93] },
  { name: 'Groß', team: 'Brighton', pos: 3, price: 5.9, xp: [4.67, 5.71, 4.22, 3.72, 5.01, 5.6, 5.4, 4.63, 4.72, 5.22] },
  { name: 'Haaland', team: 'Man City', pos: 4, price: 15.6, xp: [6.66, 8.97, 7.12, 7.49, 6.89, 7.99, 5.03, 7.55, 6.68, 7.02] },
  { name: 'Calvert-Lewin', team: 'Leeds', pos: 4, price: 6.0, xp: [3.57, 5.11, 4.82, 4.82, 5.47, 4.31, 6.42, 3.8, 6.31, 4.34] },
  { name: 'Barry', team: 'Everton', pos: 4, price: 5.7, xp: [6.01, 5.08, 3.64, 5.18, 6.54, 4.79, 5.05, 5.1, 5.74, 4.73] },
];
export const OPTIMAL_TOTAL = 644.12;

/** The 15 highest projected players (2 GK, 5 DEF, 5 MID, 3 FWD) over GW6-15, ignoring the rules. */
export const TOP_15 = { cost: 116.9, xp: 734.2, maxPerClub: 4, club: 'Arsenal' };

/** Squads with and without transfers (same projections): from the captaincy article's update. */
export const PARTNER_SQUADS = { withPartner: 644.12, noPartner: 626.05, captainPoints: 75.52, captainPointsNoPartner: 73.34 };

// ---- Uncertainty ------------------------------------------------------------

/** Are players "due"? 2023/24-2025/26: starts by players averaging 4+ points a start (15+ starts), whose previous three games were also starts. Baseline = his average in his OTHER starts that season. */
export const DUE_TEST = [
  { streak: 'After three blanks (2 or fewer)', n: 233, next: 5.06, usual: 4.93, diff: 0.12, se: 0.27 },
  { streak: 'After three returns (6 or more)', n: 198, next: 5.31, usual: 5.0, diff: 0.31, se: 0.33 },
  { streak: 'Any other run', n: 3231, next: 4.84, usual: 4.82, diff: 0.03, se: 0.07 },
];
/** The naive version (baseline including the streak itself) for contrast. */
export const DUE_NAIVE = { next: 5.06, seasonAvg: 4.6 };

/** Start-chance calibration, GW3-5 backtest (scripts/backtest_depth_floor.py, adopted rule). */
export const START_CALIBRATION = { playerMatches: 1761, predicted: 0.3259, actual: 0.3407, brier: 0.0784 };

/** GW6 squad simulation, 28 Sep 2026 (analysis_results squad_variance_gw). */
export const VARIANCE = { xiSd: 15, best50Spread: 0.46, template: 56.3, differential: 54.0, templateTop1: 5.7, differentialTop1: 12 };

// ---- helpers ------------------------------------------------------------------

export const sum = (xs: number[]) => xs.reduce((t, v) => t + v, 0);

/** Cumulative gain of B over A after each week. */
export function cumulativeGain(a: number[], b: number[]): number[] {
  let t = 0;
  return a.map((v, i) => (t += b[i] - v));
}

const SHAPES = [[3, 5, 2], [3, 4, 3], [4, 5, 1], [4, 4, 2], [4, 3, 3], [5, 4, 1], [5, 3, 2], [5, 2, 3]];

/** Best legal XI each week (as the site's optimiser picks it), captain = highest in the XI. */
export function weeklyXI(squad: SquadPlayer[]) {
  const weeks = squad[0].xp.length;
  const starts = new Map(squad.map((p) => [p.name, 0]));
  let xi = 0, captain = 0;
  for (let w = 0; w < weeks; w++) {
    const byPos = [1, 2, 3, 4].map((pos) => squad.filter((p) => p.pos === pos).sort((a, b) => b.xp[w] - a.xp[w]));
    let best: { score: number; players: SquadPlayer[] } | null = null;
    for (const [d, m, f] of SHAPES) {
      const players = [byPos[0][0], ...byPos[1].slice(0, d), ...byPos[2].slice(0, m), ...byPos[3].slice(0, f)];
      const score = sum(players.map((p) => p.xp[w]));
      if (!best || score > best.score) best = { score, players };
    }
    xi += best!.score;
    captain += Math.max(...best!.players.map((p) => p.xp[w]));
    for (const p of best!.players) starts.set(p.name, (starts.get(p.name) ?? 0) + 1);
  }
  return { xi, captain, total: xi + captain, starts };
}
