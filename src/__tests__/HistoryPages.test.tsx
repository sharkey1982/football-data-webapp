import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/historyApi';
import WhatHappenedNextPage from '../pages/football/WhatHappenedNextPage';
import HistoryHubPage from '../pages/football/HistoryHubPage';
import type { HistoryHubData } from '../lib/historyApi';
import { renderHistoryHubPage } from '../entry-server';

vi.mock('../lib/historyApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/historyApi');
  return {
    ...actual,
    getLatestSeasonTable: vi.fn(),
    getWhatHappenedNext: vi.fn(),
    getTableReliability: vi.fn(),
  };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const current = (i: number): api.CurrentTeam => ({
  team_id: i, team_name: `Team ${i}`, team_slug: `team-${i}`, season_id: 13, season_label: '2627',
  played: 10, points: 30 - i, position: i, comparable_group: '20x10', clubs: 20,
});

const whn = (over: Partial<api.WhnRow>): api.WhnRow => ({
  season_id: 1, season_label: '2425', start_year: 2024, team_id: 1, team_name: 'Arsenal', team_slug: 'arsenal',
  position_at_played: 1, teams_at_played: 20, points: 25, goal_difference: 12,
  final_position: 1, final_points: 89, clubs: 20,
  champion: true, top_four: true, top_six: true, relegated: false, promoted: false, ...over,
});

const reliability: api.ReliabilityRow[] = Array.from({ length: 38 }, (_, i) => ({
  matches_played: i + 1, seasons: 31, rank_correlation: 0.3 + i * 0.018, mean_abs_position_change: Math.max(0, 5.2 - i * 0.14), same_position_share: i / 38,
}));

beforeEach(() => {
  mocked.getLatestSeasonTable.mockResolvedValue(Array.from({ length: 20 }, (_, i) => current(i + 1)));
});

describe('WhatHappenedNextPage', () => {
  it('asks by matches played in the current comparison group and shows every share with its denominator', async () => {
    mocked.getWhatHappenedNext.mockResolvedValue([
      whn({ season_id: 1 }),
      whn({ season_id: 2, season_label: '2324', start_year: 2023, team_name: 'Liverpool', final_position: 3, champion: false }),
    ]);
    render(
      <MemoryRouter initialEntries={['/football/history/what-happened-next?league=E0']}>
        <WhatHappenedNextPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('whn-answer')).toBeTruthy());
    // current season: 20 clubs -> 20x38; typical matches played 10; default position 1
    expect(mocked.getWhatHappenedNext).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: 1, played: 10, comparableGroup: '20x38', positionMin: 1, positionMax: 1 })
    );
    expect(screen.getByTestId('whn-answer').textContent).toContain('1 of 2 (50%) won the league');
    expect(screen.getByText('Liverpool')).toBeTruthy();
  });

  it('says so when nothing matches rather than showing zeros', async () => {
    mocked.getWhatHappenedNext.mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={['/football/history/what-happened-next?league=E0&mode=points&pts=90-99']}>
        <WhatHappenedNextPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/No team in a complete Premier League season matched/)).toBeTruthy());
    expect(mocked.getWhatHappenedNext).toHaveBeenCalledWith(expect.objectContaining({ pointsMin: 90, pointsMax: 99, positionMin: null }));
  });
});

describe('HistoryHubPage', () => {
  const data: HistoryHubData = { leagueCode: 'E0', comparableGroup: '20x38', reliability, leadersAfter10: { champions: 14, teamSeasons: 31 } };

  it('renders from initial data without fetching, with the checkpoints in prose', () => {
    render(
      <MemoryRouter initialEntries={['/football/history']}>
        <HistoryHubPage initialData={data} />
      </MemoryRouter>
    );
    expect(mocked.getTableReliability).not.toHaveBeenCalled();
    expect(screen.getByText(/After 10 matches the average Premier League club finishes/)).toBeTruthy();
    expect(screen.getByText(/14 of 31 \(45%\)/)).toBeTruthy();
  });

  it('server-renders the numbers into the HTML with a factual description', () => {
    const page = renderHistoryHubPage(data);
    expect(page.html).toContain('After 10 matches the average Premier League club finishes');
    expect(page.html).toContain('14 of 31 (45%)');
    expect(page.canonical).toMatch(/\/football\/history$/);
    expect(page.description).toMatch(/After 10 matches the average Premier League club finishes \d\.\d places/);
  });
});
