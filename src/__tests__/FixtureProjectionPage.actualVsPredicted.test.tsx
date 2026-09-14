import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FixtureProjectionPage from '../pages/fpl/FixtureProjectionPage';
import * as fplApi from '../lib/fplApi';

vi.mock('../lib/fplApi', async () => {
  const actual = await vi.importActual<typeof fplApi>('../lib/fplApi');
  return {
    ...actual,
    getFplFixtureProjection: vi.fn(),
    getFplActualVsPredicted: vi.fn(),
  };
});

const mockedFplApi = fplApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderPage(fixtureId = '1') {
  return render(
    <MemoryRouter initialEntries={[`/fpl/fixture/${fixtureId}`]}>
      <Routes>
        <Route path="/fpl/fixture/:fixtureId" element={<FixtureProjectionPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('FixtureProjectionPage -- actual vs predicted', () => {
  it('shows actual results with no projection at all for a GW1-4 style historical fixture', async () => {
    // No projection exists for this fixture -- getFplFixtureProjection
    // returns null, matching a fixture ID not found there (the real
    // behaviour for old fixtures the current model never ran on).
    mockedFplApi.getFplFixtureProjection.mockResolvedValue(null);
    mockedFplApi.getFplActualVsPredicted.mockResolvedValue({
      fixture_id: 1,
      matchweek: 1,
      kickoff_date: '2026-08-21',
      kickoff_time: '20:00:00',
      home_team_id: 1,
      away_team_id: 7,
      home: {
        team_id: 1,
        team_name: 'Arsenal',
        players: [
          {
            fpl_player_id: 1,
            player_name: 'David Raya Martín',
            web_name: 'Raya',
            actual_started: true,
            actual_minutes: 90,
            predicted_start_probability: null,
            predicted_minutes: null,
            generated_pre_kickoff: null,
          },
        ],
      },
      away: {
        team_id: 7,
        team_name: 'Coventry City',
        players: [
          {
            fpl_player_id: 999,
            player_name: 'Carl Rushworth',
            web_name: 'Rushworth',
            actual_started: true,
            actual_minutes: 90,
            predicted_start_probability: null,
            predicted_minutes: null,
            generated_pre_kickoff: null,
          },
        ],
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Actual result')).toBeInTheDocument());
    expect(screen.getByText('Arsenal')).toBeInTheDocument();
    expect(screen.getByText('Coventry City')).toBeInTheDocument();
    expect(screen.getByText('David Raya Martín')).toBeInTheDocument();
    // No prediction column at all when nothing has a prediction.
    expect(screen.queryByText('Prediction')).not.toBeInTheDocument();
    // The disclaimer explaining formations aren't shown is expected and fine;
    // what must never appear is an actual formation-shaped value or pitch diagram.
    expect(screen.queryByText(/^\d-\d-\d$/)).not.toBeInTheDocument();
    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  it('labels a genuine pre-kickoff prediction differently from a retrospective one', async () => {
    mockedFplApi.getFplFixtureProjection.mockResolvedValue(null);
    mockedFplApi.getFplActualVsPredicted.mockResolvedValue({
      fixture_id: 40,
      matchweek: 4,
      kickoff_date: '2026-09-14',
      kickoff_time: '19:00:00',
      home_team_id: 13,
      away_team_id: 17,
      home: {
        team_id: 13,
        team_name: 'Leeds',
        players: [
          {
            fpl_player_id: 1,
            player_name: 'Genuine Forecast Player',
            web_name: 'Genuine',
            actual_started: true,
            actual_minutes: 45,
            predicted_start_probability: 0.9,
            predicted_minutes: 80,
            generated_pre_kickoff: true,
          },
        ],
      },
      away: {
        team_id: 17,
        team_name: 'Newcastle',
        players: [
          {
            fpl_player_id: 2,
            player_name: 'Retrospective Player',
            web_name: 'Retro',
            actual_started: true,
            actual_minutes: 45,
            predicted_start_probability: 0.8,
            predicted_minutes: 75,
            generated_pre_kickoff: false,
          },
        ],
      },
    });

    renderPage('40');

    await waitFor(() => expect(screen.getByText('Predicted pre-kickoff')).toBeInTheDocument());
    expect(screen.getByText('Retrospective projection')).toBeInTheDocument();
  });

  it('renders nothing extra when there is no actual data yet (a normal, unplayed fixture)', async () => {
    mockedFplApi.getFplFixtureProjection.mockResolvedValue(null);
    mockedFplApi.getFplActualVsPredicted.mockResolvedValue(null);

    renderPage('999');

    await waitFor(() => expect(screen.getByText(/No fixture found/)).toBeInTheDocument());
    expect(screen.queryByText('Actual result')).not.toBeInTheDocument();
  });

  it('does not render blank predicted-pitch panels for a played fixture with zero projections (real bug case)', async () => {
    // This is the exact real-world shape for a played fixture: the fixture
    // row exists (so getFplFixtureProjection returns an object, not null),
    // but there are zero rows in fpl_projection_frontend_feed_v6 for it,
    // so both teams' players arrays are empty.
    mockedFplApi.getFplFixtureProjection.mockResolvedValue({
      fixture_id: 31,
      kickoff_date: '2026-09-09',
      kickoff_time: '20:00:00',
      status: 'played',
      model_version: 'leaguewide_v6',
      home: { team_id: 30, team_name: 'Bournemouth', is_home: true, formation: null, formation_source_count: null, team_expected_goals: null, clean_sheet_probability: null, players: [] },
      away: { team_id: 23, team_name: 'Brentford', is_home: false, formation: null, formation_source_count: null, team_expected_goals: null, clean_sheet_probability: null, players: [] },
    });
    mockedFplApi.getFplActualVsPredicted.mockResolvedValue({
      fixture_id: 31,
      matchweek: 4,
      kickoff_date: '2026-09-09',
      kickoff_time: '20:00:00',
      home_team_id: 30,
      away_team_id: 23,
      home: {
        team_id: 30,
        team_name: 'Bournemouth',
        players: [
          { fpl_player_id: 1, player_name: 'Some Player', web_name: 'Player', actual_started: true, actual_minutes: 90, predicted_start_probability: null, predicted_minutes: null, generated_pre_kickoff: null },
        ],
      },
      away: {
        team_id: 23,
        team_name: 'Brentford',
        players: [
          { fpl_player_id: 2, player_name: 'Other Player', web_name: 'Other', actual_started: true, actual_minutes: 90, predicted_start_probability: null, predicted_minutes: null, generated_pre_kickoff: null },
        ],
      },
    });

    renderPage('31');

    await waitFor(() => expect(screen.getByText('Actual result')).toBeInTheDocument());
    // The real actual data renders correctly...
    expect(screen.getByText('Some Player')).toBeInTheDocument();
    // ...but the predicted-pitch panels (which would be entirely blank --
    // zero players -- for this fixture) must not render at all. "Home"/
    // "Away" badges only ever come from TeamProjectionPanel.
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
    expect(screen.queryByText('Away')).not.toBeInTheDocument();
    // The explanatory message should say the fixture's been played, not
    // the generic "not modelled yet" wording (which would wrongly imply
    // projections are merely pending for this match).
    expect(screen.getByText(/has been played/)).toBeInTheDocument();
  });
});
