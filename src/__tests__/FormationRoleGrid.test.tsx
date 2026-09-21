import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import FormationRoleGrid from '../components/fpl/FormationRoleGrid';
import { buildRoleGrid, roleOf, ROLES, type FormationSlot } from '../lib/formationApi';
import { SLOTS, GEO, NAMES } from './fixtures/formationRoles';

afterEach(cleanup);
const slots = SLOTS as FormationSlot[];
const geometry = new Map<string, Map<number, { slot: number; x_pct: number; y_pct: number }>>();
for (const [code, slot, x, y] of GEO) (geometry.get(code) ?? geometry.set(code, new Map()).get(code)!).set(slot, { slot, x_pct: x, y_pct: y });
const names = new Map(NAMES);

describe('roles from pitch position', () => {
  it('reads roles from where each slot sits', () => {
    expect(roleOf(50, 4)).toBe('Goalkeeper');
    expect(roleOf(14, 33)).toBe('Full-backs');
    expect(roleOf(38, 33)).toBe('Centre-backs');
    expect(roleOf(86, 63)).toBe('Wide players'); // 4-4-2 wide midfielder
    expect(roleOf(26, 63)).toBe('Central midfield'); // 4-3-3 midfield three
    expect(roleOf(50, 70)).toBe('No.10');
    expect(roleOf(74, 70)).toBe('Wide players'); // 4-2-3-1 wide attacking midfielder
    expect(roleOf(74, 92)).toBe('Wide players'); // 4-3-3 wide forward
    expect(roleOf(38, 92)).toBe('Strikers'); // 4-4-2 front two
  });
});

describe('the formation grid (real figures)', () => {
  it('compares the main formations, most used first, leaving out thin ones', () => {
    const g = buildRoleGrid(slots, geometry, names, 'goals');
    expect(g.formations.map((f) => f.name)).toEqual(['4-4-2', '4-4-1-1', '4-2-3-1', '4-5-1', '4-3-3']);
  });
  it('every column adds up to 100%, for goals, assists and both', () => {
    for (const m of ['goals', 'assists', 'ga'] as const) {
      const g = buildRoleGrid(slots, geometry, names, m);
      g.formations.forEach((_, i) => expect(ROLES.reduce((a, r) => a + (g.cells[r][i] ?? 0), 0)).toBeCloseTo(1, 9));
    }
  });
  it('shows the real shape of it: strikers 57% of a 4-4-2\u2019s goals, 21% of a 4-3-3\u2019s', () => {
    const g = buildRoleGrid(slots, geometry, names, 'goals');
    expect(Math.round(g.cells.Strikers[0]! * 100)).toBe(57);
    expect(Math.round(g.cells.Strikers[4]! * 100)).toBe(21);
    expect(g.cells['No.10'][0]).toBeNull(); // a 4-4-2 has no No.10
  });
});

describe('the grid on the page', () => {
  it('renders the grid with a takeaway, and filters goals / assists / both', () => {
    render(<FormationRoleGrid slots={slots} geometry={geometry} names={names} />);
    expect(screen.getByRole('heading', { name: 'Where the goals come from' })).toBeInTheDocument();
    expect(screen.getByText("Strikers: 57% of a 4-4-2's goals, 21% of a 4-3-3's.")).toBeInTheDocument();
    const table = screen.getByRole('table');
    const strikers = within(table).getByRole('rowheader', { name: 'Strikers' }).closest('tr')!;
    expect(within(strikers).getAllByRole('cell')[0]).toHaveTextContent('57%');
    fireEvent.click(screen.getByRole('button', { name: 'Assists' }));
    expect(screen.getByRole('heading', { name: 'Where the assists come from' })).toBeInTheDocument();
    expect(within(within(screen.getByRole('table')).getByRole('rowheader', { name: 'Wide players' }).closest('tr')!).getAllByRole('cell')[0]).toHaveTextContent('36%');
    fireEvent.click(screen.getByRole('button', { name: 'Goals + assists' }));
    expect(screen.getByRole('button', { name: 'Goals + assists' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('colours on one scale across the grid: the biggest share is the deepest green', () => {
    render(<FormationRoleGrid slots={slots} geometry={geometry} names={names} />);
    const cell = screen.getByTitle("Strikers, 4-4-2: 57% of the team's goals") as HTMLElement;
    expect(cell.style.backgroundColor).toBe('rgb(53, 117, 86)');
    const gk = screen.getByTitle("Goalkeeper, 4-3-3: 0% of the team's goals") as HTMLElement; // truly zero (the 4-4-2 keeper scored once: 0.3%)
    expect(gk.style.backgroundColor).toBe('rgb(243, 240, 228)');
  });
});
