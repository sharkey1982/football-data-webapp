// ============================================================================
// src/lib/countryInsightsApi.ts
//
// One row per country's top flight per season, aggregated server-side by
// get_country_league_summary(). Cards and half-time comebacks are null for
// leagues whose source carries neither (football-data.co.uk's all-seasons
// "extra league" files) -- never zero.
// ============================================================================

import { supabase } from './supabase';
import { compareSeasonLabels, seasonNameFromLabel } from './seasonLabels';
import { currentAndEarlierNames } from './divisionEras';

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

/** Seasons worth comparing: at least `minCountries` top flights with data
 * (England alone before 2011/12 is not a comparison). Coverage differs by
 * country, so the page states how many top flights each season has.
 * Newest first (by start year: labels sort wrongly as text once 1990s
 * seasons exist). */
export function comparableSeasons(rows: CountryRow[], minCountries = 2): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.season_label, (counts.get(r.season_label) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n >= minCountries).map(([s]) => s).sort((a, b) => compareSeasonLabels(b, a));
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

/** '2526' -> '2025/26', '9293' -> '1992/93' */
export function seasonName(label: string): string {
  return seasonNameFromLabel(label);
}

/** Rows with a value for `key`, highest first; rows without one are
 * returned separately so the page can name them rather than plot zero. */
export function rankBy<T extends CountryRow>(rows: T[], key: NumericKey): { ranked: T[]; missing: T[] } {
  const ranked = rows.filter((r) => r[key] !== null).sort((a, b) => (b[key] as number) - (a[key] as number) || a.country_name.localeCompare(b.country_name));
  const missing = rows.filter((r) => r[key] === null).sort((a, b) => a.country_name.localeCompare(b.country_name));
  return { ranked, missing };
}

// ---------------------------------------------------------------------------
// Periods: one season, or several pooled. Coverage differs by country
// (England and the big four from 2011/12, the rest from 2016/17), so a
// pooled row covers only the seasons in the period that the country has
// data for, and says which.
// ---------------------------------------------------------------------------

export type PeriodOption = {
  key: string;
  /** 'Last 5 seasons (2021/22-2025/26)', '2025/26', '2013/14 (5 top flights)' */
  label: string;
  /** 'Last 5 seasons'; the season for a single season */
  name: string;
  /** '2021/22-2025/26'; the season for a single season */
  range: string;
  seasons: string[];
  kind: 'season' | 'window';
};

export type PeriodOptions = { windows: PeriodOption[]; singles: PeriodOption[]; defaultKey: string | null };

/** Windows of the last 5 and 10 complete seasons and every comparable
 * season, ending at the last full season (`defaultSeason`), then every
 * comparable season on its own, newest first. A season with fewer top
 * flights than the most in any season says how many. */
export function periodOptions(rows: CountryRow[]): PeriodOptions {
  const seasons = comparableSeasons(rows);
  const anchor = defaultSeason(rows, seasons);
  if (!anchor) return { windows: [], singles: [], defaultKey: null };
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.season_label, (counts.get(r.season_label) ?? 0) + 1);
  const most = Math.max(...seasons.map((s) => counts.get(s) ?? 0));

  const complete = seasons.filter((s) => compareSeasonLabels(s, anchor) <= 0); // newest first
  const range = (list: string[]) => `${seasonName(list[list.length - 1])}–${seasonName(list[0])}`;
  const windows: PeriodOption[] = [];
  for (const n of [5, 10]) {
    if (complete.length > n) {
      const list = complete.slice(0, n);
      const name = `Last ${n} seasons`;
      windows.push({ key: `last-${n}`, label: `${name} (${range(list)})`, name, range: range(list), seasons: list, kind: 'window' });
    }
  }
  if (complete.length > 1) {
    const name = `All ${complete.length} seasons`;
    windows.push({ key: 'all', label: `${name} (${range(complete)})`, name, range: range(complete), seasons: complete, kind: 'window' });
  }
  const singles: PeriodOption[] = seasons.map((s) => {
    const n = counts.get(s) ?? 0;
    const name = seasonName(s);
    return { key: `season-${s}`, label: n < most ? `${name} (${n} top flights)` : name, name, range: name, seasons: [s], kind: 'season' };
  });
  return { windows, singles, defaultKey: `season-${anchor}` };
}

export type CountryPeriodRow = CountryRow & {
  /** Seasons in the period with data for this country. */
  seasons: number;
  first_season: string;
  last_season: string;
  /** Earlier names of the league within the period, with their seasons
   * ("First Division 1992/93–2003/04"); null if it kept one name. */
  earlier_names: string | null;
  /** Seasons that have a value for each measure (fewer than `seasons` where
   * the source lacks it, e.g. cards). */
  metric_seasons: Record<NumericKey, number>;
};

const COMPETITIVENESS: NumericKey[] = ['points_spread', 'bottom_not_losing_pct'];

/** One row per country over the given seasons. Averages are weighted by
 * matches over the seasons that have the measure; the two competitiveness
 * measures (a figure per season's table) are the mean of the seasons'
 * figures. League name as in the latest season, with any earlier names. */
export function poolSeasons(rows: CountryRow[], seasons: string[]): CountryPeriodRow[] {
  const wanted = new Set(seasons);
  const byLeague = new Map<string, CountryRow[]>();
  for (const r of rows) {
    if (!wanted.has(r.season_label)) continue;
    if (!byLeague.has(r.league_code)) byLeague.set(r.league_code, []);
    byLeague.get(r.league_code)!.push(r);
  }
  return [...byLeague.values()].map((list) => {
    const sorted = [...list].sort((a, b) => compareSeasonLabels(a.season_label, b.season_label));
    const latest = sorted[sorted.length - 1];
    const names = currentAndEarlierNames(sorted);
    const out = {
      ...latest,
      league_name: names.name,
      earlier_names: names.earlier,
      matches: sorted.reduce((s, r) => s + r.matches, 0),
      seasons: sorted.length,
      first_season: sorted[0].season_label,
      last_season: latest.season_label,
      metric_seasons: {} as Record<NumericKey, number>,
    } as CountryPeriodRow;
    for (const m of COUNTRY_METRICS) {
      const withValue = sorted.filter((r) => r[m.key] !== null);
      out.metric_seasons[m.key] = withValue.length;
      let value: number | null;
      if (withValue.length === 0) value = null;
      // One season: the server's figure as it is.
      else if (withValue.length === 1) value = withValue[0][m.key] as number;
      else if (COMPETITIVENESS.includes(m.key)) {
        value = Number((withValue.reduce((s, r) => s + (r[m.key] as number), 0) / withValue.length).toFixed(m.decimals));
      } else {
        const weight = withValue.reduce((s, r) => s + r.matches, 0);
        value = Number((withValue.reduce((s, r) => s + (r[m.key] as number) * r.matches, 0) / weight).toFixed(m.decimals));
      }
      (out as Record<NumericKey, number | null>)[m.key] = value;
    }
    return out;
  });
}

/** Countries grouped by the seasons they cover, most seasons first:
 * [{ range: '2011/12–2025/26', seasons: 15, countries: ['England', ...] }]. */
export function coverageGroups(rows: CountryPeriodRow[]): { range: string; seasons: number; countries: string[] }[] {
  const groups = new Map<string, { range: string; seasons: number; countries: string[]; first: string }>();
  for (const r of rows) {
    const key = `${r.first_season}|${r.last_season}|${r.seasons}`;
    if (!groups.has(key)) {
      const range = r.first_season === r.last_season ? seasonName(r.first_season) : `${seasonName(r.first_season)}–${seasonName(r.last_season)}`;
      groups.set(key, { range, seasons: r.seasons, countries: [], first: r.first_season });
    }
    groups.get(key)!.countries.push(r.country_name);
  }
  return [...groups.values()]
    .sort((a, b) => b.seasons - a.seasons || compareSeasonLabels(a.first, b.first))
    .map(({ range, seasons, countries }) => ({ range, seasons, countries: countries.sort((x, y) => x.localeCompare(y)) }));
}
