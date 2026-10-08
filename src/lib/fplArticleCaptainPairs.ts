// ============================================================================
// src/lib/fplArticleCaptainPairs.ts
//
// Figures for the article "One captain or two?" (/fpl/articles/one-captain-or-two).
//
// Source: analysis_results 'captain_partnerships', run 8 Oct 2026 21:42 UTC
// from scripts/analysis_captain_partnerships.ts at commit 22dced1 (the same
// numbers as the first complete run at 21:38). Inputs: the live optimiser's
// candidate feed get_fpl_optimizer_candidates_json(6, 15), model
// leaguewide_v6 baseline, projections generated 8 Oct 2026 14:09-14:15 UTC,
// prices as at that day. These are a dated case study: the projections
// refresh daily, so the numbers below are frozen, not live.
// ============================================================================

export const CASE_STUDY = {
  season: '2026/27',
  fromGw: 6,
  toGw: 15,
  projectedAt: '8 Oct 2026, 15:15 UK time',
  modelVersion: 'leaguewide_v6',
} as const;

export const GWS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/** Colours validated as a set (dataviz validator, light surface): all checks pass. */
export const PLAYER_COLOUR: Record<string, string> = {
  Haaland: '#2a7a4f',
  Saka: '#c08a1e',
  Bruno: '#3567a8',
  Palmer: '#b23a48',
};

export type CandidateRow = {
  name: string; team: string; price: number; own: number; xp10: number; startProb: number; xMins: number;
  seasonMinutes: number; status: string; xp: number[]; opp: string[];
};

/** Projected FPL points per gameweek, GW6-15 (one fixture each: no blank or double gameweeks in the range). */
export const CANDIDATES: CandidateRow[] = [
  { name: 'Haaland', team: 'Man City', price: 15.6, own: 73.9, xp10: 70.09, startProb: 0.97, xMins: 79, seasonMinutes: 450, status: 'Available',
    xp: [6.5, 8.77, 7.0, 7.36, 6.73, 7.86, 4.99, 7.42, 6.55, 6.9],
    opp: ['A LIV', 'H IPS', 'A AVL', 'H BHA', 'A NFO', 'H FUL', 'A ARS', 'H LEE', 'A BRE', 'H CHE'] },
  { name: 'Saka', team: 'Arsenal', price: 9.6, own: 14.7, xp10: 66.88, startProb: 0.94, xMins: 77, seasonMinutes: 416, status: 'Available',
    xp: [7.07, 6.39, 7.22, 5.74, 8.71, 6.64, 5.71, 6.1, 6.27, 7.03],
    opp: ['H LEE', 'A NFO', 'H EVE', 'A LIV', 'H HUL', 'A NEW', 'H MCI', 'A BRE', 'A TOT', 'H BOU'] },
  { name: 'Bruno', team: 'Man United', price: 11.9, own: 38.3, xp10: 56.78, startProb: 0.96, xMins: 78, seasonMinutes: 450, status: 'Available',
    xp: [6.0, 5.23, 5.9, 4.79, 6.17, 4.79, 5.72, 5.52, 6.92, 5.74],
    opp: ['H TOT', 'A LEE', 'H BOU', 'A CHE', 'H AVL', 'A LIV', 'H BRE', 'A NEW', 'H COV', 'A CRY'] },
  { name: 'Palmer', team: 'Chelsea', price: 9.7, own: 24.9, xp10: 50.27, startProb: 0.89, xMins: 73, seasonMinutes: 442, status: '75% fit',
    xp: [4.46, 4.52, 5.34, 5.04, 5.01, 5.53, 5.07, 6.15, 5.12, 4.02],
    opp: ['H BOU', 'A EVE', 'H TOT', 'H MUN', 'A SUN', 'H LEE', 'A NFO', 'H CRY', 'H LIV', 'A MCI'] },
];

/** Every player who would take the armband from Haaland in at least one week, GW6-15. All others add nothing. */
export const PARTNERS = [
  { name: 'Saka', team: 'Arsenal', price: 9.6, xp10: 66.88, weeks: 5, gain: 3.61 },
  { name: 'Calvert-Lewin', team: 'Leeds', price: 6.0, xp10: 48.78, weeks: 1, gain: 1.4 },
  { name: 'Tavernier', team: 'Bournemouth', price: 6.1, xp10: 57.04, weeks: 2, gain: 1.31 },
  { name: 'Bruno', team: 'Man United', price: 11.9, xp10: 56.78, weeks: 2, gain: 1.09 },
  { name: 'Groß', team: 'Brighton', price: 5.9, xp10: 46.81, weeks: 1, gain: 0.22 },
  { name: 'Isak', team: 'Liverpool', price: 9.1, xp10: 48.75, weeks: 1, gain: 0.11 },
  { name: 'Palmer', team: 'Chelsea', price: 9.7, xp10: 50.27, weeks: 1, gain: 0.08 },
];

/** Captain each week and his projected points (the armband's extra copy). */
export type CaptainPath = { key: string; label: string; cost: number; captainPoints: number; gain: number; path: [string, number][] };

export const COMBOS: CaptainPath[] = [
  { key: 'h', label: 'Haaland alone', cost: 15.6, captainPoints: 70.09, gain: 0,
    path: [['Haaland', 6.5], ['Haaland', 8.77], ['Haaland', 7.0], ['Haaland', 7.36], ['Haaland', 6.73], ['Haaland', 7.86], ['Haaland', 4.99], ['Haaland', 7.42], ['Haaland', 6.55], ['Haaland', 6.9]] },
  { key: 'hs', label: 'Haaland + Saka', cost: 25.2, captainPoints: 73.69, gain: 3.61,
    path: [['Saka', 7.07], ['Haaland', 8.77], ['Saka', 7.22], ['Haaland', 7.36], ['Saka', 8.71], ['Haaland', 7.86], ['Saka', 5.71], ['Haaland', 7.42], ['Haaland', 6.55], ['Saka', 7.03]] },
  { key: 'hb', label: 'Haaland + Bruno', cost: 27.5, captainPoints: 71.18, gain: 1.09,
    path: [['Haaland', 6.5], ['Haaland', 8.77], ['Haaland', 7.0], ['Haaland', 7.36], ['Haaland', 6.73], ['Haaland', 7.86], ['Bruno', 5.72], ['Haaland', 7.42], ['Bruno', 6.92], ['Haaland', 6.9]] },
  { key: 'hp', label: 'Haaland + Palmer', cost: 25.3, captainPoints: 70.17, gain: 0.08,
    path: [['Haaland', 6.5], ['Haaland', 8.77], ['Haaland', 7.0], ['Haaland', 7.36], ['Haaland', 6.73], ['Haaland', 7.86], ['Palmer', 5.07], ['Haaland', 7.42], ['Haaland', 6.55], ['Haaland', 6.9]] },
  { key: 'hsb', label: 'Haaland + Saka + Bruno', cost: 37.1, captainPoints: 74.07, gain: 3.98,
    path: [['Saka', 7.07], ['Haaland', 8.77], ['Saka', 7.22], ['Haaland', 7.36], ['Saka', 8.71], ['Haaland', 7.86], ['Bruno', 5.72], ['Haaland', 7.42], ['Bruno', 6.92], ['Saka', 7.03]] },
  { key: 'opt', label: 'Optimal squad (four options)', cost: 0, captainPoints: 75.12, gain: 5.03,
    path: [['Saka', 7.07], ['Haaland', 8.77], ['Saka', 7.22], ['Haaland', 7.36], ['Saka', 8.71], ['Haaland', 7.86], ['Calvert-Lewin', 6.39], ['Haaland', 7.42], ['Tavernier', 7.3], ['Saka', 7.03]] },
];

/** Exact squad solves, GW6-15, £100m, fixed squad (no transfers). Totals = each week's best XI + captain + vice-captain hedge. */
export const SQUADS = [
  { key: 'free', label: 'Optimiser chooses', note: 'picks Haaland and Saka', total: 633.83, xi: 558.69, captain: 75.12, cost: 99.4,
    premiums: 'Haaland, Saka', captains: 'Haaland 4, Saka 4, Calvert-Lewin 1, Tavernier 1' },
  { key: 'haaland_bruno', label: 'Haaland + Bruno forced in', note: 'keeps Saka', total: 632.91, xi: 557.76, captain: 75.12, cost: 100.0,
    premiums: 'Haaland, Saka, Bruno', captains: 'Haaland 4, Saka 4, Calvert-Lewin 1, Tavernier 1' },
  { key: 'haaland_palmer', label: 'Haaland + Palmer forced in', note: 'keeps Saka', total: 632.1, xi: 556.96, captain: 75.12, cost: 99.8,
    premiums: 'Haaland, Saka, Palmer', captains: 'Haaland 4, Saka 4, Calvert-Lewin 1, Tavernier 1' },
  { key: 'no_haaland', label: 'No Haaland', note: 'buys Saka, Bruno and Isak', total: 617.7, xi: 548.86, captain: 68.82, cost: 99.8,
    premiums: 'Saka, Bruno, Isak', captains: 'Saka 7, Tavernier 2, Calvert-Lewin 1' },
  { key: 'haaland_alone', label: 'Haaland, no other £9m+', note: 'spends on Gabriel, Szoboszlai, Ødegaard', total: 613.22, xi: 540.99, captain: 72.23, cost: 99.9,
    premiums: 'Haaland', captains: 'Haaland 8, Calvert-Lewin 1, Tavernier 1' },
];

/** The optimal squad at different budgets (low-evidence players excluded; identical at £100m). */
export const BUDGET_CURVE = [
  { budget: 95, total: 623.38, premiums: 'Haaland, Saka' },
  { budget: 97.5, total: 630.06, premiums: 'Haaland, Saka' },
  { budget: 100, total: 633.83, premiums: 'Haaland, Saka' },
  { budget: 102.5, total: 639.38, premiums: 'Haaland, Saka, Bruno' },
  { budget: 105, total: 643.23, premiums: 'Haaland, Saka, Bruno' },
];

/** Players with under 200 minutes this season but a projected start probability of 0.6+ (the line-up depth chart's floor). */
export const LOW_EVIDENCE_COUNT = 20;
export const LOW_EVIDENCE_EXAMPLES = 'Doku (15 minutes, 0.85), Bard (18, 0.85), Flemming (60, 0.85)';
