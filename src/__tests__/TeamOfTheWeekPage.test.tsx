import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamOfTheWeekPage from '../pages/fpl/TeamOfTheWeekPage';
import * as api from '../lib/teamOfWeekApi';

vi.mock('../lib/teamOfWeekApi', async () => {
  const actual = await vi.importActual<typeof api>('../lib/teamOfWeekApi');
  return { ...actual, getTeamOfTheWeek: vi.fn(), getTotvVsModel: vi.fn(), getTotwVsModel: vi.fn() };
});
const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const p = (over: Partial<api.TotwPlayer>): api.TotwPlayer => ({
  fpl_event_id: 4, fpl_player_id: 1, web_name: 'Haaland', slug: 'haaland',
  team_name: 'Man City', position_label: 'FWD', points: 17, minutes: 90, is_mandatory: true,
  goals: 2, assists: 1, clean_sheets: 0, bonus: 3, ...over,
});

describe('TeamOfTheWeekPage', () => {
  it('explains zero overlap as variance rather than as a failed model', async () => {
    mocked.getTeamOfTheWeek.mockResolvedValue([p({})]);
    mocked.getTotwVsModel.mockResolvedValue({
      fpl_event_id: 4, actual_xi_points: 146, model_xi_actual_points: 42,
      overlap_count: 0, model_xi_projected: 43, overlap_names: null,
    });

    render(<MemoryRouter><TeamOfTheWeekPage /></MemoryRouter>);

    // Calibration is the claim the model actually makes -- 42 against a
    // projection of 43 is the meaningful number, not the overlap.
    await waitFor(() => expect(screen.getByText(/almost exactly what it expected/)).toBeInTheDocument());
    expect(screen.getByText(/None of its picks made the perfect XI/)).toBeInTheDocument();
    expect(screen.getByText(/Low overlap isn.t a failing/)).toBeInTheDocument();
  });

  it('says so plainly when the model beat its own forecast', async () => {
    mocked.getTeamOfTheWeek.mockResolvedValue([p({})]);
    mocked.getTotwVsModel.mockResolvedValue({
      fpl_event_id: 4, actual_xi_points: 146, model_xi_actual_points: 70,
      overlap_count: 3, model_xi_projected: 43, overlap_names: ['A', 'B', 'C'],
    });

    render(<MemoryRouter><TeamOfTheWeekPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/beating its own forecast/)).toBeInTheDocument());
    expect(screen.getByText(/3 of its picks/)).toBeInTheDocument();
  });

  it('shows the contribution breakdown on each marker, omitting zeros', async () => {
    mocked.getTeamOfTheWeek.mockResolvedValue([
      p({}),
      // A clean-sheet defender: no goals or assists, so the marker must
      // not read "0G 0A" -- zeros are noise on a crowded pitch.
      p({ fpl_player_id: 2, web_name: 'Keeper', slug: 'keeper', position_label: 'GKP', points: 9, goals: 0, assists: 0, clean_sheets: 1, bonus: 2 }),
    ]);
    mocked.getTotwVsModel.mockResolvedValue(null);

    render(<MemoryRouter><TeamOfTheWeekPage /></MemoryRouter>);

    // 12 points from goals reads differently from 12 off a clean sheet.
    await waitFor(() => expect(screen.getByText('2G 1A +3')).toBeInTheDocument());
    expect(screen.getByText('CS +2')).toBeInTheDocument();
  });
});
