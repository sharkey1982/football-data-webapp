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

  it('"By Team" mode shows a pitch built from within-cap players and the full squad as a table', async () => {    mockedApi.getTacticalRoleReview.mockResolvedValue([
      baseRow({ fpl_player_id: 1, web_name: 'Raya', element_type: 1, tactical_role: 'GK', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 2, web_name: 'Gabriel', element_type: 2, tactical_role: 'RCB', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 3, web_name: 'Rice', element_type: 3, tactical_role: 'DM', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 4, web_name: 'Havertz', element_type: 4, tactical_role: 'CF', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      // Within the position cap (MID cap is 5) -- should appear on the
      // pitch too, not just in the table. A team needs several
      // midfielders on the pitch at once, not only the single #1-ranked
      // one -- this is exactly the bug being fixed here.
      baseRow({ fpl_player_id: 5, web_name: 'Merino', element_type: 3, tactical_role: 'CM', depth_rank: 2, source_name: 'manual', confidence: 1 }),
      // Beyond the position cap -- should appear in the squad table but
      // NOT be placed on the pitch.
      baseRow({ fpl_player_id: 6, web_name: 'Nwaneri', element_type: 3, tactical_role: 'MID', depth_rank: 6, source_name: 'manual', confidence: 1 }),
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

    // The full-squad table shows every player, including those beyond the cap.
    expect(screen.getAllByText('Nwaneri').length).toBeGreaterThan(0);
    // The pitch includes Merino (within the MID cap of 5) but not Nwaneri
    // (beyond it) -- confirmed via the inferred formation: 1 DEF-role
    // (Gabriel), 2 MID-roles (Rice + Merino), 1 FWD-role (Havertz) ->
    // "1-2-1". If Nwaneri were wrongly included this would read "1-3-1"
    // instead, and if Merino were wrongly excluded it would read "1-1-1".
    expect(screen.getByText(/Inferred starting shape \(1-2-1\)/)).toBeInTheDocument();
  });

  it('Needs Review can be filtered down to a single team', async () => {
    mockedApi.getTacticalRoleReview.mockResolvedValue([
      baseRow({ fpl_player_id: 1, web_name: 'Martinelli', team_id: 1, team_name: 'Arsenal' }),
      baseRow({ fpl_player_id: 2, web_name: 'Wissa', team_id: 2, team_name: 'Brentford' }),
    ]);
    mockedApi.getTeamOptions.mockResolvedValue([
      { team_id: 1, team_name: 'Arsenal' },
      { team_id: 2, team_name: 'Brentford' },
    ]);

    render(<TacticalRolesAdminPage />);
    await waitFor(() => expect(screen.getByText('Martinelli')).toBeInTheDocument());
    expect(screen.getByText('Wissa')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByDisplayValue('All teams'), 'Brentford');

    await waitFor(() => expect(screen.queryByText('Martinelli')).not.toBeInTheDocument());
    expect(screen.getByText('Wissa')).toBeInTheDocument();
  });
});
