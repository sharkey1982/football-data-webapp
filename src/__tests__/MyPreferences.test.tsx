import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyPreferences from '../pages/MyPreferences';
import { readPrefs } from '../lib/myPrefs';

vi.mock('../lib/myHomeApi', async () => ({
  ...(await vi.importActual<typeof import('../lib/myHomeApi')>('../lib/myHomeApi')),
  getMyClubOptions: vi.fn(async () => [
    { teamId: 70, name: 'Southend United', slug: 'southend-united', leagueId: 5, league: 'National League' },
    { teamId: 71, name: 'Southampton', slug: 'southampton', leagueId: 2, league: 'Championship' },
  ]),
  getIntlTeamOptions: vi.fn(async () => [{ slug: 'england', name: 'England' }]),
  getNflTeamOptions: vi.fn(async () => []),
  getTennisCountries: vi.fn(async () => ['GB']),
  searchTennisPlayers: vi.fn(async () => []),
}));

describe('Make FixtureShark yours (/my)', () => {
  beforeEach(() => localStorage.clear());

  it('picks a club, a followed club, an FPL ID and a team, and saves them', async () => {
    render(<MemoryRouter><MyPreferences /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Search clubs'), { target: { value: 'sou' } });
    fireEvent.click(await screen.findByRole('button', { name: /Southend United/ }));
    expect(screen.getByRole('button', { name: 'Remove Southend United' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Add a club'), { target: { value: 'sou' } });
    // The main club isn't offered again.
    expect(screen.queryByRole('button', { name: /^Southend United/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Southampton/ }));

    fireEvent.change(screen.getByLabelText('FPL ID'), { target: { value: '12a' } });
    expect(screen.getByText('An FPL ID is numbers only.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('FPL ID'), { target: { value: '1234567' } });

    await screen.findByRole('option', { name: 'England' });
    fireEvent.change(screen.getByLabelText('Team', { selector: '#my-intl' }), { target: { value: 'england' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saved in this browser.');
    const p = readPrefs();
    expect(p.club?.name).toBe('Southend United');
    expect(p.followed.map((c) => c.name)).toEqual(['Southampton']);
    expect(p.fplId).toBe('1234567');
    expect(p.intl).toEqual({ slug: 'england', name: 'England' });
    expect(p.openMyPage).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Clear everything' }));
    expect(readPrefs().club).toBeNull();
  });
});
