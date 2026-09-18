// ============================================================================
// src/lib/crossLeagueApi.ts
//
// Per-division, per-season summary across the whole English pyramid.
//
// This is the thing single-league sites structurally can't produce:
// putting the Premier League and the National League on the same axis
// requires holding all five divisions in one schema. Aggregated
// server-side -- the alternative is shipping ~31,000 match rows to the
// browser to compute a handful of averages.
// ============================================================================

import { supabase } from './supabase';

export type CrossLeagueRow = {
  league_code: string;
  league_name: string;
  season_label: string;
  matches: number;
  goals_per_game: number;
  home_win_pct: number;
  draw_pct: number;
  away_win_pct: number;
  yellows_per_game: number;
  reds_per_game: number;
};

export type CrossLeagueMetric = {
  key: keyof CrossLeagueRow;
  label: string;
  unit: string;
  /** How to phrase the finding in prose, so the page answers the
   * question rather than only plotting it. */
  describe: (highest: CrossLeagueRow, lowest: CrossLeagueRow) => string;
};

export const CROSS_LEAGUE_METRICS: CrossLeagueMetric[] = [
  {
    key: 'goals_per_game',
    label: 'Goals per game',
    unit: '',
    describe: (hi, lo) =>
      `${hi.league_name} has seen the most goals per game (${hi.goals_per_game}), ${lo.league_name} the fewest (${lo.goals_per_game}).`,
  },
  {
    key: 'home_win_pct',
    label: 'Home wins',
    unit: '%',
    describe: (hi, lo) =>
      `Home advantage is strongest in ${hi.league_name} (${hi.home_win_pct}% of matches) and weakest in ${lo.league_name} (${lo.home_win_pct}%).`,
  },
  {
    key: 'draw_pct',
    label: 'Draws',
    unit: '%',
    describe: (hi, lo) => `${hi.league_name} draws most often (${hi.draw_pct}%), ${lo.league_name} least (${lo.draw_pct}%).`,
  },
  {
    key: 'yellows_per_game',
    label: 'Yellow cards per game',
    unit: '',
    describe: (hi, lo) =>
      `${hi.league_name} sees the most bookings per game (${hi.yellows_per_game}), ${lo.league_name} the fewest (${lo.yellows_per_game}).`,
  },
];

export async function getCrossLeagueSummary(): Promise<CrossLeagueRow[]> {
  const { data, error } = await (supabase as any).rpc('get_cross_league_summary');
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    matches: Number(r.matches),
    goals_per_game: Number(r.goals_per_game),
    home_win_pct: Number(r.home_win_pct),
    draw_pct: Number(r.draw_pct),
    away_win_pct: Number(r.away_win_pct),
    yellows_per_game: Number(r.yellows_per_game),
    reds_per_game: Number(r.reds_per_game),
  }));
}

/** Collapses the per-season rows into one row per division, weighting by
 * matches played rather than averaging the season averages -- a season
 * with 380 matches shouldn't count the same as one with 552. */
export function aggregateByLeague(rows: CrossLeagueRow[]): CrossLeagueRow[] {
  const byLeague = new Map<string, CrossLeagueRow[]>();
  for (const r of rows) {
    if (!byLeague.has(r.league_code)) byLeague.set(r.league_code, []);
    byLeague.get(r.league_code)!.push(r);
  }
  const weighted = (list: CrossLeagueRow[], key: keyof CrossLeagueRow) => {
    const total = list.reduce((s, r) => s + r.matches, 0);
    if (total === 0) return 0;
    return list.reduce((s, r) => s + (r[key] as number) * r.matches, 0) / total;
  };
  return [...byLeague.values()].map((list) => ({
    ...list[0],
    season_label: 'all',
    matches: list.reduce((s, r) => s + r.matches, 0),
    goals_per_game: Number(weighted(list, 'goals_per_game').toFixed(2)),
    home_win_pct: Number(weighted(list, 'home_win_pct').toFixed(1)),
    draw_pct: Number(weighted(list, 'draw_pct').toFixed(1)),
    away_win_pct: Number(weighted(list, 'away_win_pct').toFixed(1)),
    yellows_per_game: Number(weighted(list, 'yellows_per_game').toFixed(2)),
    reds_per_game: Number(weighted(list, 'reds_per_game').toFixed(3)),
  }));
}
