// Audit 22 Oct 2026, S-08: one data fetch per range (the filter waits for
// the in-play gameweek), and /fpl keeps its frame while loading.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GameweekRangeFilter from '../components/fpl/GameweekRangeFilter';

vi.mock('../lib/fplSeasonApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/fplSeasonApi')>('../lib/fplSeasonApi');
  return { ...actual, getDefaultMatchweek: vi.fn(() => new Promise(() => undefined)) };
});

describe('GameweekRangeFilter waits for the in-play gameweek', () => {
  it('applies the preset once, after the in-play answer, counting from the next full week', () => {
    const onChange = vi.fn();
    const props = { defaultGw: 8, fromGw: null, toGw: null, onChange, initialPreset: 'this' as const };
    const { rerender } = render(<GameweekRangeFilter {...props} inPlay={null} inPlayLoading />);
    expect(onChange).not.toHaveBeenCalled();
    rerender(<GameweekRangeFilter {...props} inPlay={{ gw: 8, played: 3, total: 10 }} inPlayLoading={false} />);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(9, 9);
  });

  it('pages that pass no in-play state apply the preset straight away', () => {
    const onChange = vi.fn();
    render(<GameweekRangeFilter defaultGw={8} fromGw={null} toGw={null} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith(8, 8);
  });
});

describe('/fpl while loading', () => {
  it('shows the heading and a placeholder for the gameweek bar, not a bare "Loading"', async () => {
    const { default: FplFixturesList } = await import('../pages/fpl/FplFixturesList');
    const { container } = render(
      <MemoryRouter>
        <FplFixturesList />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Match Projections' })).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"].h-\\[112px\\]')).not.toBeNull();
  });
});
