import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamHistoryPanel from '../components/TeamHistoryPanel';
import * as api from '../lib/teamHistoryApi';
import { bestAndWorst, ordinal, seasonName, summariseHistory, type StandingRow } from '../lib/teamHistoryApi';

vi.mock('../lib/teamHistoryApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/teamHistoryApi')>('../lib/teamHistoryApi');
  return { ...actual, getTeamStandings: vi.fn(), getTeamMonthProfile: vi.fn() };
});
const mocked = vi.mocked(api);

// Home + away columns are built so they add up to the totals, as the view guarantees.
function season(o: Partial<StandingRow> & Pick<StandingRow, 'season_id' | 'season_label'>): StandingRow {
  return {
    league_code: 'E2', league_name: 'League One', tier: 3, position: 10, pyramid_position: 54, teams: 24,
    is_final: true, curtailed: false,
    played: 46, won: 20, drawn: 6, lost: 20, goals_for: 60, goals_against: 55, clean_sheets: 14,
    points_won: 66, deduction: 0, points: 66,
    home_played: 23, home_won: 12, home_drawn: 3, home_lost: 8, home_goals_for: 35, home_goals_against: 25, home_clean_sheets: 9, home_points: 39,
    away_played: 23, away_won: 8, away_drawn: 3, away_lost: 12, away_goals_for: 25, away_goals_against: 30, away_clean_sheets: 5, away_points: 27,
    ...o,
  };
}

const ROWS: StandingRow[] = [
  season({ season_id: 1, season_label: '1415', league_code: 'E3', league_name: 'League Two', tier: 4, position: 5, pyramid_position: 73 }),
  season({ season_id: 6, season_label: '1920', position: 22, pyramid_position: 66, teams: 23, curtailed: true,
    played: 35, won: 4, drawn: 7, lost: 24, goals_for: 39, goals_against: 85, clean_sheets: 2, points_won: 19, deduction: -12, points: 7,
    home_played: 17, home_won: 2, home_drawn: 4, home_lost: 11, home_goals_for: 20, home_goals_against: 40, home_clean_sheets: 1, home_points: 10,
    away_played: 18, away_won: 2, away_drawn: 3, away_lost: 13, away_goals_for: 19, away_goals_against: 45, away_clean_sheets: 1, away_points: 9 }),
  season({ season_id: 13, season_label: '2627', league_code: 'EC', league_name: 'National League', tier: 5, position: 2, pyramid_position: 94, is_final: false,
    played: 9, won: 6, drawn: 2, lost: 1, goals_for: 23, goals_against: 12, clean_sheets: 1, points_won: 20, points: 20,
    home_played: 4, home_won: 3, home_drawn: 0, home_lost: 1, home_goals_for: 10, home_goals_against: 6, home_clean_sheets: 0, home_points: 9,
    away_played: 5, away_won: 3, away_drawn: 2, away_lost: 0, away_goals_for: 13, away_goals_against: 6, away_clean_sheets: 1, away_points: 11 }),
];

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getTeamStandings.mockResolvedValue(ROWS);
  mocked.getTeamMonthProfile.mockResolvedValue([
    { month_num: 8, month_label: 'Aug', venue: 'away', played: 10, points: 12, ppg: 1.2 },
    { month_num: 8, month_label: 'Aug', venue: 'home', played: 9, points: 18, ppg: 2 },
    { month_num: 1, month_label: 'Jan', venue: 'home', played: 8, points: 8, ppg: 1 },
  ]);
});

describe('team history helpers', () => {
  it('names seasons and positions', () => {
    expect(seasonName('1920')).toBe('2019/20');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 112].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '112th',
    ]);
  });

  it('totals use points after deductions; home and away add up to the total', () => {
    const t = summariseHistory(ROWS, 'total');
    const h = summariseHistory(ROWS, 'home');
    const a = summariseHistory(ROWS, 'away');
    expect(t.played).toBe(46 + 35 + 9);
    expect(t.points).toBe(66 + 7 + 20); // the -12 counts
    expect(h.points + a.points).toBe(66 + 19 + 20); // venue points are as won on the pitch
    expect(h.played + a.played).toBe(t.played);
    expect(h.goalsFor + a.goalsFor).toBe(t.goalsFor);
    expect(h.cleanSheets + a.cleanSheets).toBe(t.cleanSheets);
    expect(t.divisions).toEqual(['League One', 'League Two', 'National League']);
  });

  it('best and lowest finish ignore the season in progress', () => {
    const { best, worst } = bestAndWorst(ROWS);
    expect(best?.season_label).toBe('1920'); // 66th overall beats 73rd
    expect(worst?.season_label).toBe('1415'); // not 2026/27's 94th, which is only so far
  });
});

describe('TeamHistoryPanel', () => {
  it('shows the summary, best and lowest finish, and one chart point per season', async () => {
    render(<TeamHistoryPanel teamId={70} teamName="Southend" />);
    expect(await screen.findByText(/League history/)).toHaveTextContent('3 seasons');
    expect(screen.getByText('30-15-45')).toBeInTheDocument();
    expect(screen.getByText('66th overall')).toBeInTheDocument();
    expect(screen.getByText('5th, League Two 2014/15')).toBeInTheDocument();
    expect(screen.getAllByTestId('pyramid-point')).toHaveLength(3);
  });

  it('marks the curtailed season, the deduction and the season in progress', async () => {
    render(<TeamHistoryPanel teamId={70} teamName="Southend" />);
    const table = within(await screen.findByRole('table', { name: 'Season by season' }));
    expect(table.getByTitle('Curtailed season, ranked on points per game')).toBeInTheDocument();
    expect(table.getByTitle('Points deducted')).toHaveTextContent('(-12)');
    expect(table.getByText(/so far/)).toBeInTheDocument();
  });

  it('the venue toggle switches the summary and table to home or away', async () => {
    const user = userEvent.setup();
    render(<TeamHistoryPanel teamId={70} teamName="Southend" />);
    await screen.findByText('30-15-45');
    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getByText('17-7-20')).toBeInTheDocument();
    const table = within(screen.getByRole('table', { name: 'Season by season' }));
    expect(table.queryByTitle('Points deducted')).not.toBeInTheDocument(); // deductions are a total, not a venue
    await user.click(screen.getByRole('button', { name: 'Away' }));
    expect(screen.getByText('13-8-25')).toBeInTheDocument();
  });

  it('season table sorts by clicking a header', async () => {
    const user = userEvent.setup();
    render(<TeamHistoryPanel teamId={70} teamName="Southend" />);
    const table = await screen.findByRole('table', { name: 'Season by season' });
    await user.click(within(table).getByRole('button', { name: 'GA' }));
    const first = within(table).getAllByRole('row')[1];
    expect(first).toHaveTextContent('2026/27'); // fewest conceded first
  });

  it('home v away bars: one row per season and one per month, in season order', async () => {
    render(<TeamHistoryPanel teamId={70} teamName="Southend" />);
    await screen.findByText(/League history/);
    const rows = screen.getAllByTestId('pair-row');
    expect(rows).toHaveLength(3 + 2);
    expect(rows[3]).toHaveTextContent('Aug');
    expect(rows[4]).toHaveTextContent('Jan');
    expect(rows[4]).toHaveTextContent('–'); // no away games in January in this data
  });
});
