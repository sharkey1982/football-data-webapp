import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FantasyFixtures from '../pages/FantasyFixtures';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    getLeagues: vi.fn(),
    getMostRecentFixtureSeason: vi.fn(),
    getFantasyFixtureDifficulty: vi.fn(),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('FantasyFixtures page', () => {
  it('renders a heat map ranked easiest-to-hardest for attacking picks', async () => {
    mockedApi.getLeagues.mockResolvedValue([
      { league_id: 1, code: 'E0', name: 'Premier League', country_id: 1, competition_type: 'league' },
    ]);
    mockedApi.getMostRecentFixtureSeason.mockResolvedValue({ season_id: 13, label: '2026/27' });
    mockedApi.getFantasyFixtureDifficulty.mockResolvedValue({
      fitRun: { fit_run_id: 1, league_id: 1, rho: -0.1, home_advantage: 0.3 } as any,
      ratings: [
        { team_id: 1, canonical_name: 'Arsenal', attack_strength: 0.5, defence_strength: 0.6, is_estimated: false, estimation_note: null },
        { team_id: 2, canonical_name: 'Newcastle', attack_strength: -0.4, defence_strength: -0.3, is_estimated: false, estimation_note: null },
      ],
      // Independent, non-matching fixtures deliberately chosen so attack and
      // defence rankings diverge: Arsenal has the easier match to score in
      // (higher xGF) but the harder one to keep a clean sheet in (higher
      // xGA); Newcastle is the reverse.
      teams: [
        {
          team_id: 1,
          team_name: 'Arsenal',
          fixtures: [
            {
              fixture_id: 101,
              kickoff_date: '2026-09-20',
              matchweek: 5,
              opponent_team_id: 3,
              opponent_name: 'Fulham',
              is_home: true,
              expected_goals_for: 2.4,
              expected_goals_against: 1.8,
              clean_sheet_probability: 0.16,
              opponent_attack_strength: 0,
              opponent_defence_strength: 0,
            },
          ],
        },
        {
          team_id: 2,
          team_name: 'Newcastle',
          fixtures: [
            {
              fixture_id: 102,
              kickoff_date: '2026-09-20',
              matchweek: 5,
              opponent_team_id: 4,
              opponent_name: 'Burnley',
              is_home: true,
              expected_goals_for: 0.9,
              expected_goals_against: 0.4,
              clean_sheet_probability: 0.65,
              opponent_attack_strength: 0,
              opponent_defence_strength: 0,
            },
          ],
        },
      ],
    });

    render(<FantasyFixtures />);

    await waitFor(() => expect(screen.getByText('GW5')).toBeInTheDocument());

    // Arsenal has the easier attacking fixture (higher xGF) and should rank first.
    const teamCells = screen.getAllByTestId('team-row-name');
    expect(teamCells[0]).toHaveTextContent('Arsenal');
    expect(teamCells[1]).toHaveTextContent('Newcastle');

    // The subscript next to the team name is the running total across the
    // ranking window -- with one fixture each, it's just that fixture's xGF.
    const totals = screen.getAllByTestId('team-window-total');
    expect(totals[0]).toHaveTextContent('2.4');
    expect(totals[1]).toHaveTextContent('0.9');

    // Switching to defensive focus re-ranks by expected goals conceded --
    // Newcastle's fixture is the easier one to keep a clean sheet in.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Defensive picks' }));

    await waitFor(() => {
      const reordered = screen.getAllByTestId('team-row-name');
      expect(reordered[0]).toHaveTextContent('Newcastle');
    });
    expect(screen.getAllByTestId('team-window-total')[0]).toHaveTextContent('0.4');

    // Switching to Clean sheet % shows probabilities (as %) and ranks by
    // highest clean sheet chance first; the subscript total becomes the
    // sum of probabilities across the window (expected clean sheets).
    await user.click(screen.getByRole('button', { name: 'Clean sheet %' }));

    await waitFor(() => {
      const reordered = screen.getAllByTestId('team-row-name');
      expect(reordered[0]).toHaveTextContent('Newcastle');
    });
    const cleanSheetTotals = screen.getAllByTestId('team-window-total');
    expect(cleanSheetTotals[0]).toHaveTextContent('0.7'); // 0.65 rounded to 1dp
    expect(cleanSheetTotals[1]).toHaveTextContent('0.2'); // 0.16 rounded to 1dp

    // The FDR colour toggle is disabled while Clean sheet % is selected --
    // there's no FDR equivalent for a model-derived probability.
    expect(screen.getByRole('button', { name: 'Simple FDR (1-5)' })).toBeDisabled();
  });

  it('lets "Start from GW" skip a partially-played gameweek', async () => {
    mockedApi.getLeagues.mockResolvedValue([
      { league_id: 1, code: 'E0', name: 'Premier League', country_id: 1, competition_type: 'league' },
    ]);
    mockedApi.getMostRecentFixtureSeason.mockResolvedValue({ season_id: 13, label: '2026/27' });
    mockedApi.getFantasyFixtureDifficulty.mockResolvedValue({
      fitRun: { fit_run_id: 1, league_id: 1, rho: -0.1, home_advantage: 0.3 } as any,
      ratings: [
        { team_id: 1, canonical_name: 'Arsenal', attack_strength: 0.5, defence_strength: 0.6, is_estimated: false, estimation_note: null },
      ],
      teams: [
        {
          team_id: 1,
          team_name: 'Arsenal',
          fixtures: [
            // GW4 only has this one fixture left unplayed (the rest of the
            // gameweek is already done), which is exactly the skewed-window
            // case "Start from GW" exists to let the user skip past.
            {
              fixture_id: 201,
              kickoff_date: '2026-09-13',
              matchweek: 4,
              opponent_team_id: 5,
              opponent_name: 'Everton',
              is_home: false,
              expected_goals_for: 1.1,
              expected_goals_against: 1.1,
              clean_sheet_probability: 0.3,
              opponent_attack_strength: 0,
              opponent_defence_strength: 0,
            },
            {
              fixture_id: 202,
              kickoff_date: '2026-09-20',
              matchweek: 5,
              opponent_team_id: 3,
              opponent_name: 'Fulham',
              is_home: true,
              expected_goals_for: 2.4,
              expected_goals_against: 1.8,
              clean_sheet_probability: 0.16,
              opponent_attack_strength: 0,
              opponent_defence_strength: 0,
            },
          ],
        },
      ],
    });

    render(<FantasyFixtures />);

    await waitFor(() => expect(screen.getByText('GW4')).toBeInTheDocument());
    expect(screen.getByText('GW5')).toBeInTheDocument();

    const user = userEvent.setup();
    const startGwInput = screen.getByLabelText('Start from GW');
    await user.clear(startGwInput);
    await user.type(startGwInput, '5');

    await waitFor(() => expect(screen.queryByText('GW4')).not.toBeInTheDocument());
    expect(screen.getByText('GW5')).toBeInTheDocument();
  });
});
