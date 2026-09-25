// ============================================================================
// src/lib/countryInsightsApi.ts
//
// One row per country's top flight per season, aggregated server-side by
// get_country_league_summary(). Cards and half-time comebacks are null for
// leagues whose source carries neither (football-data.co.uk's all-seasons
// "extra league" files) -- never zero.
// ============================================================================

import { supabase } from './supabase';

export type CountryRow = {
  country_id: number;
  country_name: string;
  league_code: string;
  league_name: string;
  season_label: string;
  matches: number;
  goals_per_game: number;
  home_goals_per_game: number;
  away_goals_per_game: number;
  home_win_pct: number;
  draw_pct: number;
  away_win_pct: number;
  yellows_per_game: number | null;
  reds_per_game: number | null;
  over_two_five_pct: number;
  both_scored_pct: number;
  nil_nil_pct: number;
  comeback_pct: number | null;
  /** SD of clubs' points per game; higher = more one-sided. */
  points_spread: number | null;
  /** % of top v bottom half matches the bottom-half club didn't lose; higher = more even. */
  bottom_not_losing_pct: number | null;
};

type NumericKey = Exclude<keyof CountryRow, 'country_id' | 'country_name' | 'league_code' | 'league_name' | 'season_label' | 'matches'>;

export type CountryMetric = { key: NumericKey; label: string; unit: string; decimals: number; note?: string };

export const COUNTRY_METRICS: CountryMetric[] = [
  { key: 'goals_per_game', label: 'Goals per game', unit: '', decimals: 2 },
  { key: 'home_goals_per_game', label: 'Home goals per game', unit: '', decimals: 2 },
  { key: 'away_goals_per_game', label: 'Away goals per game', unit: '', decimals: 2 },
  { key: 'home_win_pct', label: 'Home wins', unit: '%', decimals: 1 },
  { key: 'away_win_pct', label: 'Away wins', unit: '%', decimals: 1 },
  { key: 'draw_pct', label: 'Draws', unit: '%', decimals: 1 },
  { key: 'over_two_five_pct', label: 'Over 2.5 goals', unit: '%', decimals: 1 },
  { key: 'both_scored_pct', label: 'Both teams scored', unit: '%', decimals: 1 },
  { key: 'nil_nil_pct', label: 'Goalless draws', unit: '%', decimals: 1 },
  { key: 'yellows_per_game', label: 'Yellow cards per game', unit: '', decimals: 2 },
  { key: 'reds_per_game', label: 'Red cards per game', unit: '', decimals: 3 },
  { key: 'comeback_pct', label: 'Half-time lead lost', unit: '%', decimals: 1 },
  {
    key: 'points_spread',
    label: 'Competitiveness: points spread',
    unit: '',
    decimals: 2,
    note: 'Spread of clubs\u2019 points per game. Higher = more one-sided.',
  },
  {
    key: 'bottom_not_losing_pct',
    label: 'Competitiveness: bottom half v top half',
    unit: '%',
    decimals: 1,
    note: 'Share of top-half v bottom-half games the bottom-half club drew or won. Higher = more evenly matched.',
  },
];

const num = (v: unknown) => Number(v);
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function getCountrySummary(): Promise<CountryRow[]> {
  // Newer than the generated types.
  const rpc = (supabase as unknown as { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> }).rpc.bind(supabase);
  const [summary, competitiveness] = await Promise.all([rpc('get_country_league_summary'), rpc('get_country_competitiveness')]);
  if (summary.error) throw summary.error;
  // Competitiveness is a second, independent query: if it fails the page
  // still shows everything else, with those two measures marked no data.
  const comp = new Map<string, Record<string, unknown>>();
  if (!competitiveness.error) {
    for (const c of (competitiveness.data ?? []) as Record<string, unknown>[]) comp.set(`${c.league_code}|${c.season_label}`, c);
  }
  return ((summary.data ?? []) as Record<string, unknown>[]).map((r) => ({
    country_id: num(r.country_id),
    country_name: String(r.country_name),
    league_code: String(r.league_code),
    league_name: String(r.league_name),
    season_label: String(r.season_label),
    matches: num(r.matches),
    goals_per_game: num(r.goals_per_game),
    home_goals_per_game: num(r.home_goals_per_game),
    away_goals_per_game: num(r.away_goals_per_game),
    home_win_pct: num(r.home_win_pct),
    draw_pct: num(r.draw_pct),
    away_win_pct: num(r.away_win_pct),
    yellows_per_game: numOrNull(r.yellows_per_game),
    reds_per_game: numOrNull(r.reds_per_game),
    over_two_five_pct: num(r.over_two_five_pct),
    both_scored_pct: num(r.both_scored_pct),
    nil_nil_pct: num(r.nil_nil_pct),
    comeback_pct: numOrNull(r.comeback_pct),
    points_spread: numOrNull(comp.get(`${r.league_code}|${r.season_label}`)?.points_spread),
    bottom_not_losing_pct: numOrNull(comp.get(`${r.league_code}|${r.season_label}`)?.bottom_not_losing_pct),
  }));
}

/** Seasons worth comparing: at least `minCountries` top flights with data.
 * Most countries only go back to 2025/26, so older English/Big 5-only
 * seasons would be a comparison of five. Newest first. */
export function comparableSeasons(rows: CountryRow[], minCountries = 10): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.season_label, (counts.get(r.season_label) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n >= minCountries).map(([s]) => s).sort().reverse();
}

/** Default to the newest season in which every league has a full-ish
 * sample (>= 150 matches) -- i.e. the last completed season, not four
 * weeks of the current one. Falls back to the newest comparable season. */
export function defaultSeason(rows: CountryRow[], seasons: string[]): string | null {
  for (const s of seasons) {
    const inSeason = rows.filter((r) => r.season_label === s);
    if (inSeason.length > 0 && inSeason.every((r) => r.matches >= 150)) return s;
  }
  return seasons[0] ?? null;
}

/** Fixed decimals so 3.10 doesn't render as 3.1; null (no source data) as a dash. */
export function formatValue(v: number | null, decimals: number, unit = ''): string {
  return v === null ? '\u2013' : `${v.toFixed(decimals)}${unit}`;
}

/** '2526' -> '2025/26' */
export function seasonName(label: string): string {
  return `20${label.slice(0, 2)}/${label.slice(2)}`;
}

/** Rows with a value for `key`, highest first; rows without one are
 * returned separately so the page can name them rather than plot zero. */
export function rankBy(rows: CountryRow[], key: NumericKey): { ranked: CountryRow[]; missing: CountryRow[] } {
  const ranked = rows.filter((r) => r[key] !== null).sort((a, b) => (b[key] as number) - (a[key] as number) || a.country_name.localeCompare(b.country_name));
  const missing = rows.filter((r) => r[key] === null).sort((a, b) => a.country_name.localeCompare(b.country_name));
  return { ranked, missing };
}
