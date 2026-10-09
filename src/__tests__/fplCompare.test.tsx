import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../lib/currentSeason', () => ({ getCurrentFplSeasonId: vi.fn().mockResolvedValue(13) }));

function makeBuilder(rows: any[]) {
  let filtered = rows;
  const api: any = {
    select: () => api,
    eq: (col: string, val: any) => { filtered = filtered.filter((r: any) => r[col] === undefined || r[col] === val); return api; },
    in: (col: string, vals: any[]) => { filtered = filtered.filter((r: any) => vals.includes(r[col])); return api; },
    gte: (col: string, val: any) => { filtered = filtered.filter((r: any) => r[col] >= val); return api; },
    lte: (col: string, val: any) => { filtered = filtered.filter((r: any) => r[col] <= val); return api; },
    then: (resolve: any) => resolve({ data: filtered, error: null }),
  };
  return api;
}

const players = [
  { fpl_player_id: 1, slug: 'thierno-barry', web_name: 'Barry', first_name: 'Thierno', second_name: 'Barry', element_type: 4, canonical_team_id: 4, now_cost: 57, status: 'a', news: '', chance_of_playing_next_round: null, selected_by_percent: '8.5', total_points: 20, minutes: 417, expected_goals: '3.50', expected_assists: '0.40', season_id: 13 },
  { fpl_player_id: 2, slug: 'charalampos-kostoulas', web_name: 'Kostoulas', first_name: 'Charalampos', second_name: 'Kostoulas', element_type: 4, canonical_team_id: 25, now_cost: 56, status: 'a', news: '', chance_of_playing_next_round: null, selected_by_percent: '5.9', total_points: 28, minutes: 353, expected_goals: '1.35', expected_assists: '0.20', season_id: 13 },
];
const fixtures = [
  // GW6: Everton play twice (a double); Brighton once. GW7: Brighton blank.
  { fixture_id: 10, matchweek: 6, home_team_id: 4, away_team_id: 8, home_team: { display_name: 'Everton' }, away_team: { display_name: 'Hull' }, league_id: 1, season_id: 13 },
  { fixture_id: 11, matchweek: 6, home_team_id: 9, away_team_id: 4, home_team: { display_name: 'Chelsea' }, away_team: { display_name: 'Everton' }, league_id: 1, season_id: 13 },
  { fixture_id: 12, matchweek: 6, home_team_id: 12, away_team_id: 25, home_team: { display_name: 'Sunderland' }, away_team: { display_name: 'Brighton' }, league_id: 1, season_id: 13 },
  { fixture_id: 13, matchweek: 7, home_team_id: 4, away_team_id: 7, home_team: { display_name: 'Everton' }, away_team: { display_name: 'Arsenal' }, league_id: 1, season_id: 13 },
];
const projections = [
  { fpl_player_id: 1, fixture_id: 10, expected_fpl_points: 5, expected_goals: 0.6, expected_assists: 0.05, expected_minutes: 80, start_probability: 0.94, generated_at: '2026-10-09T13:59:00Z', model_version: 'leaguewide_v6', scenario_key: 'baseline' },
  { fpl_player_id: 1, fixture_id: 11, expected_fpl_points: 4, expected_goals: 0.5, expected_assists: 0.05, expected_minutes: 76, start_probability: 0.94, generated_at: '2026-10-09T13:58:00Z', model_version: 'leaguewide_v6', scenario_key: 'baseline' },
  { fpl_player_id: 1, fixture_id: 13, expected_fpl_points: 3, expected_goals: 0.3, expected_assists: 0.04, expected_minutes: 77, start_probability: 0.94, generated_at: '2026-10-09T13:57:00Z', model_version: 'leaguewide_v6', scenario_key: 'baseline' },
  { fpl_player_id: 2, fixture_id: 12, expected_fpl_points: 3.6, expected_goals: 0.34, expected_assists: 0.04, expected_minutes: 67.4, start_probability: 0.819, generated_at: '2026-10-09T13:56:00Z', model_version: 'leaguewide_v6', scenario_key: 'baseline' },
  // A row from another scenario must never be added in.
  { fpl_player_id: 2, fixture_id: 12, expected_fpl_points: 99, expected_goals: 9, expected_assists: 9, expected_minutes: 90, start_probability: 1, generated_at: '2026-10-09T13:56:00Z', model_version: 'leaguewide_v6', scenario_key: 'injury_return' },
];
const tables: Record<string, any[]> = {
  fpl_players: players,
  teams: [{ team_id: 4, display_name: 'Everton' }, { team_id: 25, display_name: 'Brighton' }],
  fixtures,
  fpl_player_projections: projections,
  fpl_fixtures: [
    { canonical_fixture_id: 10, team_h_difficulty: 2, team_a_difficulty: 4, season_id: 13 },
    { canonical_fixture_id: 11, team_h_difficulty: 3, team_a_difficulty: 4, season_id: 13 },
    { canonical_fixture_id: 12, team_h_difficulty: 3, team_a_difficulty: 3, season_id: 13 },
  ],
};

beforeEach(async () => {
  const { supabase } = await import('../lib/supabase');
  (supabase.from as any).mockImplementation((t: string) => makeBuilder(tables[t] ?? []));
  (supabase.rpc as any).mockImplementation((fn: string, args: any) => {
    if (fn === 'get_fpl_minutes_teams') return Promise.resolve({ data: [{ team_id: 4, slug: 'everton' }, { team_id: 25, slug: 'brighton' }], error: null });
    if (fn === 'get_fpl_minutes_outlook') {
      const rows = args.p_team_id === 4 ? [{ fpl_player_id: 1, first_choice: true }] : [{ fpl_player_id: 2, first_choice: false }];
      return Promise.resolve({ data: rows, error: null });
    }
    return Promise.resolve({ data: [], error: null });
  });
});

describe('getComparison', () => {
  it('adds up a double gameweek, shows a blank, keeps the picked order and ignores other scenarios', async () => {
    const { getComparison } = await import('../lib/fplCompareApi');
    const result = await getComparison(['charalampos-kostoulas', 'thierno-barry'], 6, 7);
    expect(result.map((p) => p.web_name)).toEqual(['Kostoulas', 'Barry']);

    const barry = result[1];
    expect(barry.weeks[0].fixtures).toHaveLength(2);
    expect(barry.weeks[0].xpts).toBeCloseTo(9, 10);
    expect(barry.weeks[0].fixtures.map((f) => f.fdr)).toEqual([2, 4]);
    expect(barry.totals.xpts).toBeCloseTo(12, 10);
    expect(barry.totals.fixtures).toBe(3);
    expect(barry.team_slug).toBe('everton');
    expect(barry.generated_at).toBe('2026-10-09T13:59:00Z');

    const kostoulas = result[0];
    expect(kostoulas.weeks[1].fixtures).toHaveLength(0); // GW7 blank
    expect(kostoulas.totals.xpts).toBeCloseTo(3.6, 10); // the other scenario's 99 is not added
    expect(kostoulas.totals.start).toBeCloseTo(0.819, 10);
  });

  it('parses the players parameter: lower case, unique, at most five', async () => {
    const { parsePlayersParam, per90 } = await import('../lib/fplCompareApi');
    expect(parsePlayersParam('A,b,a,c,d,e,f')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(parsePlayersParam(null)).toEqual([]);
    expect(per90(0.5, 45)).toBeCloseTo(1, 10);
    expect(per90(0.5, 30)).toBeNull();
  });
});

vi.mock('../lib/fplSeasonApi', () => ({
  getDefaultMatchweek: vi.fn().mockResolvedValue(6),
  getGameweekInPlay: vi.fn().mockResolvedValue(null),
}));

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}

describe('ComparePlayersPage', () => {
  it('shows players as columns, highlights the best in each projection row and the weekly minutes', async () => {
    const { default: Page } = await import('../pages/fpl/ComparePlayersPage');
    render(
      <MemoryRouter initialEntries={['/fpl/compare?players=thierno-barry,charalampos-kostoulas&from=6&to=7']}>
        <Routes><Route path="/fpl/compare" element={<><Page /><Where /></>} /></Routes>
      </MemoryRouter>,
    );
    const table = await screen.findByTestId('compare-table');
    expect(within(table).getByRole('link', { name: 'Barry' })).toHaveAttribute('href', '/fpl/players/thierno-barry');

    const xpts = within(table).getAllByTestId('cell-xpts');
    expect(xpts.map((c) => c.textContent)).toEqual(['12.0', '3.6']);
    expect(xpts[0].className).toContain('font-semibold');
    expect(xpts[1].className).not.toContain('font-semibold');

    // Minutes block: start chance · expected minutes per gameweek; a blank week says so.
    const mins = within(table).getAllByTestId('minutes-cell');
    expect(mins[0]).toHaveTextContent('94% · 156'); // Barry GW6 double: 80 + 76
    expect(mins[1]).toHaveTextContent('82% · 67');
    expect(within(table).getAllByText('Blank').length).toBeGreaterThan(0);
    expect(within(table).getAllByRole('link', { name: 'Minutes Outlook' })[1]).toHaveAttribute('href', '/fpl/minutes?team=brighton');

    // The range given in the URL is kept (a shared link opens on the same weeks).
    expect(screen.getByTestId('where').textContent).toContain('from=6');
    expect(screen.getByTestId('where').textContent).toContain('to=7');
  });
});
