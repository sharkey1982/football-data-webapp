import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SquadPitch from '../components/fpl/SquadPitch';
import BenchStrip from '../components/fpl/BenchStrip';
import type { FplOptimizerPlayer } from '../lib/fplOptimizerApi';

const player = (over: Partial<FplOptimizerPlayer>): FplOptimizerPlayer =>
  ({
    id: 1,
    name: 'Player',
    team: 'Arsenal',
    position: 3,
    price: 5.0,
    total_xpts: 5,
    avg_appearance_probability: 0.9,
    gw_xpts: { 5: 6 },
    gw_opponent: { 5: { team: 'Chelsea', is_home: true } },
    ...over,
  }) as FplOptimizerPlayer;

const xi = [
  player({ id: 1, name: 'GK1', position: 1, price: 5.5 }),
  player({ id: 2, name: 'CB1', position: 2, price: 4.5 }),
  player({ id: 3, name: 'MID1', position: 3, price: 12.5 }),
  player({ id: 4, name: 'FWD1', position: 4, price: 14.0, gw_opponent: { 5: { team: 'Everton', is_home: false } } }),
];

describe('squad pitch', () => {
  it('shows each player\'s price, not just his points', () => {
    render(<SquadPitch starters={xi} formation="4-4-2" matchweek={5} captainName="MID1" viceCaptainName="FWD1" />);
    expect(screen.getByText('£14.0m')).toBeInTheDocument();
    expect(screen.getByText('£12.5m')).toBeInTheDocument();
    expect(screen.getByText('£4.5m')).toBeInTheDocument();
  });

  it('still shows the opponent and points alongside it', () => {
    render(<SquadPitch starters={xi} formation="4-4-2" matchweek={5} captainName="MID1" viceCaptainName="FWD1" />);
    expect(screen.getAllByText(/6\.0 pts/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^v/).length).toBeGreaterThan(0);
  });
});

describe('bench', () => {
  const bench = [
    player({ id: 11, name: 'BenchGK', position: 1, price: 4.0 }),
    player({ id: 12, name: 'BenchMID', position: 3, price: 4.5, gw_opponent: { 5: { team: 'Spurs', is_home: false } } }),
  ];

  it('names who each bench player faces that week -- an auto-sub\'s fixture is the point of the order', () => {
    render(<BenchStrip bench={bench} benchOrder={['BenchMID']} matchweek={5} />);
    expect(screen.getByText(/@ Spurs/)).toBeInTheDocument();
    expect(screen.getByText(/v Chelsea/)).toBeInTheDocument();
  });

  it('keeps the price alongside it', () => {
    const { container } = render(<BenchStrip bench={bench} benchOrder={['BenchMID']} matchweek={5} />);
    expect(container.textContent).toMatch(/£4\.5m/);
  });

  it('renders without a week, showing no opponent rather than breaking', () => {
    render(<BenchStrip bench={bench} benchOrder={['BenchMID']} />);
    expect(screen.getByText('BenchMID')).toBeInTheDocument();
    expect(screen.queryByText(/Spurs/)).not.toBeInTheDocument();
  });
});
