import React from 'react';
void React;
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import LastManStandingPage from '../pages/admin/LastManStandingPage';
import { buildProblem, type LmsData, type LmsFixture } from '../lib/lastManStandingApi';
import fixtures2627 from './data/lmsFixtures2627.json';

let admin = true;
vi.mock('../lib/auth', () => ({
  useAuthOptional: () => ({ isAdmin: admin, session: admin ? { user: { email: 'admin@example.com' } } : null, loading: false }),
}));
vi.mock('../lib/currentSeason', () => ({ getCurrentSeasonId: () => Promise.resolve(13) }));

const data: LmsData = { fixtures: fixtures2627 as LmsFixture[], prices: new Map() };
vi.mock('../lib/lastManStandingApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/lastManStandingApi')>('../lib/lastManStandingApi');
  return { ...actual, loadLmsData: vi.fn(() => Promise.resolve(data)) };
});

function renderAt(url: string) {
  return render(<MemoryRouter initialEntries={[url]}><LastManStandingPage /></MemoryRouter>);
}

describe('buildProblem', () => {
  it('gives every team one cell per gameweek from the chosen start', () => {
    const p = buildProblem(data, 7, 'market');
    expect(p.rounds[0]).toBe(7);
    expect(p.teams).toHaveLength(20);
    p.cells.forEach((row) => expect(row.filter(Boolean)).toHaveLength(20));
    const ars = p.teams.findIndex((t) => t.name === 'Arsenal');
    expect(p.cells[0][ars]?.opponent).toBe("Nott'm Forest");
    expect(p.cells[0][ars]?.home).toBe(false);
  });
  it('leaves a postponed or played fixture out of its round', () => {
    const fx = (fixtures2627 as LmsFixture[]).map((f) => (f.matchweek === 6 && f.homeName === 'Arsenal' ? { ...f, status: 'postponed' } : f));
    const p = buildProblem({ fixtures: fx, prices: new Map() }, 6, 'market');
    const ars = p.teams.findIndex((t) => t.name === 'Arsenal');
    expect(p.cells[0][ars]).toBeNull();
  });
  it('uses a posted price in place of ratings', () => {
    const f = (fixtures2627 as LmsFixture[])[0];
    const p = buildProblem({ fixtures: fixtures2627 as LmsFixture[], prices: new Map([[f.fixtureId, { fixtureId: f.fixtureId, home: 0.6, draw: 0.25, away: 0.15, capturedAt: '' }]]) }, 6, 'market');
    const h = p.teams.findIndex((t) => t.id === f.homeId);
    expect(p.cells[0][h]).toMatchObject({ p: 0.6, source: 'price' });
  });
});

describe('LastManStandingPage', () => {
  it('refuses non-admins', () => {
    admin = false;
    renderAt('/admin/last-man-standing');
    expect(screen.getByText('This page is for admins.')).toBeInTheDocument();
    admin = true;
  });

  it('recommends saving Arsenal in GW6 and shows the path and matrix', async () => {
    renderAt('/admin/last-man-standing?n0=4000');
    const best = await screen.findByTestId('best-1', {}, { timeout: 20000 });
    expect(best.querySelector('p.text-lg')?.textContent).toMatch(/^Man United v Tottenham 56\.0%/);
    expect(best.textContent).toMatch(/Arsenal are 12\.6 pts more likely/);
    expect(screen.getByTestId('lms-path').textContent).toMatch(/Arsenal/);
    expect(screen.getByTestId('lms-matrix')).toBeInTheDocument();
  }, 30000);

  it('a used team is not offered, and three entries get a spread table', async () => {
    renderAt('/admin/last-man-standing?n0=4000&entries=3');
    await screen.findByTestId('best-3', {}, { timeout: 20000 });
    expect(screen.getByTestId('lms-spreads')).toBeInTheDocument();
    const mun = screen.getAllByRole('button', { name: 'Man United' })[0];
    await userEvent.click(mun);
    await waitFor(() => expect(screen.getByTestId('best-1').querySelector('p.text-lg')?.textContent).not.toMatch(/^Man United/), { timeout: 20000 });
    expect(within(screen.getByTestId('lms-candidates-1')).queryByText('Man United')).toBeNull();
  }, 40000);
  it('pasted pick counts set the field: entrants, fitted favouritism and the teams the field has used', async () => {
    renderAt('/admin/last-man-standing?gw=7');
    await screen.findByTestId('lms-field', {}, { timeout: 20000 });
    await userEvent.selectOptions(screen.getByTestId('lms-field-gw'), '6');
    await userEvent.type(screen.getByTestId('lms-field-text'), 'Game Week 1{enter}Arsenal 1802{enter}Chelsea 843{enter}Man Utd 640{enter}Spurs 23{enter}Wolves 3');
    await userEvent.click(screen.getByRole('button', { name: 'Add round' }));
    expect(screen.getByTestId('lms-field-msg').textContent).toMatch(/GW6: 3,308 picks on 4 teams\. Not recognised, left out: Wolves/);
    const rounds = await screen.findByTestId('lms-field-rounds');
    expect(rounds.textContent).toMatch(/3,308/);
    expect(rounds.textContent).toMatch(/still to play/);
    expect(screen.getByTestId('lms-field-fit').textContent).toMatch(/Favouritism fitted to 3,308 picks over 1 round/);
    expect(screen.getByTestId('lms-field-used').textContent).toMatch(/has used \(expected, results to come\): Arsenal/);
    // entrants at start now come from the pasted round
    expect((screen.getByLabelText('Entrants at start') as HTMLInputElement).value).toBe('3308');
    await screen.findByTestId('best-1', {}, { timeout: 20000 });
    await userEvent.click(screen.getByRole('button', { name: 'Remove GW6' }));
    expect(screen.queryByTestId('lms-field-rounds')).toBeNull();
  }, 40000);
});
