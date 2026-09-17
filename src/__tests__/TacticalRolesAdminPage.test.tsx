import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TacticalRolesAdminPage from '../pages/fpl/TacticalRolesAdminPage';
import * as adminApi from '../lib/tacticalRoleAdminApi';
import * as seasonApi from '../lib/fplSeasonApi';

vi.mock('../lib/fplSeasonApi', async () => {
  const actual = await vi.importActual<typeof seasonApi>('../lib/fplSeasonApi');
  return { ...actual, getDefaultMatchweek: vi.fn() };
});
const mockedSeasonApi = seasonApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

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
    getProjectedMinutes: vi.fn(),
    getSetPieceHierarchyForTeam: vi.fn(),
    reorderSetPieceTaker: vi.fn(),
    addSetPieceTaker: vi.fn(),
    removeSetPieceTaker: vi.fn(),
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
  beforeEach(() => {
    // Sensible defaults for the projected-minutes enrichment effect --
    // it's non-critical (wrapped in a silent catch in the component), but
    // an unmocked vi.fn() returns undefined, and undefined.then() throws
    // synchronously before that catch ever runs. Individual tests can
    // still override these with a more specific mock where relevant.
    mockedSeasonApi.getDefaultMatchweek.mockResolvedValue(6);
    mockedApi.getProjectedMinutes.mockResolvedValue(new Map());
    mockedApi.getSetPieceHierarchyForTeam.mockResolvedValue(new Map());
  });

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

  it('"By Team" pitch shows the selected depth, promotes a role-matched replacement for an injured player (not just the next-ranked one), and can switch depth', async () => {
    mockedApi.getTacticalRoleReview.mockResolvedValue([
      baseRow({ fpl_player_id: 1, web_name: 'Raya', element_type: 1, tactical_role: 'GK', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      // Mirrors the real reported case exactly: Gabriel (LCB) is a
      // DIFFERENT starter at the same depth_rank as Saliba (RCB), not his
      // backup -- promoting Gabriel when Saliba is injured would be
      // wrong, since Gabriel already starts regardless. White (RB) is
      // deliberately listed BEFORE Konsa (RCB) at the same depth_rank=2,
      // to prove role-matching wins over array order, not just luck --
      // Konsa is the correct promotion (same RCB role as Saliba), not
      // whichever depth_rank=2 defender happens to come first.
      baseRow({ fpl_player_id: 2, web_name: 'JTimber', element_type: 2, tactical_role: 'RB', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 3, web_name: 'Gabriel', element_type: 2, tactical_role: 'LCB', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 4, web_name: 'Saliba', element_type: 2, tactical_role: 'RCB', depth_rank: 1, status: 'i', news: 'Knee injury', source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 5, web_name: 'White', element_type: 2, tactical_role: 'RB', depth_rank: 2, status: 'd', source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 6, web_name: 'Konsa', element_type: 2, tactical_role: 'RCB', depth_rank: 2, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 7, web_name: 'Rice', element_type: 3, tactical_role: 'DM', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 8, web_name: 'Havertz', element_type: 4, tactical_role: 'CF', depth_rank: 1, source_name: 'manual', confidence: 1 }),
    ]);
    mockedApi.getTeamOptions.mockResolvedValue([{ team_id: 1, team_name: 'Arsenal' }]);
    mockedApi.getTeamReviewDates.mockResolvedValue(new Map());
    mockedApi.getTeamFormation.mockResolvedValue('4-3-3');

    render(<TacticalRolesAdminPage />);
    await waitFor(() => expect(screen.getByText(/unassigned/)).toBeInTheDocument());

    const user = userEvent.setup();
    // All the test data is 'manual' sourced (already reviewed), so switch
    // scope to "Everyone" -- the default "Needs Review" scope only shows
    // generic-role players, which none of these are.
    await user.click(screen.getByRole('button', { name: 'Everyone' }));
    await user.click(screen.getByRole('button', { name: 'Pitch' }));
    await waitFor(() => expect(screen.getAllByText('Raya').length).toBeGreaterThan(0));

    // Gabriel and J.Timber show as their own genuine 1st-choice starters
    // (not because they're "backups" for Saliba). Saliba (injured) is
    // excluded, and Konsa -- the role-matched RCB replacement -- is
    // promoted, NOT White, even though White is listed first at the same
    // depth_rank.
    expect(document.querySelectorAll('button[title^="Gabriel"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('button[title^="JTimber"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('button[title^="Saliba"]').length).toBe(0);
    expect(document.querySelectorAll('button[title^="Konsa"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('button[title^="White"]').length).toBe(0);

    // Saliba still appears in the full-squad table (just not the pitch),
    // with his injury visible.
    expect(screen.getAllByText('Saliba').length).toBeGreaterThan(0);
    expect(screen.getByText('INJ')).toBeInTheDocument();

    // Switching to 2nd choice shows White and Konsa instead (their own
    // native 2nd-choice ranks), not Gabriel/J.Timber/Saliba.
    await user.click(screen.getByRole('button', { name: '2nd' }));
    await waitFor(() => expect(document.querySelectorAll('button[title^="White"]').length).toBeGreaterThan(0));
    expect(document.querySelectorAll('button[title^="Gabriel"]').length).toBe(0);
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
    await waitFor(() => expect(screen.getByText(/unassigned/)).toBeInTheDocument());
    // Switch scope to "Everyone" so the manually-set Saliba row is visible.
    await user.click(screen.getByRole('button', { name: 'Everyone' }));

    await waitFor(() => expect(screen.getByText('Saliba')).toBeInTheDocument());
    expect(screen.getByText('INJ')).toBeInTheDocument();
  });

  it('Table and Pitch, and Needs Review and Everyone, are independent toggles', async () => {
    mockedApi.getTacticalRoleReview.mockResolvedValue([
      baseRow({ fpl_player_id: 1, web_name: 'Raya', element_type: 1, tactical_role: 'GK', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      // Generic (still needs review) -- should be the only one visible
      // on the pitch under the default "Needs Review" scope.
      baseRow({ fpl_player_id: 2, web_name: 'Havertz', element_type: 4, tactical_role: 'CF', depth_rank: 1, source_name: 'fpl_position_fallback', confidence: 0.3 }),
    ]);
    mockedApi.getTeamOptions.mockResolvedValue([{ team_id: 1, team_name: 'Arsenal' }]);
    mockedApi.getTeamReviewDates.mockResolvedValue(new Map());
    mockedApi.getTeamFormation.mockResolvedValue('4-3-3');

    render(<TacticalRolesAdminPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText(/unassigned/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Pitch' }));
    await waitFor(() => expect(document.querySelectorAll('button[title^="Havertz"]').length).toBeGreaterThan(0));
    // Raya (already reviewed, 'manual') is excluded from the pitch under
    // the default "Needs Review" scope -- but still in the full-squad
    // table alongside it, since that table isn't scope-filtered.
    expect(document.querySelectorAll('button[title^="Raya"]').length).toBe(0);
    expect(screen.getAllByText('Raya').length).toBeGreaterThan(0);

    // Switching scope to "Everyone" brings Raya onto the pitch too,
    // while staying in Pitch display mode -- proving the two toggles are
    // independent, not coupled to a single combined mode.
    await user.click(screen.getByRole('button', { name: 'Everyone' }));
    await waitFor(() => expect(document.querySelectorAll('button[title^="Raya"]').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: 'Pitch' })).toHaveClass('bg-pitch-800');
  });

  it('full squad table can be sorted and filtered by depth, and shows projected minutes for the default matchweek', async () => {
    mockedApi.getTacticalRoleReview.mockResolvedValue([
      baseRow({ fpl_player_id: 1, web_name: 'Raya', element_type: 1, tactical_role: 'GK', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 2, web_name: 'Gabriel', element_type: 2, tactical_role: 'LCB', depth_rank: 1, source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 3, web_name: 'Kiwior', element_type: 2, tactical_role: 'RCB', depth_rank: 3, source_name: 'manual', confidence: 1 }),
    ]);
    mockedApi.getTeamOptions.mockResolvedValue([{ team_id: 1, team_name: 'Arsenal' }]);
    mockedApi.getTeamReviewDates.mockResolvedValue(new Map());
    mockedApi.getTeamFormation.mockResolvedValue('4-3-3');
    mockedSeasonApi.getDefaultMatchweek.mockResolvedValue(6);
    mockedApi.getProjectedMinutes.mockResolvedValue(new Map([[1, 87.5], [2, 90]]));

    render(<TacticalRolesAdminPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText(/unassigned/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Pitch' }));
    await waitFor(() => expect(screen.getByText('Kiwior')).toBeInTheDocument());

    // Projected minutes column shows the fetched value for the correct
    // matchweek, and a dash for a player with no projection yet.
    await waitFor(() => expect(screen.getByText(/Proj GW6/)).toBeInTheDocument());
    expect(screen.getByText('88')).toBeInTheDocument(); // Raya, rounded from 87.5
    expect(screen.getByText('90')).toBeInTheDocument(); // Gabriel

    // Filtering the full-squad table to depth 3 shows only Kiwior.
    const depthFilterSelect = screen.getByRole('combobox', { name: 'Depth' });
    await user.selectOptions(depthFilterSelect, '3rd');
    await waitFor(() => expect(screen.queryByText('Gabriel')).not.toBeInTheDocument());
    expect(screen.getByText('Kiwior')).toBeInTheDocument();
  });

  it('shows the set-piece taking order for the selected team, and lets a taker be reordered, added, and removed', async () => {
    mockedApi.getTacticalRoleReview.mockResolvedValue([
      baseRow({ fpl_player_id: 1, web_name: 'Saka', element_type: 3, tactical_role: 'RW', source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 2, web_name: 'Gyokeres', element_type: 4, tactical_role: 'CF', source_name: 'manual', confidence: 1 }),
      baseRow({ fpl_player_id: 3, web_name: 'Odegaard', element_type: 3, tactical_role: 'AM', source_name: 'manual', confidence: 1 }),
    ]);
    mockedApi.getTeamOptions.mockResolvedValue([{ team_id: 1, team_name: 'Arsenal' }]);
    mockedApi.getTeamReviewDates.mockResolvedValue(new Map());
    mockedApi.getTeamFormation.mockResolvedValue('4-3-3');
    mockedApi.getSetPieceHierarchyForTeam.mockResolvedValue(
      new Map([
        [
          'penalty',
          [
            { set_piece_hierarchy_id: 10, fpl_player_id: 1, web_name: 'Saka', rank: 1 },
            { set_piece_hierarchy_id: 11, fpl_player_id: 2, web_name: 'Gyokeres', rank: 2 },
          ],
        ],
      ]),
    );
    mockedApi.reorderSetPieceTaker.mockResolvedValue(undefined);
    mockedApi.addSetPieceTaker.mockResolvedValue(undefined);
    mockedApi.removeSetPieceTaker.mockResolvedValue(undefined);

    render(<TacticalRolesAdminPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText(/unassigned/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Everyone' }));
    await user.click(screen.getByRole('button', { name: 'Pitch' }));

    await waitFor(() => expect(screen.getByText('Set piece takers')).toBeInTheDocument());
    const setPiecePanel = screen.getByText('Set piece takers').closest('div')!.parentElement!;
    expect(within(setPiecePanel).getByText('Penalties')).toBeInTheDocument();
    // Gyokeres (rank 2) moving up swaps him with Saka (rank 1).
    const gyokeresRow = within(setPiecePanel).getByText('Gyokeres').closest('li')!;
    await user.click(within(gyokeresRow).getByTitle('Move up'));
    await waitFor(() => expect(mockedApi.reorderSetPieceTaker).toHaveBeenCalledWith(11, 1, 'penalty', 'up'));

    // Adding a taker: dropdown only offers squad players not already listed.
    const penaltyPanel = within(setPiecePanel).getByText('Penalties').closest('div')!;
    await user.click(within(penaltyPanel).getByText('+ Add taker'));
    const addSelect = within(penaltyPanel).getByRole('combobox');
    expect(within(addSelect).queryByText('Saka')).not.toBeInTheDocument(); // already listed
    expect(within(addSelect).getByText('Odegaard')).toBeInTheDocument(); // not yet listed
    await user.selectOptions(addSelect, '3');
    await user.click(within(penaltyPanel).getByText('Add'));
    await waitFor(() => expect(mockedApi.addSetPieceTaker).toHaveBeenCalledWith(1, 'penalty', 3, 'Odegaard'));

    // Removing a taker.
    const sakaRow = within(setPiecePanel).getByText('Saka').closest('li')!;
    await user.click(within(sakaRow).getByTitle('Remove'));
    await waitFor(() => expect(mockedApi.removeSetPieceTaker).toHaveBeenCalledWith(10));
  });
});
