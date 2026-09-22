import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ModelXiAccuracyPage from '../pages/fpl/ModelXiAccuracyPage';
import * as api from '../lib/modelXiApi';
import { summariseModelXi, type ModelXiWeek } from '../lib/modelXiApi';

vi.mock('../lib/modelXiApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/modelXiApi');
  return { ...actual, getModelXiHistory: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

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

beforeEach(() => vi.clearAllMocks());

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
