import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TacticalRolesAdminPage from '../pages/fpl/TacticalRolesAdminPage';
import * as adminApi from '../lib/tacticalRoleAdminApi';

vi.mock('../lib/tacticalRoleAdminApi', async () => {
  const actual = await vi.importActual<typeof adminApi>('../lib/tacticalRoleAdminApi');
  return { ...actual, getTacticalRoleReview: vi.fn(), getTeamOptions: vi.fn(), saveTacticalRoleCorrection: vi.fn(), saveDepthRankCorrection: vi.fn() };
});

const mockedApi = adminApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function baseRow(overrides: Partial<adminApi.TacticalRoleRow>): adminApi.TacticalRoleRow {
  return {
    fpl_player_id: 0,
    web_name: 'Player',
    element_type: 3,
    team_id: 1,
    team_name: 'Arsenal',
    tactical_role: 'MID',
    source_name: 'fpl_position_fallback',
    confidence: 0.3,
    depth_rank: null,
    set_piece_roles: [],
    points_per_game: null,
    avg_minutes_per_start: null,
    ...overrides,
  };
}

describe('TacticalRolesAdminPage', () => {
  it('defaults to Needs Review, showing only generic-role players, and lets a role be corrected', async () => {
    mockedApi.getTacticalRoleReview.mockResolvedValue([
      baseRow({ fpl_player_id: 1, web_name: 'Martinelli', tactical_role: 'MID', source_name: 'fpl_position_fallback' }),
      baseRow({ fpl_player_id: 2, web_name: 'Ødegaard', tactical_role: 'AM', source_name: 'fantasy_football_scout', confidence: 0.8 }),
    ]);
    mockedApi.getTeamOptions.mockResolvedValue([{ team_id: 1, team_name: 'Arsenal' }]);
    mockedApi.saveTacticalRoleCorrection.mockResolvedValue(undefined);

    render(<TacticalRolesAdminPage />);

    await waitFor(() => expect(screen.getByText('Martinelli')).toBeInTheDocument());
    // Ødegaard already has a real role assigned -- hidden under the
    // default "only unassigned" filter.
    expect(screen.queryByText('Ødegaard')).not.toBeInTheDocument();

    const user = userEvent.setup();
    const select = screen.getByDisplayValue('MID');
    await user.selectOptions(select, 'LW');

    await waitFor(() => expect(mockedApi.saveTacticalRoleCorrection).toHaveBeenCalledWith(1, 1, 'LW'));
  });

  it('"By Team" mode shows a pitch built from 1st-choice players and the full squad as a table', async () => {
    mockedApi.getTacticalRoleReview.mockResolvedValue([
      baseRow({ fpl_player_id: 1, web_name: 'Raya', element_type: 1, tactical_role: 'GK', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 2, web_name: 'Gabriel', element_type: 2, tactical_role: 'RCB', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 3, web_name: 'Rice', element_type: 3, tactical_role: 'DM', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 4, web_name: 'Havertz', element_type: 4, tactical_role: 'CF', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      // Second-choice player at the same position -- should appear in the
      // squad table but NOT be placed on the pitch itself.
      baseRow({ fpl_player_id: 5, web_name: 'Merino', element_type: 3, tactical_role: 'CM', depth_rank: 2, source_name: 'manual', confidence: 1 }),
    ]);
    mockedApi.getTeamOptions.mockResolvedValue([{ team_id: 1, team_name: 'Arsenal' }]);

    render(<TacticalRolesAdminPage />);
    // Data has loaded once the team-count summary renders -- these rows
    // are all 'manual' (not generic), so correctly hidden under the
    // default "only unassigned" filter at this point; the real check is
    // after switching to By Team below.
    await waitFor(() => expect(screen.getByText(/Only unassigned/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'By Team' }));
    await waitFor(() => expect(screen.getAllByText('Raya').length).toBeGreaterThan(0));

    // The full-squad table shows every player, including the 2nd choice.
    await waitFor(() => expect(screen.getAllByText('Merino').length).toBeGreaterThan(0));
    // The pitch itself only places 1st-choice players -- confirmed via
    // the inferred formation label matching exactly the 4 non-GK starters
    // given (1 DEF-role, 1 MID-role, 1 FWD-role -> "1-1-1"), which would
    // be different if Merino (2nd choice) were included.
    expect(screen.getByText(/Inferred starting shape \(1-1-1\)/)).toBeInTheDocument();
  });
});
