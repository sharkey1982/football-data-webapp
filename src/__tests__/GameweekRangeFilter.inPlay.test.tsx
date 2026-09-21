import React, { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import GameweekRangeFilter from '../components/fpl/GameweekRangeFilter';

afterEach(cleanup);

// A controlled harness, as the real pages use it.
function Harness({ inPlay, initialPreset = 'next5' as const }: { inPlay: { gw: number; played: number; total: number } | null; initialPreset?: 'next5' | 'this' }) {
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  return (
    <>
      <GameweekRangeFilter defaultGw={5} fromGw={from} toGw={to} onChange={(f, t) => { setFrom(f); setTo(t); }}
        initialPreset={initialPreset} presets={['this', 'next5', 'next10', 'custom']} inPlay={inPlay} />
      <output data-testid="range">{from}-{to}</output>
    </>
  );
}

describe('GameweekRangeFilter: the gameweek in play', () => {
  it('offers to include it, says how far through it is, and leaves it out by default', () => {
    render(<Harness inPlay={{ gw: 5, played: 8, total: 10 }} />);
    const box = screen.getByRole('checkbox', { name: /Include Gameweek 5/ });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/8 of 10 matches played/)).toBeInTheDocument();
    expect(screen.getByTestId('range').textContent).toBe('6-10'); // Next 5 = GW6-10
  });

  it('ticking it brings the in-play gameweek back into the current preset; unticking removes it again', () => {
    render(<Harness inPlay={{ gw: 5, played: 8, total: 10 }} />);
    const box = screen.getByRole('checkbox', { name: /Include Gameweek 5/ });
    fireEvent.click(box);
    expect(screen.getByTestId('range').textContent).toBe('5-9');
    fireEvent.click(box);
    expect(screen.getByTestId('range').textContent).toBe('6-10');
  });

  it('"This GW" means the next full gameweek while one is in play', () => {
    render(<Harness inPlay={{ gw: 5, played: 8, total: 10 }} initialPreset="this" />);
    expect(screen.getByTestId('range').textContent).toBe('6-6');
  });

  it('shows no box, and counts from the default gameweek, when nothing is in play', () => {
    render(<Harness inPlay={null} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('range').textContent).toBe('5-9');
  });
});
