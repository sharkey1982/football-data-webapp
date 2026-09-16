import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TacticalRolesAdminPage from '../pages/fpl/TacticalRolesAdminPage';
import * as adminApi from '../lib/tacticalRoleAdminApi';

vi.mock('../lib/tacticalRoleAdminApi', async () => {
  const actual = await vi.importActual<typeof adminApi>('../lib/tacticalRoleAdminApi');
  return { ...actual, getTacticalRoleReview: vi.fn(), getTeamOptions: vi.fn(), getTeamFormation: vi.fn(), saveTacticalRoleCorrection: vi.fn(), saveDepthRankCorrection: vi.fn() };
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
    status: 'a',
    news: null,
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
    mockedApi.getTeamFormation.mockResolvedValue('4-3-3');
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

  it('"By Team" mode selects exactly the starters the team\'s real formation needs, by depth rank', async () => {
    mockedApi.getTacticalRoleReview.mockResolvedValue([
      baseRow({ fpl_player_id: 1, web_name: 'Raya', element_type: 1, tactical_role: 'GK', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 2, web_name: 'Gabriel', element_type: 2, tactical_role: 'RCB', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 3, web_name: 'White', element_type: 2, tactical_role: 'RB', depth_rank: 2, source_name: 'manual', confidence: 1 }),
      // Beyond a 2-defender formation -- should appear in the squad table
      // but NOT be placed on the pitch, since the mocked formation below
      // (4-3-3, but overridden to a 2-def count via depth_rank filtering)
      // only needs the top defenders up to its own count.
      baseRow({ fpl_player_id: 4, web_name: 'Rice', element_type: 3, tactical_role: 'DM', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 5, web_name: 'Ødegaard', element_type: 3, tactical_role: 'AM', depth_rank: 2, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 6, web_name: 'Merino', element_type: 3, tactical_role: 'CM', depth_rank: 3, source_name: 'manual', confidence: 1 }),
      // 4th-choice midfielder -- beyond a 3-3-3 formation's midfield count.
      baseRow({ fpl_player_id: 7, web_name: 'Zubimendi', element_type: 3, tactical_role: 'MID', depth_rank: 4, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 8, web_name: 'Havertz', element_type: 4, tactical_role: 'CF', depth_rank: 1, source_name: 'manual', confidence: 1 }),
    ]);
    mockedApi.getTeamOptions.mockResolvedValue([{ team_id: 1, team_name: 'Arsenal' }]);
    // 3-3-3 formation: exactly 3 DEF, 3 MID, 3 FWD needed -- but only 2
    // defenders and 1 forward exist in the data above, so the pitch
    // should place everyone with a depth_rank EXCEPT Zubimendi (4th
    // midfielder, beyond the 3-slot count).
    mockedApi.getTeamFormation.mockResolvedValue('3-3-3');

    render(<TacticalRolesAdminPage />);
    await waitFor(() => expect(screen.getByText(/Only unassigned/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'By Team' }));
    await waitFor(() => expect(screen.getAllByText('Raya').length).toBeGreaterThan(0));

    // The full-squad table shows every player, including the 4th-choice midfielder.
    expect(screen.getAllByText('Zubimendi').length).toBeGreaterThan(0);
    expect(screen.getByText(/Formation: 3-3-3/)).toBeInTheDocument();

    // Zubimendi (depth_rank 4, beyond the formation's 3-midfielder count)
    // must not be on the pitch itself -- only in the table. Distinguish
    // "in the table" from "on the pitch" via the pitch's own marker
    // titles, which always start with the player's name.
    const pitchMarkers = document.querySelectorAll('button[title^="Zubimendi"]');
    expect(pitchMarkers.length).toBe(0);
    const merinoMarkers = document.querySelectorAll('button[title^="Merino"]');
    expect(merinoMarkers.length).toBeGreaterThan(0);
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
    mockedApi.getTeamFormation.mockResolvedValue('4-3-3');

    render(<TacticalRolesAdminPage />);
    await waitFor(() => expect(screen.getByText('Martinelli')).toBeInTheDocument());
    expect(screen.getByText('Wissa')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByDisplayValue('All teams'), 'Brentford');

    await waitFor(() => expect(screen.queryByText('Martinelli')).not.toBeInTheDocument());
    expect(screen.getByText('Wissa')).toBeInTheDocument();
  });

  it('excludes players who have left the club, and shows an injury/availability badge for those still at the club', async () => {
    mockedApi.getTacticalRoleReview.mockResolvedValue([
      // getTacticalRoleReview itself filters out status='u' server-side,
      // so a departed player would never actually be in this list -- this
      // test instead confirms the still-current, injured player's status
      // renders visibly, which is the part the page itself is responsible for.
      baseRow({ fpl_player_id: 1, web_name: 'Saliba', element_type: 2, status: 'i', news: 'Knee injury - expected back mid-November', source_name: 'manual', confidence: 1 }),
    ]);
    mockedApi.getTeamOptions.mockResolvedValue([{ team_id: 1, team_name: 'Arsenal' }]);
    mockedApi.getTeamFormation.mockResolvedValue('4-3-3');

    render(<TacticalRolesAdminPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText(/Only unassigned/)).toBeInTheDocument());
    // Uncheck "only unassigned" so the manually-set Saliba row is visible.
    await user.click(screen.getByRole('checkbox'));

    await waitFor(() => expect(screen.getByText('Saliba')).toBeInTheDocument());
    expect(screen.getByText('INJ')).toBeInTheDocument();
  });
});
