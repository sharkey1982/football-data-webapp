import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  comparableSeasons,
  coverageGroups,
  defaultSeason,
  formatValue,
  periodOptions,
  poolSeasons,
  rankBy,
  seasonName,
  type CountryRow,
} from '../lib/countryInsightsApi';

const row = (country: string, code: string, season: string, over: Partial<CountryRow> = {}): CountryRow => ({
  country_id: code.length, country_name: country, league_code: code, league_name: `${country} League`, season_label: season,
  matches: 300, goals_per_game: 2.5, home_goals_per_game: 1.4, away_goals_per_game: 1.1, home_win_pct: 45, draw_pct: 25,
  away_win_pct: 30, yellows_per_game: 4, reds_per_game: 0.2, over_two_five_pct: 50, both_scored_pct: 50, nil_nil_pct: 7,
  comeback_pct: 25, points_spread: 0.4, bottom_not_losing_pct: 40, ...over,
});

const tenCountries = (season: string, matches: number) =>
  Array.from({ length: 10 }, (_, i) => row(`Country ${String.fromCharCode(65 + i)}`, `C${i}`, season, { matches }));

describe('country insights helpers', () => {
  it('offers seasons with at least two countries, newest first (England alone is no comparison)', () => {
    const rows = [
      ...tenCountries('2526', 300),
      ...tenCountries('2627', 40),
      row('England', 'E0', '1112'),
      row('Spain', 'SP1', '1112'),
      row('England', 'E0', '9293'),
    ];
    expect(comparableSeasons(rows)).toEqual(['2627', '2526', '1112']);
    expect(comparableSeasons(rows, 10)).toEqual(['2627', '2526']);
  });

  it('defaults to the last full season, not a few weeks of the current one', () => {
    const rows = [...tenCountries('2526', 300), ...tenCountries('2627', 40)];
    expect(defaultSeason(rows, comparableSeasons(rows))).toBe('2526');
    expect(defaultSeason(tenCountries('2627', 40), ['2627'])).toBe('2627');
  });

  it('ranks highest first and keeps missing values out of the ranking', () => {
    const rows = [row('Spain', 'SP1', '2526', { yellows_per_game: 4.4 }), row('Norway', 'NOR', '2526', { yellows_per_game: null }), row('Greece', 'G1', '2526', { yellows_per_game: 5.1 })];
    const { ranked, missing } = rankBy(rows, 'yellows_per_game');
    expect(ranked.map((r) => r.country_name)).toEqual(['Greece', 'Spain']);
    expect(missing.map((r) => r.country_name)).toEqual(['Norway']);
  });

  it('formats season labels and keeps trailing zeros', () => {
    expect(seasonName('2526')).toBe('2025/26');
    expect(formatValue(3.1, 2)).toBe('3.10');
    expect(formatValue(26, 1, '%')).toBe('26.0%');
    expect(formatValue(null, 2)).toBe('\u2013');
  });
});

// England and Spain from 2011/12, Norway from 2016/17, all to 2025/26 plus
// a few weeks of 2026/27 -- the shape of the real coverage.
const label = (y: number) => `${String(y % 100).padStart(2, '0')}${String((y + 1) % 100).padStart(2, '0')}`;
const history = (): CountryRow[] => {
  const out: CountryRow[] = [];
  for (let y = 2011; y <= 2026; y++) {
    const m = y === 2026 ? 40 : 380;
    out.push(row('England', 'E0', label(y), { matches: m, league_name: 'Premier League' }));
    out.push(row('Spain', 'SP1', label(y), { matches: m, league_name: 'La Liga' }));
    if (y >= 2016) out.push(row('Norway', 'NOR', label(y), { matches: y === 2026 ? 40 : 240, league_name: 'Eliteserien' }));
  }
  return out;
};

describe('country insights periods', () => {
  it('offers the last 5, last 10 and all complete seasons, then each season, defaulting to the last full one', () => {
    const { windows, singles, defaultKey } = periodOptions(history());
    expect(windows.map((w) => w.label)).toEqual([
      'Last 5 seasons (2021/22–2025/26)',
      'Last 10 seasons (2016/17–2025/26)',
      'All 15 seasons (2011/12–2025/26)',
    ]);
    expect(windows[0].seasons).toEqual(['2526', '2425', '2324', '2223', '2122']);
    // The season in progress is a single-season option, never part of a window.
    expect(singles[0].label).toBe('2026/27');
    expect(singles.find((s) => s.key === 'season-1516')?.label).toBe('2015/16 (2 top flights)');
    expect(singles.find((s) => s.key === 'season-1617')?.label).toBe('2016/17');
    expect(defaultKey).toBe('season-2526');
  });

  it('pools each country over the seasons it has, weighting by matches and skipping seasons without a measure', () => {
    const rows = history().map((r) => {
      if (r.league_code !== 'E0') return r;
      if (r.season_label === '1112') return { ...r, goals_per_game: 3.0, yellows_per_game: null, points_spread: 0.6 };
      if (r.season_label === '1213') return { ...r, matches: 760, goals_per_game: 2.0, yellows_per_game: 3.0, points_spread: 0.3 };
      return r;
    });
    const pooled = poolSeasons(rows, ['1213', '1112']);
    const england = pooled.find((r) => r.league_code === 'E0')!;
    // 380 at 3.0 and 760 at 2.0 -> 2.33, not the flat mean 2.5.
    expect(england.goals_per_game).toBe(2.33);
    expect(england.matches).toBe(1140);
    // Cards only from the season that has them.
    expect(england.yellows_per_game).toBe(3);
    expect(england.metric_seasons.yellows_per_game).toBe(1);
    // Competitiveness: the mean of the seasons' figures, each season once.
    expect(england.points_spread).toBe(0.45);
    expect(england).toMatchObject({ seasons: 2, first_season: '1112', last_season: '1213', earlier_names: null });
    // Norway has no data in either season: not in the comparison at all.
    expect(pooled.map((r) => r.league_code).sort()).toEqual(['E0', 'SP1']);
  });

  it('keeps a single season exactly as the server gave it', () => {
    const [one] = poolSeasons([row('Greece', 'G1', '2526', { goals_per_game: 2.675, draw_pct: 26.3 })], ['2526']);
    expect(one.goals_per_game).toBe(2.675);
    expect(one.draw_pct).toBe(26.3);
  });

  it('groups countries by the seasons they cover, most first', () => {
    const all = periodOptions(history()).windows.find((w) => w.key === 'all')!;
    expect(coverageGroups(poolSeasons(history(), all.seasons))).toEqual([
      { range: '2011/12–2025/26', seasons: 15, countries: ['England', 'Spain'] },
      { range: '2016/17–2025/26', seasons: 10, countries: ['Norway'] },
    ]);
  });
});

vi.mock('../lib/countryInsightsApi', async (orig) => {
  const actual = await orig<typeof import('../lib/countryInsightsApi')>();
  return { ...actual, getCountrySummary: vi.fn() };
});

describe('CountryInsightsPage', () => {
  it('shows competitiveness with its one-line definition', async () => {
    const api = await import('../lib/countryInsightsApi');
    const rows = [...tenCountries('2526', 300), row('Portugal', 'P1', '2526', { points_spread: 0.556 }), row('Poland', 'POL', '2526', { points_spread: 0.201 })];
    vi.mocked(api.getCountrySummary).mockResolvedValue(rows);
    const { default: Page } = await import('../pages/football/CountryInsightsPage');
    render(<MemoryRouter><Page /></MemoryRouter>);
    await screen.findByText(/12 top flights/);
    await userEvent.selectOptions(screen.getAllByRole('combobox')[1], 'points_spread');
    expect(screen.getByText('Highest: Portugal (0.56). Lowest: Poland (0.20).')).toBeInTheDocument();
    expect(screen.getByText(/Higher = more one-sided/)).toBeInTheDocument();
  });

  it('shows the last full season, names countries with no card data instead of plotting zero', async () => {
    const api = await import('../lib/countryInsightsApi');
    const rows = [
      ...tenCountries('2526', 300),
      row('Greece', 'G1', '2526', { yellows_per_game: 5.08 }),
      row('Norway', 'NOR', '2526', { yellows_per_game: null, reds_per_game: null, comeback_pct: null }),
      ...tenCountries('2627', 40),
    ];
    vi.mocked(api.getCountrySummary).mockResolvedValue(rows);
    const { default: Page } = await import('../pages/football/CountryInsightsPage');
    render(<MemoryRouter><Page /></MemoryRouter>);

    await screen.findByText(/12 top flights, 2025\/26/);
    await userEvent.selectOptions(screen.getAllByRole('combobox')[1], 'yellows_per_game');
    expect(screen.getByText('Highest: Greece (5.08). Lowest: Country J (4.00).')).toBeInTheDocument();
    expect(screen.getByText('No data: Norway.')).toBeInTheDocument();
    const bars = screen.getByLabelText('Yellow cards per game by country');
    expect(within(bars).queryByText('Norway')).not.toBeInTheDocument();
    // Table shows a dash, not 0, for Norway's cards.
    const norwayRow = screen.getByRole('rowheader', { name: 'Norway' }).closest('tr')!;
    expect(within(norwayRow).getAllByText('\u2013')).toHaveLength(2);
  });

  it('compares a longer period over each country\u2019s own seasons and says which', async () => {
    const api = await import('../lib/countryInsightsApi');
    const rows = history().map((r) => (r.league_code === 'NOR' && r.season_label === '1617' ? { ...r, yellows_per_game: null } : r));
    vi.mocked(api.getCountrySummary).mockResolvedValue(rows);
    const { default: Page } = await import('../pages/football/CountryInsightsPage');
    render(<MemoryRouter><Page /></MemoryRouter>);

    await screen.findByText(/3 top flights, 2025\/26/);
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'all');
    expect(screen.getByText(/3 top flights, 2011\/12\u20132025\/26 \(all 15 seasons\)/)).toBeInTheDocument();

    const coverage = screen.getByLabelText('Seasons covered');
    expect(within(coverage).getByText(/England, Spain/)).toBeInTheDocument();
    expect(within(coverage).getByText(/Norway/).textContent).toContain('(10 seasons)');

    const norwayRow = screen.getByRole('rowheader', { name: 'Norway' }).closest('tr')!;
    expect(within(norwayRow).getByText(/2016\/17\u20132025\/26/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getAllByRole('combobox')[1], 'yellows_per_game');
    expect(screen.getByText(/Fewer seasons for this measure.*Norway 9 of 10/)).toBeInTheDocument();
  });
});
