import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SeasonPlayerTable from '../components/fpl/season/SeasonPlayerTable';
import type { SeasonPlayerProjection } from '../lib/fplSeasonApi';

function baseRow(overrides: Partial<SeasonPlayerProjection>): SeasonPlayerProjection {
  return {
    fixture_id: 1,
    matchweek: 5,
    kickoff_date: '2026-09-20',
    team_id: 1,
    team_name: 'Arsenal',
    web_name: 'Raya',
    fpl_player_id: 1,
    fpl_position: null,
    fpl_position_label: '\u2014',
    tactical_role: null,
    expected_minutes: null,
    start_probability: null,
    sub_appearance_probability: null,
    shrunk_xg90: null,
    shrunk_xa90: null,
    expected_goals: null,
    expected_assists: null,
    clean_sheet_probability: null,
    defensive_contribution_probability: null,
    experimental_expected_bonus: null,
    expected_fpl_points: null,
    xpts_appearance: null,
    xpts_goals: null,
    xpts_assists: null,
    xpts_clean_sheet: null,
    xpts_saves: null,
    xpts_defensive_contribution: null,
    xpts_cards_own_goals: null,
    xpts_bonus: null,
    xpts_goals_conceded: null,
    xpts_penalties: null,
    lineup_confidence: null,
    selected_by_percent: null,
    is_retrospective: false,
    actual_started: null,
    actual_minutes: null,
    actual_points: null,
    ...overrides,
  };
}

describe('SeasonPlayerTable -- breakdown, confidence, ownership', () => {
  it('shows selected-by%, confidence, and actual points as plain columns', () => {
    render(
      <SeasonPlayerTable
        players={[
          baseRow({
            web_name: 'Haaland',
            selected_by_percent: 72.2,
            lineup_confidence: 0.95,
            is_retrospective: true,
            actual_points: 12,
          }),
        ]}
      />
    );

    expect(screen.getByText('72.2%')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('expands a row on click to show the xPts breakdown by component, and collapses on a second click', () => {
    render(
      <SeasonPlayerTable
        players={[
          baseRow({
            web_name: 'Saka',
            expected_fpl_points: 6.1,
            xpts_appearance: 1.8,
            xpts_goals: 2.4,
            xpts_assists: 1.1,
            xpts_bonus: 0.8,
          }),
        ]}
      />
    );

    // Breakdown is not shown until the row is clicked.
    expect(screen.queryByText(/xPts breakdown by source/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Saka'));
    expect(screen.getByText(/xPts breakdown by source/)).toBeInTheDocument();
    expect(screen.getByText('2.40')).toBeInTheDocument(); // xpts_goals
    expect(screen.getByText('1.10')).toBeInTheDocument(); // xpts_assists

    fireEvent.click(screen.getByText('Saka'));
    expect(screen.queryByText(/xPts breakdown by source/)).not.toBeInTheDocument();
  });

  it('does not offer an expand affordance for a player with no breakdown data at all', () => {
    render(<SeasonPlayerTable players={[baseRow({ web_name: 'No Data Yet' })]} />);

    fireEvent.click(screen.getByText('No Data Yet'));
    expect(screen.queryByText(/xPts breakdown by source/)).not.toBeInTheDocument();
  });
});
