import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ModelXiAccuracyPage from '../pages/fpl/ModelXiAccuracyPage';
import * as api from '../lib/modelXiApi';
import * as totw from '../lib/teamOfWeekApi';
import { summariseModelXi, type ModelXiWeek } from '../lib/modelXiApi';

vi.mock('../lib/modelXiApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/modelXiApi');
  return { ...actual, getModelXiHistory: vi.fn(), getModelXiPlayers: vi.fn() };
});
vi.mock('../lib/teamOfWeekApi', () => ({ getTeamOfTheWeek: vi.fn() }));
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const totwApi = totw as unknown as Record<string, ReturnType<typeof vi.fn>>;

const week = (over: Partial<ModelXiWeek> = {}): ModelXiWeek => ({
  fpl_event_id: 5,
  actual_xi_points: 150,
  model_xi_actual_points: 30,
  model_xi_projected: 61.7,
  overlap_count: 0,
  players_projected: 660,
  generated_before_deadline: false,
  deadline_time: '2026-09-18T17:30:00Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getModelXiPlayers.mockResolvedValue([
    { fpl_player_id: 1, web_name: 'Raya', team_name: 'Arsenal', position_label: 'GK', element_type: 1, projected_points: 4.8, actual_points: 1, minutes: 90, in_perfect_xi: false },
    { fpl_player_id: 2, web_name: 'Haaland', team_name: 'Man City', position_label: 'FWD', element_type: 4, projected_points: 7.2, actual_points: 6, minutes: 90, in_perfect_xi: true },
  ]);
  totwApi.getTeamOfTheWeek.mockResolvedValue([
    { fpl_event_id: 5, fpl_player_id: 2, web_name: 'Haaland', slug: 'haaland', team_name: 'Man City', position_label: 'FWD', points: 6, minutes: 90, is_mandatory: true, goals: 1, assists: 0, clean_sheets: 0, bonus: 0 },
    { fpl_event_id: 5, fpl_player_id: 9, web_name: 'Trafford', slug: 'trafford', team_name: 'Burnley', position_label: 'GK', points: 10, minutes: 90, is_mandatory: true, goals: 0, assists: 0, clean_sheets: 1, bonus: 3 },
  ]);
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ModelXiAccuracyPage />
    </MemoryRouter>,
  );
}

describe('Model XI accuracy page', () => {
  it('shows each gameweek: what the model XI scored, its forecast, and the perfect XI', async () => {
    mocked.getModelXiHistory.mockResolvedValue([week({ fpl_event_id: 4, model_xi_actual_points: 42, model_xi_projected: 43, actual_xi_points: 146, players_projected: 64 }), week()]);
    renderPage();
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('30')).toBeInTheDocument();
    expect(table.getByText('62')).toBeInTheDocument();
    expect(table.getByText('150')).toBeInTheDocument();
  });

  it('labels a week whose projections came after the deadline as retrospective', async () => {
    mocked.getModelXiHistory.mockResolvedValue([week()]);
    renderPage();
    expect(await screen.findByText(/Every week here is retrospective/)).toBeInTheDocument();
    expect(screen.getAllByText('retrospective').length).toBeGreaterThan(0);
  });

  it('calls a week with full coverage a forecast, and does not warn', async () => {
    mocked.getModelXiHistory.mockResolvedValue([week({ generated_before_deadline: true })]);
    renderPage();
    expect(await screen.findByText('forecast')).toBeInTheDocument();
    expect(screen.queryByText(/Every week here is retrospective/)).not.toBeInTheDocument();
  });

  it('flags a week whose XI came from a fragment of the league as partial', async () => {
    mocked.getModelXiHistory.mockResolvedValue([week({ players_projected: 64 })]);
    renderPage();
    expect(await screen.findByText(/· partial/)).toBeInTheDocument();
    expect(screen.getByText(/· 64 players/)).toBeInTheDocument();
  });

  it('says so plainly when no finished week has projections -- never "0 against 0"', async () => {
    mocked.getModelXiHistory.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/No finished gameweek has projections yet/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('opens a week to show the model\'s eleven beside the actual best eleven', async () => {
    const user = userEvent.setup();
    mocked.getModelXiHistory.mockResolvedValue([week()]);
    renderPage();
    const table = within(await screen.findByRole('table'));
    await user.click(table.getByText('5'));
    expect(await screen.findByText(/The model.s XI/)).toBeInTheDocument();
    expect(screen.getByText(/The week.s best XI/)).toBeInTheDocument();
    // Raya is only the model's; Trafford only the actual XI
    expect(screen.getByText(/Raya/)).toBeInTheDocument();
    expect(screen.getByText(/Trafford/)).toBeInTheDocument();
  });

  it('marks players who appear in both elevens, and counts them', async () => {
    const user = userEvent.setup();
    mocked.getModelXiHistory.mockResolvedValue([week()]);
    renderPage();
    const table = within(await screen.findByRole('table'));
    await user.click(table.getByText('5'));
    expect(await screen.findByText('1 player in both, marked ✓.')).toBeInTheDocument();
    expect(screen.getAllByText(/✓ Haaland/)).toHaveLength(2); // once on each side
  });

  it('summarises calibration: the model XI against its own forecast', () => {
    const s = summariseModelXi([
      week({ model_xi_actual_points: 30, model_xi_projected: 60 }),
      week({ fpl_event_id: 4, model_xi_actual_points: 50, model_xi_projected: 60 }),
    ]);
    expect(s.meanModelPoints).toBe(40);
    expect(s.meanProjected).toBe(60);
    expect(s.meanCalibrationGap).toBe(-20); // short of its own forecast
    expect(s.forecastWeeks).toHaveLength(0);
  });
});
