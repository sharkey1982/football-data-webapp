// ============================================================================
// src/lib/formStats.ts
//
// Form and distribution helpers computed CLIENT-SIDE from raw match rows.
//
// Split out of api.ts because nothing here touches Supabase: these are
// pure functions over rows the caller already has. Keeping them apart
// from the query layer makes that obvious, and makes them trivially
// testable without mocking a client.
// ============================================================================

import type { Match, MatchResult } from '../types/database';
import type { MatchWithNames } from './matchesApi';

// ----------------------------------------------------------------------------
// Form / stats helpers (computed client-side from raw match rows -- no
// stored aggregate tables yet; revisit if this gets slow at full data volume)
// ----------------------------------------------------------------------------

export type FormResult = 'W' | 'D' | 'L';

export function resultForTeam(match: Match, teamId: number): FormResult {
  const isHome = match.home_team_id === teamId;
  const result: MatchResult = match.full_time_result;
  if (result === 'D') return 'D';
  if ((result === 'H' && isHome) || (result === 'A' && !isHome)) return 'W';
  return 'L';
}

export interface FormEntry {
  result: FormResult;
  detail: string;
}

/**
 * Builds the result + a human-readable detail string ("vs Tottenham, 2-1 (H)")
 * for each match in a list, most-recent-first as given -- used to give
 * FormBadge tooltips real context instead of just a bare Win/Draw/Loss label.
 */
export function buildFormEntries(matches: MatchWithNames[], teamId: number): FormEntry[] {
  return matches.map((m) => {
    const isHome = m.home_team_id === teamId;
    const opponent = isHome ? m.away_team_name : m.home_team_name;
    const ownGoals = isHome ? m.full_time_home_goals : m.full_time_away_goals;
    const oppGoals = isHome ? m.full_time_away_goals : m.full_time_home_goals;
    return {
      result: resultForTeam(m, teamId),
      detail: `vs ${opponent}, ${ownGoals}-${oppGoals} (${isHome ? 'H' : 'A'})`,
    };
  });
}

export function summarizeForm(matches: Match[], teamId: number) {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const m of matches) {
    const isHome = m.home_team_id === teamId;
    const gf = isHome ? m.full_time_home_goals : m.full_time_away_goals;
    const ga = isHome ? m.full_time_away_goals : m.full_time_home_goals;
    goalsFor += gf;
    goalsAgainst += ga;

    const result = resultForTeam(m, teamId);
    if (result === 'W') wins++;
    else if (result === 'D') draws++;
    else losses++;
  }

  return {
    played: matches.length,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    form: matches.map((m) => resultForTeam(m, teamId)),
  };
}

export function splitHomeAway(matches: MatchWithNames[], teamId: number) {
  const home = matches.filter((m) => m.home_team_id === teamId);
  const away = matches.filter((m) => m.away_team_id === teamId);
  return { home, away };
}

export interface GoalsDistributionStats {
  /** Count of matches falling into each goals-scored bucket: 0, 1, 2, 3+. */
  bucketCounts: { '0': number; '1': number; '2': number; '3+': number };
  median: number;
  mode: number;
  mean: number;
}

function distributionStats(values: number[]): GoalsDistributionStats {
  const bucketCounts = { '0': 0, '1': 0, '2': 0, '3+': 0 };
  for (const v of values) {
    if (v === 0) bucketCounts['0']++;
    else if (v === 1) bucketCounts['1']++;
    else if (v === 2) bucketCounts['2']++;
    else bucketCounts['3+']++;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n === 0 ? 0 : n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  const freq = new Map<number, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  let mode = 0;
  let modeCount = -1;
  for (const [v, count] of freq) {
    if (count > modeCount) {
      mode = v;
      modeCount = count;
    }
  }

  const mean = n === 0 ? 0 : values.reduce((a, b) => a + b, 0) / n;

  return { bucketCounts, median, mode, mean };
}

/**
 * Computes the goals-for / goals-against / net-goals distribution stats
 * (matching the spreadsheet layout: bucketed counts, median, mode, mean)
 * for a rolling window of a team's matches. Pass an already-sliced/filtered
 * match list (e.g. last 10, or home-only) -- this function doesn't do any
 * windowing itself, just the statistics.
 */
export function calculateGoalsDistribution(
  matches: MatchWithNames[],
  teamId: number
): { goalsFor: GoalsDistributionStats; goalsAgainst: GoalsDistributionStats; net: GoalsDistributionStats } {
  const gfValues: number[] = [];
  const gaValues: number[] = [];
  const netValues: number[] = [];

  for (const m of matches) {
    const isHome = m.home_team_id === teamId;
    const gf = isHome ? m.full_time_home_goals : m.full_time_away_goals;
    const ga = isHome ? m.full_time_away_goals : m.full_time_home_goals;
    gfValues.push(gf);
    gaValues.push(ga);
    netValues.push(gf - ga);
  }

  return {
    goalsFor: distributionStats(gfValues),
    goalsAgainst: distributionStats(gaValues),
    net: distributionStats(netValues),
  };
}

export interface TeamStreaks {
  unbeaten: number;
  winning: number;
  cleanSheets: number;
  scoringIn: number; // consecutive matches with at least one goal scored
}

/**
 * Computes "current streak" callouts from a list of matches, MOST RECENT
 * FIRST (as returned by getMatchesForTeam/getHeadToHead). A streak is the
 * count of consecutive matches from the most recent one backwards that
 * satisfy the condition -- it stops at the first match that breaks it,
 * exactly matching how "unbeaten in 6" is meant on a results page.
 */
export function computeStreaks(matches: MatchWithNames[], teamId: number): TeamStreaks {
  let unbeaten = 0;
  let winning = 0;
  let cleanSheets = 0;
  let scoringIn = 0;

  let unbeatenBroken = false;
  let winningBroken = false;
  let cleanSheetBroken = false;
  let scoringBroken = false;

  for (const m of matches) {
    const isHome = m.home_team_id === teamId;
    const goalsFor = isHome ? m.full_time_home_goals : m.full_time_away_goals;
    const goalsAgainst = isHome ? m.full_time_away_goals : m.full_time_home_goals;
    const result = resultForTeam(m, teamId);

    if (!unbeatenBroken) {
      if (result !== 'L') unbeaten++;
      else unbeatenBroken = true;
    }
    if (!winningBroken) {
      if (result === 'W') winning++;
      else winningBroken = true;
    }
    if (!cleanSheetBroken) {
      if (goalsAgainst === 0) cleanSheets++;
      else cleanSheetBroken = true;
    }
    if (!scoringBroken) {
      if (goalsFor > 0) scoringIn++;
      else scoringBroken = true;
    }

    if (unbeatenBroken && winningBroken && cleanSheetBroken && scoringBroken) break;
  }

  return { unbeaten, winning, cleanSheets, scoringIn };
}

export interface MatchTrendPoint {
  matchDate: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  result: FormResult;
  isHome: boolean;
}

/**
 * Converts a list of matches (most-recent-first, as returned by
 * getMatchesForTeam) into a chronological per-match series suitable for
 * charting -- goals for/against and result, oldest to newest, so trend
 * lines read left-to-right in the natural reading direction.
 */
export function buildMatchTrend(matches: MatchWithNames[], teamId: number): MatchTrendPoint[] {
  const chronological = [...matches].reverse(); // input is newest-first
  return chronological.map((m) => {
    const isHome = m.home_team_id === teamId;
    return {
      matchDate: m.match_date,
      opponent: isHome ? m.away_team_name : m.home_team_name,
      goalsFor: isHome ? m.full_time_home_goals : m.full_time_away_goals,
      goalsAgainst: isHome ? m.full_time_away_goals : m.full_time_home_goals,
      result: resultForTeam(m, teamId),
      isHome,
    };
  });
}
