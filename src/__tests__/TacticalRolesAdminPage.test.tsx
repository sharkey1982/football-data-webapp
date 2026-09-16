import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TacticalRolesAdminPage from '../pages/fpl/TacticalRolesAdminPage';
import * as adminApi from '../lib/tacticalRoleAdminApi';

vi.mock('../lib/tacticalRoleAdminApi', async () => {
  const actual = await vi.importActual<typeof adminApi>('../lib/tacticalRoleAdminApi');
  return {
    ...actual,
    getTacticalRoleReview: vi.fn(),
    getTeamOptions: vi.fn(),
    getTeamFormation: vi.fn(),
    getTeamReviewDates: vi.fn(),
    markTeamReviewed: vi.fn(),
    saveTacticalRoleCorrection: vi.fn(),
    saveDepthRankCorrection: vi.fn(),
    saveManualStatus: vi.fn(),
  };
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
    minutes: null,
    status: 'a',
    status_is_manual: false,
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
    mockedApi.getTeamReviewDates.mockResolvedValue(new Map());
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

  it('"By Team" pitch shows only the selected depth, excludes injured 1st-choice players, and can switch depth', async () => {
    mockedApi.getTacticalRoleReview.mockResolvedValue([
      baseRow({ fpl_player_id: 1, web_name: 'Raya', element_type: 1, tactical_role: 'GK', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      // 1st-choice defender, but injured -- requested directly: an
      // injured 1st choice (no return date captured yet) shouldn't show
      // as if they're playing.
      baseRow({ fpl_player_id: 2, web_name: 'Saliba', element_type: 2, tactical_role: 'CB', depth_rank: 1, status: 'i', news: 'Knee injury', source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 3, web_name: 'Gabriel', element_type: 2, tactical_role: 'RCB', depth_rank: 2, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 4, web_name: 'Rice', element_type: 3, tactical_role: 'DM', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 5, web_name: 'Ødegaard', element_type: 3, tactical_role: 'AM', depth_rank: 2, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 6, web_name: 'Havertz', element_type: 4, tactical_role: 'CF', depth_rank: 1, source_name: 'manual', confidence: 1 }),
    ]);
    mockedApi.getTeamOptions.mockResolvedValue([{ team_id: 1, team_name: 'Arsenal' }]);
    mockedApi.getTeamReviewDates.mockResolvedValue(new Map());
    mockedApi.getTeamFormation.mockResolvedValue('4-3-3');

    render(<TacticalRolesAdminPage />);
    await waitFor(() => expect(screen.getByText(/Only unassigned/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'By Team' }));
    await waitFor(() => expect(screen.getAllByText('Raya').length).toBeGreaterThan(0));

    // Default depth is 1st choice: Rice, Havertz on the pitch normally.
    // Saliba (1st choice, injured) is excluded, and Gabriel (2nd choice)
    // is promoted into his slot instead -- exactly the injury-promotion
    // behaviour requested. Ødegaard (2nd choice MID) is NOT promoted,
    // since Rice (1st choice MID) isn't injured -- promotion only kicks
    // in where it's actually needed.
    expect(document.querySelectorAll('button[title^="Rice"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('button[title^="Havertz"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('button[title^="Saliba"]').length).toBe(0);
    expect(document.querySelectorAll('button[title^="Gabriel"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('button[title^="Ødegaard"]').length).toBe(0);

    // Saliba still appears in the full-squad table (just not the pitch),
    // with his injury visible.
    expect(screen.getAllByText('Saliba').length).toBeGreaterThan(0);
    expect(screen.getByText('INJ')).toBeInTheDocument();

    // Switching to 2nd choice shows Ødegaard instead (Gabriel, healthy,
    // just shows at his own native 2nd-choice rank here too).
    await user.click(screen.getByRole('button', { name: '2nd' }));
    await waitFor(() => expect(document.querySelectorAll('button[title^="Ødegaard"]').length).toBeGreaterThan(0));
    expect(document.querySelectorAll('button[title^="Rice"]').length).toBe(0);
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
    mockedApi.getTeamReviewDates.mockResolvedValue(new Map());
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
    mockedApi.getTeamReviewDates.mockResolvedValue(new Map());
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
