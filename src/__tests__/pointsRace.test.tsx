import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { buildPointsRace } from '../lib/matchesApi';
import Timelapse from '../components/Timelapse';

afterEach(cleanup);

const m = (date: string, h: number, a: number, r: 'H' | 'D' | 'A') => ({ match_date: date, home_team_id: h, away_team_id: a, full_time_result: r, home_name: `T${h}`, away_name: `T${a}` });
// Out of date order on purpose: the race must sort by date.
const matches = [
  m('2025-08-23', 2, 3, 'D'),
  m('2025-08-16', 1, 2, 'H'),
  m('2025-08-30', 3, 1, 'A'),
  m('2025-09-06', 1, 3, 'D'),
];

describe('the points race', () => {
  it('accumulates each club\u2019s points game by game, in date order', () => {
    const { frames, series } = buildPointsRace(matches, []);
    const by = Object.fromEntries(series.map((s) => [s.name, s.values]));
    expect(frames).toBe(3);
    expect(by.T1).toEqual([3, 6, 7]); // W, W, D
    expect(by.T2).toEqual([0, 1, 1]); // L, D -- carries its total when it has played fewer
    expect(by.T3).toEqual([1, 1, 2]); // D, L, D
  });

  it('applies a (negative) deduction from the first game on or after its effective date', () => {
    const { series } = buildPointsRace(matches, [{ team_id: 1, points: -6, effective_date: '2025-08-30' }]);
    expect(series.find((s) => s.name === 'T1')!.values).toEqual([3, 0, 1]);
  });

  it('applies an undated deduction at the end', () => {
    const { series } = buildPointsRace(matches, [{ team_id: 3, points: -1, effective_date: null }]);
    expect(series.find((s) => s.name === 'T3')!.values).toEqual([1, 1, 1]);
  });

  it('ends exactly where the league table does: results plus signed adjustments', () => {
    const deductions = [{ team_id: 2, points: -6, effective_date: '2025-08-20' }, { team_id: 1, points: -3, effective_date: null }];
    const { frames, series } = buildPointsRace(matches, deductions);
    // The table's rule (getLeagueTable): points from results + sum of adjustments.
    const table: Record<number, number> = {};
    for (const x of matches) {
      table[x.home_team_id] = (table[x.home_team_id] ?? 0) + (x.full_time_result === 'H' ? 3 : x.full_time_result === 'D' ? 1 : 0);
      table[x.away_team_id] = (table[x.away_team_id] ?? 0) + (x.full_time_result === 'A' ? 3 : x.full_time_result === 'D' ? 1 : 0);
    }
    for (const d of deductions) table[d.team_id] += d.points;
    for (const s of series) expect(s.values[frames - 1], s.name).toBe(table[s.id]);
  });
});

describe('the timelapse component', () => {
  const series = [
    { id: 'a', name: 'Alpha', values: [1, 2, 9] },
    { id: 'b', name: 'Bravo', values: [3, 4, 5] },
    { id: 'c', name: 'Charlie', values: [2, null, 6] },
  ];
  const renderIt = () => render(<MemoryRouter><Timelapse series={series} measure="Points" frameLabel={(i) => `Step ${i + 1}`} stepMs={500} /></MemoryRouter>);
  // (names also appear in the "Show as a table" grid, so look inside the bars)
  const bars = () => screen.getByRole('list', { name: /^Points, / });
  const top = (name: string) => Number((within(bars()).getByText(name).closest('[role="listitem"]') as HTMLElement).style.top.replace('px', ''));

  it('opens on the final frame, ranked', () => {
    renderIt();
    expect(screen.getByRole('list', { name: 'Points, Step 3' })).toBeInTheDocument();
    expect(top('Alpha')).toBeLessThan(top('Charlie'));
    expect(top('Charlie')).toBeLessThan(top('Bravo'));
  });

  it('plays from the start, reordering as values change', () => {
    vi.useFakeTimers();
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Play from the start' }));
    expect(screen.getByRole('list', { name: 'Points, Step 1' })).toBeInTheDocument();
    expect(top('Bravo')).toBeLessThan(top('Alpha'));
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole('list', { name: 'Points, Step 3' })).toBeInTheDocument();
    expect(top('Alpha')).toBeLessThan(top('Bravo')); // Alpha overtakes
    vi.useRealTimers();
  });

  it('leaves a missing value out of that frame (never zero), and respects reduced motion', () => {
    renderIt();
    fireEvent.change(screen.getByRole('slider', { name: 'Frame' }), { target: { value: '1' } });
    const charlie = within(bars()).getByText('Charlie').closest('[role="listitem"]') as HTMLElement;
    expect(charlie).toHaveAttribute('aria-hidden', 'true');
    expect(charlie.className).toMatch(/motion-reduce:transition-none/);
    expect(within(charlie).queryByText('0')).toBeNull();
  });
});
