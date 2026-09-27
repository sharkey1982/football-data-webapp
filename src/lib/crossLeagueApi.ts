// ============================================================================
// src/lib/crossLeagueApi.ts
//
// Per-division, per-season summary across the whole English pyramid.
//
// This is the thing single-league sites structurally can't produce:
// putting the Premier League and the National League on the same axis
// requires holding all five divisions in one schema. Aggregated
// server-side -- the alternative is shipping every match row (tens of
// thousands) to the browser to compute a handful of averages. One row per
// division-season, named as the division was named that season.
// ============================================================================

import { supabase } from './supabase';
import { compareSeasonLabels } from './seasonLabels';
import { currentAndEarlierNames } from './divisionEras';

export type CrossLeagueRow = {
  league_code: string;
  /** The division's name in that season (First Division for E1 before 2004/05). */
  league_name: string;
  season_label: string;
  matches: number;
  goals_per_game: number;
  home_goals_per_game: number;
  away_goals_per_game: number;
  home_win_pct: number;
  draw_pct: number;
  away_win_pct: number;
  /** Null for a division-season without card data (England before 2000/01). */
  yellows_per_game: number | null;
  reds_per_game: number | null;
  over_two_five_pct: number;
  both_scored_pct: number;
  nil_nil_pct: number;
  /** Null for a division-season without half-time scores. */
  comeback_pct: number | null;
};

/** One division pooled over every season in the archive. */
export type CrossLeagueTotal = CrossLeagueRow & {
  /** Earlier names with their seasons, e.g. 'First Division 1992/93-2003/04'. */
  earlier_names: string | null;
  first_season: string;
  last_season: string;
  seasons: number;
  /** Seasons behind the measures that some seasons lack. */
  metric_seasons: Record<'yellows_per_game' | 'reds_per_game' | 'comeback_pct', number>;
};

export type CrossLeagueMetric = {
  key: keyof CrossLeagueRow;
  label: string;
  unit: string;
  /** How to phrase the finding in prose, so the page answers the
   * question rather than only plotting it. */
  describe: (highest: CrossLeagueTotal, lowest: CrossLeagueTotal) => string;
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
    key: 'home_goals_per_game',
    label: 'Home goals per game',
    unit: '',
    describe: (hi, lo) =>
      `Home sides score most in ${hi.league_name} (${hi.home_goals_per_game} a game) and least in ${lo.league_name} (${lo.home_goals_per_game}).`,
  },
  {
    key: 'away_goals_per_game',
    label: 'Away goals per game',
    unit: '',
    describe: (hi, lo) =>
      `Away sides score most in ${hi.league_name} (${hi.away_goals_per_game} a game) and least in ${lo.league_name} (${lo.away_goals_per_game}).`,
  },
  {
    key: 'home_win_pct',
    label: 'Home wins',
    unit: '%',
    describe: (hi, lo) =>
      `Home advantage is strongest in ${hi.league_name} (${hi.home_win_pct}% of matches) and weakest in ${lo.league_name} (${lo.home_win_pct}%).`,
  },
  {
    key: 'away_win_pct',
    label: 'Away wins',
    unit: '%',
    describe: (hi, lo) =>
      `Away sides win most often in ${hi.league_name} (${hi.away_win_pct}%) and least in ${lo.league_name} (${lo.away_win_pct}%).`,
  },
  {
    key: 'draw_pct',
    label: 'Draws',
    unit: '%',
    describe: (hi, lo) => `${hi.league_name} draws most often (${hi.draw_pct}%), ${lo.league_name} least (${lo.draw_pct}%).`,
  },
  {
    key: 'over_two_five_pct',
    label: 'Over 2.5 goals',
    unit: '%',
    describe: (hi, lo) =>
      `${hi.league_name} goes over 2.5 goals most often (${hi.over_two_five_pct}% of matches), ${lo.league_name} least (${lo.over_two_five_pct}%).`,
  },
  {
    key: 'both_scored_pct',
    label: 'Both teams scored',
    unit: '%',
    describe: (hi, lo) =>
      `Both sides score in ${hi.both_scored_pct}% of ${hi.league_name} matches, against ${lo.both_scored_pct}% in ${lo.league_name}.`,
  },
  {
    key: 'nil_nil_pct',
    label: 'Goalless draws',
    unit: '%',
    describe: (hi, lo) =>
      `${hi.league_name} finishes goalless most often (${hi.nil_nil_pct}%), ${lo.league_name} least (${lo.nil_nil_pct}%).`,
  },
  {
    key: 'yellows_per_game',
    label: 'Yellow cards per game',
    unit: '',
    describe: (hi, lo) =>
      `${hi.league_name} sees the most bookings per game (${hi.yellows_per_game}), ${lo.league_name} the fewest (${lo.yellows_per_game}).`,
  },
  {
    key: 'reds_per_game',
    label: 'Red cards per game',
    unit: '',
    describe: (hi, lo) =>
      `${hi.league_name} sees the most red cards per game (${hi.reds_per_game}), ${lo.league_name} the fewest (${lo.reds_per_game}). Sendings-off rise steadily down the pyramid \u2014 the opposite of bookings.`,
  },
  {
    key: 'comeback_pct',
    label: 'Half-time lead lost',
    unit: '%',
    describe: (hi, lo) =>
      `A half-time lead is least safe in ${hi.league_name}, where the leading side fails to win ${hi.comeback_pct}% of the time, against ${lo.comeback_pct}% in ${lo.league_name}.`,
  },
];

export async function getCrossLeagueSummary(): Promise<CrossLeagueRow[]> {
  const { data, error } = await supabase.rpc('get_cross_league_summary');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    matches: Number(r.matches),
    goals_per_game: Number(r.goals_per_game),
    home_goals_per_game: Number(r.home_goals_per_game),
    away_goals_per_game: Number(r.away_goals_per_game),
    home_win_pct: Number(r.home_win_pct),
    draw_pct: Number(r.draw_pct),
    away_win_pct: Number(r.away_win_pct),
    yellows_per_game: r.yellows_per_game === null ? null : Number(r.yellows_per_game),
    reds_per_game: r.reds_per_game === null ? null : Number(r.reds_per_game),
    over_two_five_pct: Number(r.over_two_five_pct),
    both_scored_pct: Number(r.both_scored_pct),
    nil_nil_pct: Number(r.nil_nil_pct),
    comeback_pct: r.comeback_pct === null || r.comeback_pct === undefined ? null : Number(r.comeback_pct),
  }));
}

/** Collapses the per-season rows into one row per division, weighting by
 * matches played rather than averaging the season averages -- a season
 * with 380 matches shouldn't count the same as one with 552. Seasons
 * without a measure (no cards before 2000/01, no half-time scores in the
 * early 1990s) are left out of that measure rather than counted as zero.
 * Named as today, with the earlier names and their seasons. */
export function aggregateByLeague(rows: CrossLeagueRow[]): CrossLeagueTotal[] {
  const byLeague = new Map<string, CrossLeagueRow[]>();
  for (const r of rows) {
    if (!byLeague.has(r.league_code)) byLeague.set(r.league_code, []);
    byLeague.get(r.league_code)!.push(r);
  }
  const weighted = (list: CrossLeagueRow[], key: keyof CrossLeagueRow, decimals: number): number | null => {
    const withValue = list.filter((r) => r[key] !== null && r[key] !== undefined);
    const total = withValue.reduce((s, r) => s + r.matches, 0);
    if (total === 0) return null;
    return Number((withValue.reduce((s, r) => s + (r[key] as number) * r.matches, 0) / total).toFixed(decimals));
  };
  const count = (list: CrossLeagueRow[], key: keyof CrossLeagueRow) => list.filter((r) => r[key] !== null && r[key] !== undefined).length;
  return [...byLeague.values()].map((unsorted) => {
    const list = [...unsorted].sort((a, b) => compareSeasonLabels(a.season_label, b.season_label));
    const names = currentAndEarlierNames(list);
    return {
      ...list[list.length - 1],
      league_name: names.name,
      earlier_names: names.earlier,
      first_season: list[0].season_label,
      last_season: list[list.length - 1].season_label,
      seasons: list.length,
      metric_seasons: {
        yellows_per_game: count(list, 'yellows_per_game'),
        reds_per_game: count(list, 'reds_per_game'),
        comeback_pct: count(list, 'comeback_pct'),
      },
      season_label: 'all',
      matches: list.reduce((s, r) => s + r.matches, 0),
      goals_per_game: weighted(list, 'goals_per_game', 2) ?? 0,
      home_goals_per_game: weighted(list, 'home_goals_per_game', 2) ?? 0,
      away_goals_per_game: weighted(list, 'away_goals_per_game', 2) ?? 0,
      home_win_pct: weighted(list, 'home_win_pct', 1) ?? 0,
      draw_pct: weighted(list, 'draw_pct', 1) ?? 0,
      away_win_pct: weighted(list, 'away_win_pct', 1) ?? 0,
      yellows_per_game: weighted(list, 'yellows_per_game', 2),
      reds_per_game: weighted(list, 'reds_per_game', 3),
      over_two_five_pct: weighted(list, 'over_two_five_pct', 1) ?? 0,
      both_scored_pct: weighted(list, 'both_scored_pct', 1) ?? 0,
      nil_nil_pct: weighted(list, 'nil_nil_pct', 1) ?? 0,
      comeback_pct: weighted(list, 'comeback_pct', 1),
    };
  });
}
