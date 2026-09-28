import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProjectionSummary from '../components/fpl/ProjectionSummary';
import type { FplFixtureProjection } from '../lib/fplApi';

const base = (source: 'market' | 'model'): FplFixtureProjection => ({
  fixture_id: 1,
  kickoff_date: '2026-10-10',
  kickoff_time: '15:00:00',
  status: 'scheduled',
  model_version: 'leaguewide_v6',
  team_goals_source: source,
  home: { team_id: 1, team_name: 'Chelsea', is_home: true, formation: null, formation_source_count: null,
    team_expected_goals: source === 'market' ? 1.94 : 1.72, model_expected_goals: 1.72, clean_sheet_probability: null, players: [] },
  away: { team_id: 2, team_name: 'Bournemouth', is_home: false, formation: null, formation_source_count: null,
    team_expected_goals: source === 'market' ? 1.14 : 1.64, model_expected_goals: 1.64, clean_sheet_probability: null, players: [] },
});

describe('ProjectionSummary: where the expected goals come from', () => {
  it('market goals: shows them, says the player numbers use them, and gives the model beside', () => {
    render(<ProjectionSummary projection={base('market')} />);
    expect(screen.getByText('1.940')).toBeInTheDocument();
    expect(screen.getByText('1.140')).toBeInTheDocument();
    const note = screen.getByTestId('goals-source').textContent ?? '';
    expect(note).toMatch(/betting-market prices; the player numbers below use these/);
    expect(note).toMatch(/own model has 1\.72–1\.64/);
  });

  it('model goals: says so, with no comparison', () => {
    render(<ProjectionSummary projection={base('model')} />);
    expect(screen.getByText('1.720')).toBeInTheDocument();
    const note = screen.getByTestId('goals-source').textContent ?? '';
    expect(note).toMatch(/this site’s own model; the player numbers below use these/);
    expect(note).not.toMatch(/betting-market/);
  });
});
