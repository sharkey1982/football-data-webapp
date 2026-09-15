import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SeasonPlayerTable from '../components/fpl/season/SeasonPlayerTable';
import type { SeasonPlayerProjection } from '../lib/fplSeasonApi';

function baseRow(overrides: Partial<SeasonPlayerProjection>): SeasonPlayerProjection {
  return {
    fixture_id: 1,
    matchweek: 1,
    kickoff_date: '2026-08-21',
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

describe('SeasonPlayerTable -- actual results', () => {
  it('shows a played GW1-style player with only actual data, no projection at all', () => {
    render(
      <SeasonPlayerTable
        players={[
          baseRow({
            fpl_player_id: 1,
            web_name: 'David Raya Martín',
            is_retrospective: true,
            actual_started: true,
            actual_minutes: 90,
          }),
        ]}
      />
    );

    expect(screen.getByText('David Raya Martín')).toBeInTheDocument();
    expect(screen.getByText('\u2713')).toBeInTheDocument(); // started
    expect(screen.getByText('90')).toBeInTheDocument(); // actual minutes
  });

  it('shows a substitute as "sub" rather than a checkmark', () => {
    render(
      <SeasonPlayerTable
        players={[
          baseRow({
            fpl_player_id: 2,
            web_name: 'Piero Hincapié',
            is_retrospective: true,
            actual_started: false,
            actual_minutes: 9,
          }),
        ]}
      />
    );

    expect(screen.getByText('sub')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('shows a dash for actual columns when a fixture has no actual data yet (a normal unplayed fixture)', () => {
    render(
      <SeasonPlayerTable
        players={[
          baseRow({
            fpl_player_id: 3,
            web_name: 'Future Player',
            start_probability: 0.9,
            expected_minutes: 85,
          }),
        ]}
      />
    );

    expect(screen.getByText('Future Player')).toBeInTheDocument();
    // Neither a checkmark nor "sub" should appear for this row.
    expect(screen.queryByText('\u2713')).not.toBeInTheDocument();
    expect(screen.queryByText('sub')).not.toBeInTheDocument();
  });
});
