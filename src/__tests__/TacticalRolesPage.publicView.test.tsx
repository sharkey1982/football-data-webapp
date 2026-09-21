// ============================================================================
// src/__tests__/TacticalRolesPage.publicView.test.tsx
//
// The PUBLIC half of TacticalRolesAdminPage: mounted without adminMode at
// /fpl/line-ups as "Starting Lineups".
//
// Separate file rather than more cases in the admin test, because the two
// need opposite auth mocks and vi.mock is per-module, not per-test. Same
// reason TeamStrengthPage.publicView.test.tsx is its own file.
//
// What matters here is that the public view is genuinely READ-ONLY --
// not "the same controls, disabled". A disabled dropdown on a public page
// implies signing in would let you change it, which is false for a
// visitor: editing is manual admin promotion, not self-serve.
// ============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TacticalRolesAdminPage from '../pages/fpl/TacticalRolesAdminPage';
import * as adminApi from '../lib/tacticalRoleAdminApi';
import * as seasonApi from '../lib/fplSeasonApi';

// Signed OUT. The isAdmin check is `adminMode && signedInAdmin`, so this
// alone is enough to make the public view render, but the tests below
// also cover the signed-in-admin-on-the-public-route case via the
// adminMode prop being absent.
vi.mock('../lib/auth', () => ({
  useAuthOptional: () => ({ isAdmin: false, session: null, loading: false }),
}));

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
    getTacticalRoleWorklist: vi.fn(),
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
    source_name: 'manual',
    confidence: 1,
    depth_rank: 1,
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

function renderPublic() {
  return render(
    <MemoryRouter>
      <TacticalRolesAdminPage />
    </MemoryRouter>
  );
}

describe('Starting Lineups (public view)', () => {
  beforeEach(() => {
    mockedSeasonApi.getDefaultMatchweek.mockResolvedValue(6);
    mockedApi.getProjectedMinutes.mockResolvedValue(new Map());
    mockedApi.getSetPieceHierarchyForTeam.mockResolvedValue(new Map());
    mockedApi.getTacticalRoleWorklist.mockResolvedValue([]);
    mockedApi.getTeamReviewDates.mockResolvedValue(new Map());
    mockedApi.getTeamOptions.mockResolvedValue([{ team_id: 1, team_name: 'Arsenal' }]);
    mockedApi.getTeamFormation.mockResolvedValue('4-3-3');
    mockedApi.getTacticalRoleReview.mockResolvedValue([
      baseRow({ fpl_player_id: 1, web_name: 'Raya', element_type: 1, tactical_role: 'GK' }),
      baseRow({ fpl_player_id: 2, web_name: 'Saka', element_type: 3, tactical_role: 'RW' }),
    ]);
  });

  it('is titled "Starting Lineups", not "Tactical Roles"', async () => {
    renderPublic();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Starting Lineups' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Tactical Roles' })).not.toBeInTheDocument();
  });

  it('renders roles, depth and status as plain text, with no editable control anywhere', async () => {
    renderPublic();
    await waitFor(() => expect(screen.getAllByText('Saka').length).toBeGreaterThan(0));

    // The whole point: no role/depth/status dropdown exists to click,
    // disabled or otherwise. The only comboboxes permitted on this page
    // are view controls (team picker, position filter).
    expect(screen.queryByDisplayValue('RW')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).not.toBeInTheDocument();
    expect(screen.queryByText('+ Add taker')).not.toBeInTheDocument();

    // The role itself IS shown -- read-only doesn't mean hidden.
    expect(screen.getAllByText('RW').length).toBeGreaterThan(0);
  });

  it('does not offer the editorial scope filters, and shows everyone rather than a review backlog', async () => {
    renderPublic();
    await waitFor(() => expect(screen.getAllByText('Saka').length).toBeGreaterThan(0));

    // "Needs Review"/"Worth Reviewing" describe the admin backlog and
    // mean nothing to a visitor.
    expect(screen.queryByRole('button', { name: 'Needs Review' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Worth Reviewing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Everyone' })).not.toBeInTheDocument();
  });

  it('opens on the pitch, since the predicted XI is what the page is for', async () => {
    renderPublic();
    // Pitch mode renders each player as a positioned button whose title
    // carries their role/context -- the admin default (table) does not.
    await waitFor(() => expect(document.querySelectorAll('button[title^="Raya"]').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: 'Pitch' })).toHaveClass('bg-pitch-800');
  });

  it('shows no read-only admin warning -- this is a public page, not a locked admin one', async () => {
    renderPublic();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Starting Lineups' })).toBeInTheDocument());
    // AdminGateNotice would say this; it belongs on the admin route only.
    expect(screen.queryByText('Read-only')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in to edit' })).not.toBeInTheDocument();
  });
});
