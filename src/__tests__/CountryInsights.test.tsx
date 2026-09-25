import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { comparableSeasons, defaultSeason, formatValue, rankBy, seasonName, type CountryRow } from '../lib/countryInsightsApi';

const row = (country: string, code: string, season: string, over: Partial<CountryRow> = {}): CountryRow => ({
  country_id: code.length, country_name: country, league_code: code, league_name: `${country} League`, season_label: season,
  matches: 300, goals_per_game: 2.5, home_goals_per_game: 1.4, away_goals_per_game: 1.1, home_win_pct: 45, draw_pct: 25,
  away_win_pct: 30, yellows_per_game: 4, reds_per_game: 0.2, over_two_five_pct: 50, both_scored_pct: 50, nil_nil_pct: 7,
  comeback_pct: 25, points_spread: 0.4, bottom_not_losing_pct: 40, ...over,
});

const tenCountries = (season: string, matches: number) =>
  Array.from({ length: 10 }, (_, i) => row(`Country ${String.fromCharCode(65 + i)}`, `C${i}`, season, { matches }));

describe('country insights helpers', () => {
  it('only offers seasons with at least ten countries, newest first', () => {
    const rows = [...tenCountries('2526', 300), ...tenCountries('2627', 40), row('England', 'E0', '2425')];
    expect(comparableSeasons(rows)).toEqual(['2627', '2526']);
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
});
