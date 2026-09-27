import { describe, it, expect, vi, beforeEach } from 'vitest';

// A chainable stand-in for the supabase query builder: records every call
// and resolves to whatever the test queued for that table.
type Call = { method: string; args: unknown[] };
const calls: Record<string, Call[]> = {};
const results: Record<string, { data: unknown; error: unknown }> = {};

function builder(table: string) {
  calls[table] = calls[table] ?? [];
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'lt', 'order', 'limit', 'not']) {
    b[m] = (...args: unknown[]) => {
      calls[table].push({ method: m, args });
      return b;
    };
  }
  b.maybeSingle = () => {
    calls[table].push({ method: 'maybeSingle', args: [] });
    const r = results[table] ?? { data: null, error: null };
    const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data;
    return Promise.resolve({ data: d, error: r.error });
  };
  b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject);
  return b;
}

vi.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => builder(table), rpc: vi.fn() },
}));

import { compareSeasonLabels, labelStartYear, seasonNameFromLabel } from '../lib/seasonLabels';
import { comparableSeasons, seasonName as countrySeasonName, type CountryRow } from '../lib/countryInsightsApi';
import { overroundBySeason, seasonLabel as marketSeasonLabel } from '../lib/marketApi';
import { parseSeasonLabel, labelForStartYear } from '../../scripts/lib/footballDataCsv';
import { getLeagueNameForSeason, getLeagueNamesForSeason, getMostRecentFixtureSeason } from '../lib/referenceApi';
import { getRawMatchFiles } from '../lib/rawDataApi';
import { getXiSeasons } from '../lib/seasonXiApi';
import { getMatchBySlug } from '../lib/matchPageApi';

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  for (const k of Object.keys(results)) delete results[k];
});

describe('season labels', () => {
  it('reads the century from the two-digit year', () => {
    expect(labelStartYear('9293')).toBe(1992);
    expect(labelStartYear('9900')).toBe(1999);
    expect(labelStartYear('0001')).toBe(2000);
    expect(labelStartYear('1314')).toBe(2013);
    expect(labelStartYear('2627')).toBe(2026);
    expect(labelStartYear('2025-2026')).toBeNull();
  });

  it('names seasons in full', () => {
    expect(seasonNameFromLabel('9293')).toBe('1992/93');
    expect(seasonNameFromLabel('9900')).toBe('1999/00');
    expect(seasonNameFromLabel('0405')).toBe('2004/05');
    expect(seasonNameFromLabel('2526')).toBe('2025/26');
    expect(countrySeasonName('9899')).toBe('1998/99');
    expect(marketSeasonLabel('9899')).toBe('1998/99');
    expect(marketSeasonLabel('odd')).toBe('odd');
  });

  it('sorts by year, not as text', () => {
    const labels = ['2627', '9293', '0001', '1415', '9900', '1314'];
    expect([...labels].sort(compareSeasonLabels)).toEqual(['9293', '9900', '0001', '1314', '1415', '2627']);
    // As text, 1990s seasons would land after 2026/27.
    expect([...labels].sort()).not.toEqual([...labels].sort(compareSeasonLabels));
  });

  it('the CSV importer reads 1990s labels as the 1900s', () => {
    expect(parseSeasonLabel('9293')).toEqual({ startYear: 1992, split: '1992/1993' });
    expect(parseSeasonLabel('0001')).toEqual({ startYear: 2000, split: '2000/2001' });
    expect(parseSeasonLabel('2627')).toEqual({ startYear: 2026, split: '2026/2027' });
    expect(labelForStartYear(1999)).toBe('9900');
  });
});

describe('client-side season ordering', () => {
  it('Countries Compared lists seasons newest first by year', () => {
    const row = (season_label: string) => ({ season_label, matches: 380 }) as unknown as CountryRow;
    const rows = ['9293', '2627', '2526'].flatMap((s) => Array.from({ length: 10 }, () => row(s)));
    expect(comparableSeasons(rows)).toEqual(['2627', '2526', '9293']);
  });

  it('the overround trend runs oldest to newest by year', () => {
    const p = (season_label: string) => ({ season_label, league_code: 'E0', matches: 380, overround: 1.05 });
    expect(overroundBySeason([p('2526'), p('9293'), p('0001')]).map((s) => s.season)).toEqual(['9293', '0001', '2526']);
  });

  it('raw source files list the newest season first by year', async () => {
    results.raw_match_files = {
      data: [
        { season_label: '9293', competition_code: 'E0', column_names: [] },
        { season_label: '2627', competition_code: 'E0', column_names: [] },
        { season_label: '2627', competition_code: 'E1', column_names: [] },
        { season_label: '0001', competition_code: 'E0', column_names: [] },
      ],
      error: null,
    };
    const files = await getRawMatchFiles();
    expect(files.map((f) => `${f.season_label}/${f.competition_code}`)).toEqual(['2627/E0', '2627/E1', '0001/E0', '9293/E0']);
    // Not ordered on the server by the text label any more.
    expect(calls.raw_match_files.some((c) => c.method === 'order' && c.args[0] === 'season_label')).toBe(false);
  });

  it('Season XI lists seasons newest first by year, not by season_id', async () => {
    results.season_best_xi = {
      data: [
        { season_id: 20, total_points: 100, start_cost: 50, seasons: { slug: '1998-99', label: '9899', start_year: 1998 } },
        { season_id: 12, total_points: 200, start_cost: 60, seasons: { slug: '2025-26', label: '2526', start_year: 2025 } },
      ],
      error: null,
    };
    expect((await getXiSeasons()).map((s) => s.slug)).toEqual(['2025-26', '1998-99']);
  });
});

describe('reference lookups', () => {
  it('the most recent fixture season is chosen by start_year, not season_id', async () => {
    results.seasons = { data: [{ season_id: 13, label: '2627', start_year: 2026, fixtures: [{ fixture_id: 1 }] }], error: null };
    expect(await getMostRecentFixtureSeason(2)).toEqual({ season_id: 13, label: '2627', start_year: 2026 });
    const c = calls.seasons;
    expect(c).toContainEqual({ method: 'order', args: ['start_year', { ascending: false }] });
    expect(c).toContainEqual({ method: 'eq', args: ['fixtures.league_id', 2] });
    expect(c.some((x) => x.method === 'order' && x.args[0] === 'season_id')).toBe(false);
  });

  it('division names for a season come back keyed by league', async () => {
    results.league_season_display_names = {
      data: [{ league_id: 2, name: 'First Division' }, { league_id: 5, name: 'Football Conference' }],
      error: null,
    };
    const names = await getLeagueNamesForSeason(20);
    expect(names.get(2)).toBe('First Division');
    expect(names.get(5)).toBe('Football Conference');
    expect(calls.league_season_display_names).toContainEqual({ method: 'eq', args: ['season_id', 20] });
  });

  it('one division name for one season', async () => {
    results.league_season_display_names = { data: [{ league_id: 3, name: 'Second Division' }], error: null };
    expect(await getLeagueNameForSeason(3, 20)).toBe('Second Division');
    results.league_season_display_names = { data: null, error: null };
    expect(await getLeagueNameForSeason(3, 999)).toBeNull();
  });

  it('a match page names the division as it was in that season', async () => {
    const fixture = {
      fixture_id: 9, slug: 'x-v-y-1998-10-03', kickoff_date: '1998-10-03', status: 'scheduled', matchweek: 9,
      league_id: 2, season_id: 20, home_team_id: 1, away_team_id: 2,
      predicted_home_goals: null, predicted_away_goals: null, predicted_at: null, prediction_fit_run_id: null,
      home_team: { display_name: 'X', slug: 'x' }, away_team: { display_name: 'Y', slug: 'y' }, leagues: { name: 'Championship' },
    };
    results.fixtures = { data: [fixture], error: null };
    results.league_season_display_names = { data: [{ league_id: 2, name: 'First Division' }], error: null };
    expect((await getMatchBySlug('x-v-y-1998-10-03'))?.league_name).toBe('First Division');
    expect(calls.league_season_display_names).toContainEqual({ method: 'eq', args: ['league_id', 2] });

    // Lookup failure: today's name rather than no page.
    results.league_season_display_names = { data: null, error: new Error('down') };
    expect((await getMatchBySlug('x-v-y-1998-10-03'))?.league_name).toBe('Championship');
  });

  it('a failed name lookup is an error, not a silent blank', async () => {
    results.league_season_display_names = { data: null, error: new Error('boom') };
    await expect(getLeagueNamesForSeason(20)).rejects.toThrow('boom');
  });
});
